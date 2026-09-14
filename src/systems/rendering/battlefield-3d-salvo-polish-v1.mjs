import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D salvo polish skipped: renderer bridge or scene hook unavailable.');
} else {
  const hills = source.staticWorld()?.hills || [];
  const MAX_HAZE = 48;
  const MAX_SHOCK = 16;
  const MAX_TRACKED = 192;
  const UPDATE_MS = 55;
  const FAR_CAMERA_Y = 900;
  const EFFECT_RADIUS = 930;
  const HAZE_LIFE = 1.55;
  const DUST_LIFE = 1.15;
  const SHOCK_LIFE = 0.18;

  const group = new THREE.Group();
  group.name = 'napoleonic-salvo-polish-v1';
  group.renderOrder = 11;

  const hazeGeometry = new THREE.IcosahedronGeometry(1, 1);
  const hazeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
    vertexColors: true
  });
  const haze = new THREE.InstancedMesh(hazeGeometry, hazeMaterial, MAX_HAZE);
  haze.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  haze.frustumCulled = false;
  haze.count = 0;
  group.add(haze);

  const shockGeometry = new THREE.RingGeometry(0.62, 1, 12);
  shockGeometry.rotateX(-Math.PI / 2);
  const shockMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd991,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const shock = new THREE.InstancedMesh(shockGeometry, shockMaterial, MAX_SHOCK);
  shock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shock.frustumCulled = false;
  shock.count = 0;
  group.add(shock);

  const hazePool = Array.from({ length: MAX_HAZE }, () => ({ active: false }));
  const shockPool = Array.from({ length: MAX_SHOCK }, () => ({ active: false }));
  const tracked = new Map();
  let hazeCursor = 0;
  let shockCursor = 0;
  let previousHazeCount = 0;
  let previousShockCount = 0;

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const identityQuaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  const powderColor = new THREE.Color(0xc7c8c2);
  const dustColor = new THREE.Color(0x9e896c);

  const diagnostics = {
    updates: 0,
    emittedVolleyHaze: 0,
    emittedArtilleryDust: 0,
    emittedShockRings: 0,
    culledByDistance: 0,
    skippedFar: 0,
    skippedInactive: 0,
    hazeVisible: 0,
    shockVisible: 0,
    lastUpdateAt: 0
  };

  function hillHeightAt(x, z) {
    let height = Math.sin(x * 0.0041) * 2.4 + Math.sin(z * 0.0057 + 1.1) * 2.0;
    for (const hill of hills) {
      const rx = Math.max(1, hill.rx || hill.w / 2 || 1);
      const rz = Math.max(1, hill.ry || hill.h / 2 || 1);
      const dx = (x - hill.x) / rx;
      const dz = (z - hill.y) / rz;
      const q = dx * dx + dz * dz;
      if (q < 1) height += (1 - q) * (1 - q) * 34;
    }
    return height;
  }

  function active3d() {
    return !document.hidden && (!renderApi?.enabled || renderApi.enabled());
  }

  function cameraY() {
    const y = sceneHook.camera?.()?.position?.y;
    if (Number.isFinite(y)) return y;
    const distance = renderApi?.diagnostics?.().cameraDistance;
    return Number.isFinite(distance) ? distance * 0.82 : 0;
  }

  function cameraCenter() {
    const camera = source.camera?.();
    if (Number.isFinite(camera?.x) && Number.isFinite(camera?.y)) return { x: camera.x, z: camera.y };
    return null;
  }

  function withinRange(x, z) {
    const center = cameraCenter();
    if (!center) return true;
    const dx = x - center.x;
    const dz = z - center.z;
    return dx * dx + dz * dz <= EFFECT_RADIUS * EFFECT_RADIUS;
  }

  function allocateHaze() {
    const item = hazePool[hazeCursor];
    hazeCursor = (hazeCursor + 1) % MAX_HAZE;
    return item;
  }

  function allocateShock() {
    const item = shockPool[shockCursor];
    shockCursor = (shockCursor + 1) % MAX_SHOCK;
    return item;
  }

  function remember(id, started) {
    if (tracked.size >= MAX_TRACKED && !tracked.has(id)) tracked.delete(tracked.keys().next().value);
    tracked.set(id, started);
  }

  function emitHaze(unit, now, lateral, dust = false) {
    const facing = unit.facing || 0;
    const sideX = -Math.sin(facing);
    const sideZ = Math.cos(facing);
    const forwardX = Math.cos(facing);
    const forwardZ = Math.sin(facing);
    const baseX = unit.x + forwardX * (dust ? 8 : 15) + sideX * lateral;
    const baseZ = unit.y + forwardZ * (dust ? 8 : 15) + sideZ * lateral;
    const item = allocateHaze();
    item.active = true;
    item.born = now;
    item.life = dust ? DUST_LIFE : HAZE_LIFE;
    item.x = baseX;
    item.z = baseZ;
    item.y = hillHeightAt(baseX, baseZ) + (dust ? 1.2 : 8.2);
    item.driftX = forwardX * (dust ? 2.2 : 1.1) + sideX * 0.35;
    item.driftZ = forwardZ * (dust ? 2.2 : 1.1) + sideZ * 0.35;
    item.rise = dust ? 1.5 : 4.2;
    item.startScale = dust ? 3.5 : 2.8;
    item.growth = dust ? 5.6 : 6.8;
    item.dust = dust;
    if (dust) diagnostics.emittedArtilleryDust++;
    else diagnostics.emittedVolleyHaze++;
  }

  function emitShock(unit, now) {
    const facing = unit.facing || 0;
    const x = unit.x + Math.cos(facing) * 15;
    const z = unit.y + Math.sin(facing) * 15;
    const item = allocateShock();
    item.active = true;
    item.born = now;
    item.x = x;
    item.z = z;
    item.y = hillHeightAt(x, z) + 0.75;
    diagnostics.emittedShockRings++;
  }

  function collect(snapshot) {
    const now = snapshot.elapsed || 0;
    for (const unit of snapshot.units || []) {
      if (unit.dead) continue;
      const event = unit.combatVisualV1;
      if (!event || (event.kind !== 'musket-fire' && event.kind !== 'artillery-fire')) continue;
      if (!Number.isFinite(event.started) || tracked.get(unit.id) === event.started) continue;
      remember(unit.id, event.started);
      if (!withinRange(unit.x, unit.y)) {
        diagnostics.culledByDistance++;
        continue;
      }
      if (event.kind === 'artillery-fire') {
        emitHaze(unit, now, -3.5, true);
        emitHaze(unit, now, 3.5, true);
        emitShock(unit, now);
      } else {
        emitHaze(unit, now, -7.0, false);
        emitHaze(unit, now, 0, false);
        emitHaze(unit, now, 7.0, false);
      }
    }
  }

  function updateHaze(now) {
    let count = 0;
    for (const item of hazePool) {
      if (!item.active) continue;
      const age = now - item.born;
      if (age < 0 || age >= item.life) {
        item.active = false;
        continue;
      }
      const t = age / item.life;
      const scale = (item.startScale + item.growth * t) * Math.max(0.25, 1 - t * 0.42);
      tempPosition.set(item.x + item.driftX * age, item.y + item.rise * age, item.z + item.driftZ * age);
      tempScale.set(scale * (item.dust ? 1.45 : 1.8), scale * (item.dust ? 0.42 : 0.72), scale);
      tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
      haze.setMatrixAt(count, tempMatrix);
      color.copy(item.dust ? dustColor : powderColor).multiplyScalar(1 - t * 0.18);
      haze.setColorAt(count, color);
      count++;
      if (count >= MAX_HAZE) break;
    }
    haze.count = count;
    if (count > 0 || previousHazeCount > 0) {
      haze.instanceMatrix.needsUpdate = true;
      if (haze.instanceColor) haze.instanceColor.needsUpdate = true;
    }
    previousHazeCount = count;
    diagnostics.hazeVisible = count;
  }

  function updateShock(now) {
    let count = 0;
    for (const item of shockPool) {
      if (!item.active) continue;
      const age = now - item.born;
      if (age < 0 || age >= SHOCK_LIFE) {
        item.active = false;
        continue;
      }
      const t = age / SHOCK_LIFE;
      const scale = 4.5 + t * 13.0;
      tempPosition.set(item.x, item.y, item.z);
      tempScale.set(scale, 1, scale);
      tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
      shock.setMatrixAt(count, tempMatrix);
      count++;
      if (count >= MAX_SHOCK) break;
    }
    shock.count = count;
    if (count > 0 || previousShockCount > 0) shock.instanceMatrix.needsUpdate = true;
    previousShockCount = count;
    diagnostics.shockVisible = count;
  }

  function clearVisible() {
    haze.count = 0;
    shock.count = 0;
    if (previousHazeCount > 0) haze.instanceMatrix.needsUpdate = true;
    if (previousShockCount > 0) shock.instanceMatrix.needsUpdate = true;
    previousHazeCount = 0;
    previousShockCount = 0;
    diagnostics.hazeVisible = 0;
    diagnostics.shockVisible = 0;
  }

  function attachWhenReady() {
    const scene = sceneHook.scene?.();
    if (!scene) {
      requestAnimationFrame(attachWhenReady);
      return;
    }
    scene.add(group);
    function tick() {
      const active = active3d();
      const far = active && cameraY() >= FAR_CAMERA_Y;
      group.visible = active && !far;
      if (!active) {
        diagnostics.skippedInactive++;
        clearVisible();
      } else if (far) {
        diagnostics.skippedFar++;
        clearVisible();
      } else {
        const snapshot = source.snapshot();
        const now = snapshot.elapsed || 0;
        collect(snapshot);
        updateHaze(now);
        updateShock(now);
        diagnostics.updates++;
        diagnostics.lastUpdateAt = performance.now();
      }
      setTimeout(tick, far ? 150 : UPDATE_MS);
    }
    tick();
  }

  window.__BATTLEFIELD_3D_SALVO_POLISH_V1__ = Object.freeze({
    version: 'battlefield-3d-salvo-polish-v1',
    maxHaze: MAX_HAZE,
    maxShock: MAX_SHOCK,
    farCameraY: FAR_CAMERA_Y,
    effectRadius: EFFECT_RADIUS,
    effects: ['lateral-volley-haze', 'artillery-ground-dust', 'artillery-shock-ring'],
    performanceModel: 'fixed-pool-near-lod-instanced-salvo-accents',
    diagnostics: () => ({ ...diagnostics, active: active3d(), cameraY: cameraY() })
  });

  attachWhenReady();
}
