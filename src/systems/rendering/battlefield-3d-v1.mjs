import * as THREE from 'three';

// ---------- v1.3.0: experimental 3D battlefield renderer ----------
const source = window.NRTS_3D_SOURCE;
const app = document.getElementById('app');
const canvas2d = document.getElementById('game');

if (!source || !app || !canvas2d) {
  throw new Error('3D battlefield renderer requires the simulation bridge and game canvas.');
}

const staticWorld = source.staticWorld();
const WORLD = staticWorld.world;
const canvas = document.createElement('canvas');
canvas.id = 'battlefield3d';
canvas.className = 'battlefield-3d-canvas';
canvas.setAttribute('aria-label', 'Napoleonic RTS 3D battlefield');
canvas.tabIndex = 0;
app.insertBefore(canvas, canvas2d.nextSibling);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
} catch (error) {
  // Keep the 2D canvas accessible if a phone/browser cannot start WebGL.
  canvas.remove();
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cb2bf);
scene.fog = new THREE.FogExp2(0xa8b7b8, 0.00023);

const camera3d = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 1, 9500);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const rayHit = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempEuler = new THREE.Euler();

let enabled = true;
let cameraDistance = 760;
let cameraAzimuth = 0;
let renderFrame = 0;
let lastSnapshot = null;
let rightDrag = null;
const touchPointers = new Map();
let touchGesture = null;
let suppressTouchTap = false;
let lastResourceSignature = '';

const colors = {
  grass: 0x667952,
  roadMain: 0xb6a279,
  roadSecondary: 0x9b7c54,
  roadTrack: 0x76583b,
  french: 0x2855a5,
  british: 0xa63b35,
  selected: 0xf4d86d,
  wood: 0x315b35,
  trunk: 0x5b4330,
  field: 0x738259,
  stone: 0x958675,
  plaster: 0xc7b79b,
  barn: 0x735343,
  roof: 0x6d4a39,
  water: 0x5f8191
};

scene.add(new THREE.HemisphereLight(0xdde7ed, 0x4b5238, 2.2));
const sun = new THREE.DirectionalLight(0xfff0cf, 2.0);
sun.position.set(-900, 1600, 700);
scene.add(sun);

function hillHeightAt(x, z) {
  let height = Math.sin(x * 0.0041) * 2.4 + Math.sin(z * 0.0057 + 1.1) * 2.0;
  for (const hill of staticWorld.hills || []) {
    const rx = Math.max(1, hill.rx || hill.w / 2 || 1);
    const rz = Math.max(1, hill.ry || hill.h / 2 || 1);
    const dx = (x - hill.x) / rx;
    const dz = (z - hill.y) / rz;
    const q = dx * dx + dz * dz;
    if (q < 1) height += (1 - q) * (1 - q) * 34;
  }
  return height;
}

function buildTerrain() {
  const geometry = new THREE.PlaneGeometry(WORLD.width, WORLD.height, 76, 46);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const worldX = pos.getX(i) + WORLD.width / 2;
    const worldZ = pos.getZ(i) + WORLD.height / 2;
    pos.setY(i, hillHeightAt(worldX, worldZ));
  }
  geometry.translate(WORLD.width / 2, 0, WORLD.height / 2);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: colors.grass, roughness: 1, metalness: 0 });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'battlefield-terrain';
  scene.add(terrain);
}

function buildRoads() {
  const roadGroup = new THREE.Group();
  roadGroup.name = 'roads-3d';
  const materials = {
    chaussee: new THREE.MeshStandardMaterial({ color: colors.roadMain, roughness: 1 }),
    secondary: new THREE.MeshStandardMaterial({ color: colors.roadSecondary, roughness: 1 }),
    track: new THREE.MeshStandardMaterial({ color: colors.roadTrack, roughness: 1 })
  };

  for (const road of staticWorld.roads || []) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const dx = b.x - a.x;
      const dz = b.y - a.y;
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const geometry = new THREE.BoxGeometry(length, 0.8, Math.max(9, road.width));
      const segment = new THREE.Mesh(geometry, materials[road.roadClass] || materials.secondary);
      const mx = (a.x + b.x) / 2;
      const mz = (a.y + b.y) / 2;
      segment.position.set(mx, (hillHeightAt(mx, mz) + 1.2), mz);
      segment.rotation.y = -Math.atan2(dz, dx);
      segment.userData.roadId = road.id;
      roadGroup.add(segment);
    }
  }
  scene.add(roadGroup);
}

