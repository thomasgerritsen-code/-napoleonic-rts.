import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const scene = window.__NRTS_THREE_SCENE__;
if (!source || !scene) throw new Error('3D village ground wear requires the simulation bridge and captured Three.js scene.');

const world = source.staticWorld();
const villageRoot = scene.getObjectByName('villages-3d');
if (!villageRoot) throw new Error('3D village ground wear requires the base village scene.');

const mats = {
  mud: new THREE.MeshStandardMaterial({ color: 0x66513a, roughness: 1 }),
  worn: new THREE.MeshStandardMaterial({ color: 0x8a7451, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8c877a, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x62452f, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x57737a, roughness: 0.45, metalness: 0.05 })
};

const stats = { decorated: 0, thresholdWear: 0, wheelRuts: 0, steppingStones: 0, woodpiles: 0, troughs: 0 };

function mark(mesh, feature) {
  mesh.userData.renderOnly = true;
  mesh.userData.villageGroundWear = feature;
  return mesh;
}

function box(parent, w, h, d, x, y, z, material, feature, rotation = 0) {
  const mesh = mark(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), feature);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  parent.add(mesh);
  return mesh;
}

function addThresholdWear(group, house) {
  if (house.kind === 'barn') return;
  box(group, Math.max(7, house.w * 0.28), 0.16, 8, 0, 0.10, house.h * 0.57, mats.mud, 'threshold-wear');
  stats.thresholdWear++;
}

function addWheelRuts(group, house) {
  if (!['inn', 'farmhouse', 'barn'].includes(house.kind)) return;
  const startZ = house.h * 0.72;
  for (const side of [-1, 1]) {
    box(group, 1.0, 0.12, 24, side * 3.1, 0.09, startZ + 10, mats.worn, 'wheel-rut', 0.05 * side);
  }
  stats.wheelRuts += 2;
}

function addSteppingStones(group, house) {
  if (!['house', 'chapel', 'inn'].includes(house.kind)) return;
  const count = house.kind === 'chapel' ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const z = house.h * 0.58 + 5 + i * 5.1;
    box(group, 3.6 + (i % 2) * 0.6, 0.22, 2.8, (i % 2 ? 0.8 : -0.5), 0.12, z, mats.stone, 'stepping-stone', (i - 1) * 0.05);
  }
  stats.steppingStones += count;
}

function addWoodpile(group, house) {
  if (house.kind === 'chapel') return;
  const pile = new THREE.Group();
  pile.name = 'render-only-village-woodpile';
  pile.userData.renderOnly = true;
  pile.userData.villageGroundWear = 'woodpile';
  pile.position.set(-house.w * 0.46, 0, -house.h * 0.42);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const log = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 4.8, 7), mats.wood), 'woodpile-log');
      log.rotation.z = Math.PI / 2;
      log.position.set(i * 1.5 - 2.2 + row * 0.7, 0.8 + row * 1.15, 0);
      pile.add(log);
    }
  }
  group.add(pile);
  stats.woodpiles++;
}

function addTrough(group, house) {
  if (!['farmhouse', 'barn'].includes(house.kind)) return;
  const x = house.w * 0.48;
  const z = -house.h * 0.28;
  box(group, 9.5, 2.4, 3.8, x, 1.2, z, mats.wood, 'water-trough');
  box(group, 7.7, 0.16, 2.2, x, 2.43, z, mats.water, 'trough-water');
  stats.troughs++;
}

const housesById = new Map();
for (const village of world.villages || []) {
  for (const house of village.houses || []) housesById.set(house.id, house);
}

villageRoot.traverse(object => {
  const sceneryId = object?.userData?.sceneryId;
  if (!sceneryId || !housesById.has(sceneryId) || object.userData.groundWearDecorated) return;
  const house = housesById.get(sceneryId);
  addThresholdWear(object, house);
  addWheelRuts(object, house);
  addSteppingStones(object, house);
  addWoodpile(object, house);
  addTrough(object, house);
  object.userData.groundWearDecorated = true;
  object.userData.groundWearContract = 'village-ground-wear-render-only-v1';
  stats.decorated++;
});

window.__BATTLEFIELD_3D_VILLAGE_GROUNDWEAR_V1__ = Object.freeze({
  version: 'battlefield-3d-village-groundwear-v1.3.12',
  contract: 'render-only-village-ground-wear-v1',
  renderOnly: true,
  features: Object.freeze({
    thresholdWear: true,
    wheelRuts: true,
    steppingStones: true,
    woodpiles: true,
    troughs: true
  }),
  stats: Object.freeze({ ...stats })
});
