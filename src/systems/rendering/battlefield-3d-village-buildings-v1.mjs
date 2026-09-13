import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const scene = window.__NRTS_THREE_SCENE__;
if (!source || !scene) throw new Error('3D village building detail requires the simulation bridge and captured Three.js scene.');

const world = source.staticWorld();
const villageRoot = scene.getObjectByName('villages-3d');
if (!villageRoot) throw new Error('3D village building detail requires the base village scene.');

const materialCache = new Map();
const stats = { rebuilt: 0, gableRoofs: 0, chimneys: 0, windows: 0, doors: 0, signs: 0, chapelSpires: 0 };

function material(key, color, options = {}) {
  if (materialCache.has(key)) return materialCache.get(key);
  const value = new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 1, metalness: 0, ...options });
  materialCache.set(key, value);
  return value;
}

const mats = {
  plaster: material('plaster', 0xc7b79b),
  farmhouse: material('farmhouse', 0xb6a287),
  inn: material('inn', 0xb7a181),
  barn: material('barn', 0x735343),
  stone: material('stone', 0x958675),
  roof: material('roof', 0x6d4a39, { roughness: 0.95 }),
  roofDark: material('roof-dark', 0x594038, { roughness: 0.95 }),
  chapelRoof: material('chapel-roof', 0x55514c, { roughness: 0.92 }),
  door: material('door', 0x4b3427),
  window: material('window', 0x9fb4ba, { roughness: 0.35 }),
  trim: material('trim', 0xe1d6bd),
  chimney: material('chimney', 0x806f61),
  sign: material('sign', 0x6a492f),
  foundation: material('foundation', 0x7f7568)
};

function palette(kind) {
  if (kind === 'barn') return { wall: mats.barn, roof: mats.roofDark };
  if (kind === 'chapel') return { wall: mats.stone, roof: mats.chapelRoof };
  if (kind === 'inn') return { wall: mats.inn, roof: mats.roof };
  if (kind === 'farmhouse') return { wall: mats.farmhouse, roof: mats.roof };
  return { wall: mats.plaster, roof: mats.roof };
}

function gableRoofGeometry(width, depth, height, overhang = 2.2) {
  const w = width / 2 + overhang;
  const d = depth / 2 + overhang;
  const h = height;
  const vertices = new Float32Array([
    -w,0,-d,   w,0,-d,   0,h,-d,
    -w,0,d,    0,h,d,     w,0,d,
    -w,0,-d,   0,h,-d,   -w,0,d,
    -w,0,d,    0,h,-d,    0,h,d,
     0,h,-d,   w,0,-d,    0,h,d,
     0,h,d,    w,0,-d,    w,0,d
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addBox(parent, w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.userData.renderOnly = true;
  parent.add(mesh);
  return mesh;
}

function addWindow(parent, x, y, z, wide = 5) {
  addBox(parent, wide, 5.5, 0.7, x, y, z, mats.window);
  addBox(parent, wide + 0.8, 0.65, 0.9, x, y + 3.1, z, mats.trim);
  stats.windows++;
}

function addDoor(parent, x, y, z, wide = 5.5, tall = 9) {
  addBox(parent, wide, tall, 0.8, x, y, z, mats.door);
  stats.doors++;
}

function addChimney(parent, house, bodyHeight, depth) {
  if (house.kind === 'barn' || house.kind === 'chapel') return;
  const x = house.w * 0.22;
  const chimney = addBox(parent, 4.2, 12, 4.2, x, bodyHeight + 8, depth * 0.1, mats.chimney);
  chimney.rotation.z = 0.015;
  stats.chimneys++;
}

function addInnSign(parent, house, bodyHeight) {
  if (house.kind !== 'inn') return;
  addBox(parent, 0.8, 8, 0.8, house.w * 0.34, bodyHeight * 0.68, house.h / 2 + 1.2, mats.sign);
  addBox(parent, 7, 4.5, 0.8, house.w * 0.34 + 3.3, bodyHeight * 0.78, house.h / 2 + 1.2, mats.sign);
  stats.signs++;
}

function addChapelTower(parent, house, bodyHeight) {
  if (house.kind !== 'chapel') return;
  const towerX = -house.w * 0.27;
  addBox(parent, 10, 25, 10, towerX, bodyHeight + 6, 0, mats.stone);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(7, 18, 4), mats.chapelRoof);
  spire.position.set(towerX, bodyHeight + 27.5, 0);
  spire.rotation.y = Math.PI / 4;
  spire.userData.renderOnly = true;
  parent.add(spire);
  stats.chapelSpires++;
}

function rebuildHouse(group, house) {
  while (group.children.length) group.remove(group.children[group.children.length - 1]);

  const colors = palette(house.kind);
  const bodyHeight = house.kind === 'chapel' ? 23 : house.kind === 'barn' ? 17 : 15;
  const roofHeight = house.kind === 'chapel' ? 13 : house.kind === 'barn' ? 8 : 9;
  const halfDepth = house.h / 2;

  addBox(group, house.w + 1.8, 1.6, house.h + 1.8, 0, 0.8, 0, mats.foundation);
  addBox(group, house.w, bodyHeight, house.h, 0, bodyHeight / 2 + 1.1, 0, colors.wall);

  const roof = new THREE.Mesh(gableRoofGeometry(house.w, house.h, roofHeight), colors.roof);
  roof.position.y = bodyHeight + 1.1;
  roof.userData.renderOnly = true;
  group.add(roof);
  stats.gableRoofs++;

  const frontZ = halfDepth + 0.45;
  if (house.kind === 'barn') {
    addDoor(group, 0, 7.4, frontZ, Math.min(12, house.w * 0.42), 12.5);
    addBox(group, 0.7, 12.5, 0.95, 0, 7.4, frontZ + 0.08, mats.trim);
  } else if (house.kind === 'chapel') {
    addDoor(group, house.w * 0.12, 7.3, frontZ, 6.5, 11.5);
    addWindow(group, -house.w * 0.18, 13.5, frontZ, 4.2);
  } else {
    addDoor(group, 0, 6.2, frontZ, 5.5, 9.5);
    addWindow(group, -house.w * 0.27, 8.8, frontZ, 4.8);
    addWindow(group, house.w * 0.27, 8.8, frontZ, 4.8);
  }

  addChimney(group, house, bodyHeight, house.h);
  addInnSign(group, house, bodyHeight);
  addChapelTower(group, house, bodyHeight);

  group.userData.renderOnlyDetail = true;
  group.userData.detailContract = 'village-building-detail-v1';
  stats.rebuilt++;
}

const housesById = new Map();
for (const village of world.villages || []) {
  for (const house of village.houses || []) housesById.set(house.id, house);
}

villageRoot.traverse(object => {
  const sceneryId = object?.userData?.sceneryId;
  if (!sceneryId || !housesById.has(sceneryId)) return;
  rebuildHouse(object, housesById.get(sceneryId));
});

window.__BATTLEFIELD_3D_VILLAGE_BUILDINGS_V1__ = Object.freeze({
  version: 'battlefield-3d-village-buildings-v1.3.10',
  contract: 'render-only-building-detail-v1',
  renderOnly: true,
  features: Object.freeze({
    gableRoofs: true,
    facadeOpenings: true,
    chimneys: true,
    innSigns: true,
    chapelSpires: true
  }),
  stats: Object.freeze({ ...stats })
});