function housePalette(kind) {
  if (kind === 'barn') return { wall: colors.barn, roof: 0x594038 };
  if (kind === 'chapel') return { wall: colors.stone, roof: 0x55514c };
  if (kind === 'inn') return { wall: 0xb7a181, roof: 0x714837 };
  if (kind === 'farmhouse') return { wall: 0xb6a287, roof: 0x684435 };
  return { wall: colors.plaster, roof: colors.roof };
}

function addHouse3D(house, parent) {
  const palette = housePalette(house.kind);
  const bodyHeight = house.kind === 'chapel' ? 23 : house.kind === 'barn' ? 17 : 15;
  const roofHeight = house.kind === 'chapel' ? 13 : 9;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(house.w, bodyHeight, house.h),
    new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1 })
  );
  body.position.y = bodyHeight / 2;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 4),
    new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.95 })
  );
  roof.scale.set(house.w * 0.72, roofHeight, house.h * 0.72);
  roof.position.y = bodyHeight + roofHeight / 2;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  if (house.kind === 'chapel') {
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(10, 25, 10),
      new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1 })
    );
    tower.position.set(-house.w * 0.27, bodyHeight + 6, 0);
    group.add(tower);
  }

  group.position.set(house.x, hillHeightAt(house.x, house.y), house.y);
  group.rotation.y = -(house.angle || 0);
  group.userData.sceneryId = house.id;
  parent.add(group);
}

function buildVillages() {
  const group = new THREE.Group();
  group.name = 'villages-3d';
  for (const village of staticWorld.villages || []) {
    for (const house of village.houses || []) addHouse3D(house, group);
  }
  scene.add(group);
}

function buildFieldPatches() {
  const group = new THREE.Group();
  group.name = 'terrain-patches-3d';
  const material = new THREE.MeshStandardMaterial({ color: colors.field, roughness: 1 });
  for (const woods of staticWorld.woods || []) {
    const w = Math.max(20, woods.w || 80);
    const h = Math.max(20, woods.h || 80);
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, h), material);
    const x = woods.x + w / 2;
    const z = woods.y + h / 2;
    patch.position.set(x, hillHeightAt(x, z) + 0.25, z);
    group.add(patch);
  }
  scene.add(group);
}

buildTerrain();
buildFieldPatches();
buildRoads();
buildVillages();

const unitMeshes = new Map();
const buildingMeshes = new Map();
let treeTrunks = null;
let treeCrowns = null;

function unitGeometry(type) {
  switch (type) {
    case 'cavalry': return new THREE.BoxGeometry(8, 10, 15);
    case 'artillery': return new THREE.BoxGeometry(15, 5, 8);
    case 'officer': return new THREE.BoxGeometry(6, 15, 6);
    case 'drummer': return new THREE.CylinderGeometry(4, 4, 12, 8);
    case 'worker': return new THREE.CylinderGeometry(3.5, 4.5, 10, 7);
    default: return new THREE.BoxGeometry(5.5, 13, 6);
  }
}

function baseUnitColor(side, type) {
  if (type === 'worker') return side === 'france' ? 0x6a7da4 : 0xa26d68;
  if (type === 'artillery') return side === 'france' ? 0x314b77 : 0x6e3632;
  if (type === 'drummer') return side === 'france' ? 0x4a6eb2 : 0xc55c51;
  return side === 'france' ? colors.french : colors.british;
}

function ensureUnitMesh(key, type) {
  if (unitMeshes.has(key)) return unitMeshes.get(key);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  const mesh = new THREE.InstancedMesh(unitGeometry(type), material, 1400);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.userData.units = [];
  scene.add(mesh);
  unitMeshes.set(key, mesh);
  return mesh;
}

