import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const scene = window.__NRTS_THREE_SCENE__;
if (!source || !scene) throw new Error('3D village landscape requires the simulation bridge and captured Three.js scene.');

const world = source.staticWorld();
const root = new THREE.Group();
root.name = 'village-landscape-3d';
root.userData.renderOnly = true;
scene.add(root);

const counts = { parish: 0, ribbon: 0, agrarian: 0, woodland: 0, crossroads: 0 };
const featureCounts = { villageGreen: 0, ribbonVerges: 0, paddocks: 0, woodlandGroves: 0, crossroadsMarkers: 0 };

const mats = {
  green: new THREE.MeshStandardMaterial({ color: 0x718456, roughness: 1 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x425f35, roughness: 1 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x7b6242, roughness: 1 }),
  furrow: new THREE.MeshStandardMaterial({ color: 0x5f4932, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8f897b, roughness: 1 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x594331, roughness: 1 }),
  crown: new THREE.MeshStandardMaterial({ color: 0x355b35, roughness: 1 }),
  worn: new THREE.MeshStandardMaterial({ color: 0x8c7755, roughness: 1 })
};

function normalize(value) {
  const key = String(value || 'crossroads').toLowerCase();
  if (key.includes('parish')) return 'parish';
  if (key.includes('ribbon')) return 'ribbon';
  if (key.includes('agrar')) return 'agrarian';
  if (key.includes('wood')) return 'woodland';
  return 'crossroads';
}

function terrainHeight(x, z) {
  let height = Math.sin(x * 0.0041) * 2.4 + Math.sin(z * 0.0057 + 1.1) * 2.0;
  for (const hill of world.hills || []) {
    const rx = Math.max(1, hill.rx || hill.w / 2 || 1);
    const rz = Math.max(1, hill.ry || hill.h / 2 || 1);
    const dx = (x - hill.x) / rx;
    const dz = (z - hill.y) / rz;
    const q = dx * dx + dz * dz;
    if (q < 1) height += (1 - q) * (1 - q) * 34;
  }
  return height;
}

function box(parent, x, z, w, d, h, material, y = 0.35, angle = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, terrainHeight(x, z) + y, z);
  mesh.rotation.y = -angle;
  mesh.userData.renderOnly = true;
  parent.add(mesh);
  return mesh;
}

function tree(parent, x, z, scale = 1) {
  const y = terrainHeight(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * scale, 2.1 * scale, 11 * scale, 6), mats.trunk);
  trunk.position.set(x, y + 5.5 * scale, z);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(7.2 * scale, 16 * scale, 7), mats.crown);
  crown.position.set(x, y + 16 * scale, z);
  trunk.userData.renderOnly = crown.userData.renderOnly = true;
  parent.add(trunk, crown);
}

function parish(parent, village, angle) {
  box(parent, village.x, village.y, 92, 62, 0.55, mats.green, 0.5, angle);
  const well = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 5, 10), mats.stone);
  well.position.set(village.x + 10, terrainHeight(village.x + 10, village.y - 4) + 2.5, village.y - 4);
  well.userData.renderOnly = true;
  parent.add(well);
  tree(parent, village.x - 22, village.y + 10, 0.85);
  featureCounts.villageGreen++;
}

function ribbon(parent, village, angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (const side of [-1, 1]) {
    const ox = -sa * side * 30;
    const oz = ca * side * 30;
    box(parent, village.x + ox, village.y + oz, 190, 7, 4.5, mats.hedge, 2.25, angle);
  }
  featureCounts.ribbonVerges++;
}

function agrarian(parent, village, angle) {
  box(parent, village.x + 26, village.y + 54, 112, 74, 0.45, mats.soil, 0.45, angle + 0.08);
  for (let i = -4; i <= 4; i++) {
    box(parent, village.x + 26 + i * 10, village.y + 54, 3, 66, 0.28, mats.furrow, 0.7, angle + 0.08);
  }
  featureCounts.paddocks++;
}

function woodland(parent, village) {
  const offsets = [[-68,-18],[-58,30],[-34,62],[18,70],[58,42],[72,-5],[48,-52],[-18,-66]];
  offsets.forEach(([dx, dz], index) => tree(parent, village.x + dx, village.y + dz, 0.72 + (index % 3) * 0.08));
  featureCounts.woodlandGroves++;
}

function crossroads(parent, village) {
  const patch = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 0.45, 24), mats.worn);
  patch.position.set(village.x, terrainHeight(village.x, village.y) + 0.4, village.y);
  patch.userData.renderOnly = true;
  parent.add(patch);
  const post = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 3), mats.stone);
  post.position.set(village.x + 28, terrainHeight(village.x + 28, village.y + 22) + 9, village.y + 22);
  post.userData.renderOnly = true;
  parent.add(post);
  box(parent, village.x + 35, village.y + 22, 18, 2.5, 3, mats.stone, 13, 0);
  featureCounts.crossroadsMarkers++;
}

for (const village of world.villages || []) {
  const archetype = normalize(village.archetype);
  counts[archetype]++;
  const parent = new THREE.Group();
  parent.name = `village-landscape-${archetype}`;
  parent.userData = { renderOnly: true, archetype, village: village.name };
  root.add(parent);
  const angle = village.houses?.[0]?.angle || 0;
  if (archetype === 'parish') parish(parent, village, angle);
  else if (archetype === 'ribbon') ribbon(parent, village, angle);
  else if (archetype === 'agrarian') agrarian(parent, village, angle);
  else if (archetype === 'woodland') woodland(parent, village);
  else crossroads(parent, village);
}

window.__BATTLEFIELD_3D_LANDSCAPE_V1__ = Object.freeze({
  version: 'battlefield-3d-village-landscape-v1.3.9',
  contract: 'render-only-archetype-landscape-v1',
  renderOnly: true,
  counts: Object.freeze({ ...counts }),
  features: Object.freeze({ ...featureCounts }),
  objectCount: root.children.reduce((sum, group) => sum + group.children.length, 0)
});