function updateUnits(snapshot) {
  const grouped = new Map();
  for (const unit of snapshot.units || []) {
    const key = `${unit.side}:${unit.type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(unit);
  }
  const selectedIds = new Set(snapshot.selection?.unitIds || []);

  for (const [key, mesh] of unitMeshes) {
    if (!grouped.has(key)) {
      mesh.count = 0;
      mesh.userData.units = [];
    }
  }

  for (const [key, items] of grouped) {
    const [side, type] = key.split(':');
    const mesh = ensureUnitMesh(key, type);
    mesh.count = Math.min(items.length, 1400);
    mesh.userData.units = items.slice(0, mesh.count);
    for (let i = 0; i < mesh.count; i++) {
      const unit = items[i];
      const y = hillHeightAt(unit.x, unit.y);
      const verticalOffset = type === 'artillery' ? 3.2 : type === 'cavalry' ? 5.5 : 6.5;
      tempPosition.set(unit.x, y + verticalOffset, unit.y);
      tempEuler.set(0, -(unit.facing || 0), 0);
      tempQuaternion.setFromEuler(tempEuler);
      tempScale.set(1, 1, 1);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      mesh.setMatrixAt(i, tempMatrix);
      mesh.setColorAt(i, new THREE.Color(selectedIds.has(unit.id) ? colors.selected : baseUnitColor(side, type)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

const buildingSize = {
  towncenter: { w: 94, h: 78, y: 31 },
  barracks: { w: 82, h: 60, y: 25 },
  house: { w: 56, h: 50, y: 21 },
  stable: { w: 86, h: 62, y: 24 },
  foundry: { w: 82, h: 62, y: 24 }
};

function createGameplayBuilding(building) {
  const size = buildingSize[building.type] || { w: 64, h: 52, y: 22 };
  const group = new THREE.Group();
  const sideColor = building.side === 'france' ? 0xb9b0a0 : 0xbda89a;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size.w, size.y, size.h),
    new THREE.MeshStandardMaterial({ color: sideColor, roughness: 1 })
  );
  body.position.y = size.y / 2;
  group.add(body);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 4),
    new THREE.MeshStandardMaterial({ color: building.side === 'france' ? 0x4a5869 : 0x6f4139, roughness: 0.95 })
  );
  roof.scale.set(size.w * 0.72, 12, size.h * 0.72);
  roof.position.y = size.y + 6;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  group.userData.buildingId = building.id;
  scene.add(group);
  buildingMeshes.set(building.id, group);
  return group;
}

function updateBuildings(snapshot) {
  const liveIds = new Set();
  for (const building of snapshot.buildings || []) {
    liveIds.add(building.id);
    const group = buildingMeshes.get(building.id) || createGameplayBuilding(building);
    group.position.set(building.x, hillHeightAt(building.x, building.y), building.y);
    const selected = snapshot.selection?.buildingId === building.id;
    group.scale.setScalar(selected ? 1.06 : building.complete ? 1 : 0.82);
  }
  for (const [id, group] of buildingMeshes) {
    if (liveIds.has(id)) continue;
    scene.remove(group);
    buildingMeshes.delete(id);
  }
}

function resourceSignature(resources) {
  return `${resources.length}:${resources.slice(0, 12).map(r => `${r.id}:${Math.round(r.amount || 0)}`).join('|')}`;
}

function rebuildTrees(resources) {
  if (treeTrunks) scene.remove(treeTrunks);
  if (treeCrowns) scene.remove(treeCrowns);
  const trees = resources.filter(resource => resource.type === 'wood').slice(0, 700);
  if (!trees.length) return;

  treeTrunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.8, 2.3, 13, 6),
    new THREE.MeshStandardMaterial({ color: colors.trunk, roughness: 1 }),
    trees.length
  );
  treeCrowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(8.5, 20, 7),
    new THREE.MeshStandardMaterial({ color: colors.wood, roughness: 1 }),
    trees.length
  );
  treeTrunks.frustumCulled = false;
  treeCrowns.frustumCulled = false;

  trees.forEach((tree, i) => {
    const baseY = hillHeightAt(tree.x, tree.y);
    tempPosition.set(tree.x, baseY + 6.5, tree.y);
    tempQuaternion.identity();
    tempScale.set(1, 1, 1);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    treeTrunks.setMatrixAt(i, tempMatrix);
    tempPosition.set(tree.x, baseY + 19, tree.y);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    treeCrowns.setMatrixAt(i, tempMatrix);
  });
  treeTrunks.instanceMatrix.needsUpdate = true;
  treeCrowns.instanceMatrix.needsUpdate = true;
  scene.add(treeTrunks, treeCrowns);
}

function updateResources() {
  if (renderFrame % 90 !== 1) return;
  const resources = source.resources();
  const signature = resourceSignature(resources);
  if (signature === lastResourceSignature) return;
  lastResourceSignature = signature;
  rebuildTrees(resources);
}

function updateCamera() {
  const simCamera = source.camera();
  const centerX = Math.max(0, Math.min(WORLD.width, simCamera.x));
  const centerZ = Math.max(0, Math.min(WORLD.height, simCamera.y));
  const back = cameraDistance * 0.78;
  const height = cameraDistance * 0.82;
  camera3d.position.set(
    centerX + Math.sin(cameraAzimuth) * back,
    height,
    centerZ + Math.cos(cameraAzimuth) * back
  );
  camera3d.lookAt(centerX, hillHeightAt(centerX, centerZ), centerZ);
}

function pointerToRay(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera3d);
}

function groundPointFromEvent(event) {
  pointerToRay(event);
  if (!raycaster.ray.intersectPlane(groundPlane, rayHit)) return null;
  return {
    x: Math.max(0, Math.min(WORLD.width, rayHit.x)),
    y: Math.max(0, Math.min(WORLD.height, rayHit.z))
  };
}

function selectUnitFromEvent(event) {
  pointerToRay(event);
  const meshes = [...unitMeshes.values()].filter(mesh => mesh.count > 0);
  const hits = raycaster.intersectObjects(meshes, false);
  const hit = hits.find(candidate => Number.isInteger(candidate.instanceId));
  if (!hit) return false;
  const unit = hit.object.userData.units?.[hit.instanceId];
  if (!unit?.regimentId) {
    source.setStatus('3D prototype: losse eenheden selecteer je voorlopig via de 2D-weergave.');
    return false;
  }
  const ok = source.dispatch({ type: 'select-group', id: unit.regimentId });
  if (ok) source.setStatus('3D: regiment geselecteerd. Rechtsklik op het terrein om te bewegen.');
  return ok;
}

function selectTouchTarget(event) {
  // Mesh ray hits require pixel-perfect taps. Use a screen-space radius for fingers.
  const state = source.snapshot();
  let closest = null;
  let distance = 30;
  for (const unit of state?.units || []) {
    if (unit.side !== 'france') continue;
    const projected = new THREE.Vector3(unit.x, hillHeightAt(unit.x, unit.y) + 8, unit.y).project(camera3d);
    if (projected.z < -1 || projected.z > 1) continue;
    const x = (projected.x + 1) * canvas.clientWidth / 2;
    const y = (1 - projected.y) * canvas.clientHeight / 2;
    const d = Math.hypot(x - event.clientX, y - event.clientY);
    if (d < distance) { closest = unit; distance = d; }
  }
  if (!closest) return false;
  if (closest.regimentId) return source.dispatch({ type: 'select-group', id: closest.regimentId });
  return source.dispatch({ type: 'select-point', x: closest.x, y: closest.y });
}

function touchPair() {
  const [a, b] = [...touchPointers.values()];
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}

canvas.addEventListener('pointerdown', event => {
  if (!enabled || event.pointerType !== 'touch') return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY, moved: false });
  if (touchPointers.size === 2) {
    const pair = touchPair();
    touchGesture = { ...pair, zoom: cameraDistance, anchor: groundPointFromEvent({ clientX: pair.x, clientY: pair.y }) };
    suppressTouchTap = true;
  }
});
canvas.addEventListener('pointermove', event => {
  if (!enabled || event.pointerType !== 'touch') return;
  const point = touchPointers.get(event.pointerId);
  if (!point) return;
  event.preventDefault();
  point.x = event.clientX; point.y = event.clientY;
  if (Math.hypot(point.x - point.sx, point.y - point.sy) > 12) point.moved = true;
  const pair = touchPair();
  if (!pair || !touchGesture) return;
  cameraDistance = THREE.MathUtils.clamp(touchGesture.zoom * touchGesture.distance / Math.max(8, pair.distance), 280, 1500);
  updateCamera();
  const ground = groundPointFromEvent({ clientX: pair.x, clientY: pair.y });
  if (ground && touchGesture.anchor) {
    source.panCamera(touchGesture.anchor.x - ground.x, touchGesture.anchor.y - ground.y);
    updateCamera();
  }
});
canvas.addEventListener('pointerup', event => {
  if (!enabled || event.pointerType !== 'touch') return;
  const point = touchPointers.get(event.pointerId);
  if (!point) return;
  event.preventDefault();
  const wasMulti = suppressTouchTap;
  touchPointers.delete(event.pointerId);
  if (touchPointers.size < 2) touchGesture = null;
  if (!touchPointers.size) suppressTouchTap = false;
  if (wasMulti) return;
  if (point.moved) {
    const start = groundPointFromEvent({ clientX: point.sx, clientY: point.sy });
    const end = groundPointFromEvent(event);
    if (start && end && source.snapshot()?.selection?.unitIds?.length) {
      source.dispatch({ type: 'move', x: start.x, y: start.y, facing: Math.atan2(end.y - start.y, end.x - start.x) });
    }
  } else if (!selectTouchTarget(event)) {
    const ground = groundPointFromEvent(event);
    if (ground) {
      // A building can be selected; otherwise a selected unit receives a move order.
      const building = source.snapshot()?.buildings?.find(b => b.side === 'france' && Math.hypot(b.x - ground.x, b.y - ground.y) < 28);
      if (building) source.dispatch({ type: 'select-point', x: building.x, y: building.y });
      else if (source.snapshot()?.selection?.unitIds?.length) source.dispatch({ type: 'move', ...ground });
    }
  }
});
canvas.addEventListener('pointercancel', event => {
  touchPointers.delete(event.pointerId);
  if (touchPointers.size < 2) touchGesture = null;
  if (!touchPointers.size) suppressTouchTap = false;
});

canvas.addEventListener('mousedown', event => {
  if (!enabled) return;
  if (event.button === 0) {
    selectUnitFromEvent(event);
    return;
  }
  if (event.button !== 2) return;
  const point = groundPointFromEvent(event);
  if (!point) return;
  rightDrag = { start: point, startX: event.clientX, startY: event.clientY };
});

canvas.addEventListener('mouseup', event => {
  if (!enabled || event.button !== 2 || !rightDrag) return;
  const end = groundPointFromEvent(event) || rightDrag.start;
  const dragged = Math.hypot(event.clientX - rightDrag.startX, event.clientY - rightDrag.startY) > 10;
  const command = { type: 'move', x: rightDrag.start.x, y: rightDrag.start.y };
  if (dragged) command.facing = Math.atan2(end.y - rightDrag.start.y, end.x - rightDrag.start.x);
  source.dispatch(command);
  source.setStatus(dragged ? '3D: marsdoel en front gezet.' : '3D: marsdoel gezet.');
  rightDrag = null;
});

canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  if (!enabled) return;
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance * (event.deltaY > 0 ? 1.10 : 0.90), 280, 1500);
}, { passive: false });

canvas.addEventListener('dblclick', event => {
  if (!enabled) return;
  const point = groundPointFromEvent(event);
  if (!point) return;
  cameraAzimuth += Math.PI / 8;
  source.setStatus('3D-camera 22,5° gedraaid.');
});

function installModeButton() {
  const reset = document.getElementById('resetBtn');
  if (!reset?.parentNode) return null;
  const button = document.createElement('button');
  button.id = 'renderModeBtn';
  button.type = 'button';
  button.className = 'render-mode-button active';
  button.textContent = '3D actief';
  button.title = 'Schakel tussen de nieuwe 3D-weergave en de bestaande 2D-weergave';
  button.addEventListener('click', () => {
    enabled = !enabled;
    canvas.classList.toggle('hidden', !enabled);
    button.classList.toggle('active', enabled);
    button.textContent = enabled ? '3D actief' : 'Naar 3D';
    source.setStatus(enabled
      ? '3D prototype actief · klik regiment · rechtsklik terrein · dubbelklik draait camera.'
      : '2D-weergave actief · alle bestaande bediening blijft beschikbaar.');
  });
  reset.parentNode.insertBefore(button, reset);
  return button;
}

const modeButton = installModeButton();

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera3d.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera3d.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function render() {
  requestAnimationFrame(render);
  renderFrame++;
  if (!enabled) return;

  if (renderFrame % 2 === 0 || !lastSnapshot) {
    lastSnapshot = source.snapshot();
    if (lastSnapshot) {
      updateUnits(lastSnapshot);
      updateBuildings(lastSnapshot);
    }
  }
  updateResources();
  updateCamera();
  renderer.render(scene, camera3d);
}

window.__BATTLEFIELD_3D_V1__ = Object.freeze({
  version: 'battlefield-3d-v1',
  renderer: 'three.js',
  enabled: () => enabled,
  setEnabled(value) {
    enabled = Boolean(value);
    canvas.classList.toggle('hidden', !enabled);
    if (modeButton) {
      modeButton.classList.toggle('active', enabled);
      modeButton.textContent = enabled ? '3D actief' : 'Naar 3D';
    }
  },
  diagnostics() {
    return {
      world: { ...WORLD },
      roads: staticWorld.roads?.length || 0,
      villages: staticWorld.villages?.length || 0,
      unitMeshes: unitMeshes.size,
      buildings: buildingMeshes.size,
      cameraDistance,
      cameraAzimuth,
      frames: renderFrame
    };
  }
});

source.setStatus('v1.3.0 3D prototype geladen · klik regiment · rechtsklik om te bewegen · 2D blijft beschikbaar.');
render();
