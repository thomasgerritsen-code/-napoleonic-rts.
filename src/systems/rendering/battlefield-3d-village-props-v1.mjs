import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const scene = window.__NRTS_THREE_SCENE__;
if (!source || !scene) throw new Error('3D village props require the simulation bridge and captured Three.js scene.');

const world = source.staticWorld();
const villageRoot = scene.getObjectByName('villages-3d');
if (!villageRoot) throw new Error('3D village props require the base village scene.');

const mats = {
  wood: new THREE.MeshStandardMaterial({ color: 0x725038, roughness: 1 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x4f382a, roughness: 1 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4f514d, roughness: 0.75, metalness: 0.35 }),
  straw: new THREE.MeshStandardMaterial({ color: 0xb99b58, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 1 })
};

const stats = { decorated: 0, barrels: 0, crates: 0, hayBales: 0, carts: 0, fences: 0 };

function mark(mesh, feature) {
  mesh.userData.renderOnly = true;
  mesh.userData.villageProp = feature;
  return mesh;
}

function box(parent, w, h, d, x, y, z, material, feature) {
  const mesh = mark(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), feature);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, height, x, y, z, material, feature, rotationZ = 0) {
  const mesh = mark(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), material), feature);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotationZ;
  parent.add(mesh);
  return mesh;
}

function addBarrels(group, house) {
  if (house.kind === 'chapel') return;
  const x = -house.w * 0.34;
  const z = house.h * 0.58;
  cylinder(group, 1.8, 4.4, x, 2.2, z, mats.wood, 'barrel', Math.PI / 2);
  cylinder(group, 1.65, 4.0, x + 3.1, 2.0, z + 0.5, mats.woodDark, 'barrel', Math.PI / 2);
  stats.barrels += 2;
}

function addCrates(group, house) {
  if (house.kind !== 'inn' && house.kind !== 'barn') return;
  const x = house.w * 0.30;
  const z = house.h * 0.57;
  box(group, 4.2, 3.6, 4.2, x, 1.8, z, mats.wood, 'crate');
  box(group, 3.5, 3.0, 3.5, x + 3.8, 1.5, z - 1.2, mats.woodDark, 'crate');
  stats.crates += 2;
}

function addHayBales(group, house) {
  if (house.kind !== 'barn' && house.kind !== 'farmhouse') return;
  const x = -house.w * 0.24;
  const z = -house.h * 0.62;
  cylinder(group, 2.4, 5.2, x, 2.4, z, mats.straw, 'hay-bale', Math.PI / 2);
  cylinder(group, 2.2, 4.8, x + 5.0, 2.2, z + 1.2, mats.straw, 'hay-bale', Math.PI / 2);
  stats.hayBales += 2;
}

function addCart(group, house) {
  if (house.kind !== 'inn' && house.kind !== 'farmhouse') return;
  const cart = new THREE.Group();
  cart.name = 'render-only-village-cart';
  cart.userData.renderOnly = true;
  cart.userData.villageProp = 'cart';
  cart.position.set(house.w * 0.52, 0, -house.h * 0.48);
  box(cart, 8, 2.1, 5, 0, 3.5, 0, mats.wood, 'cart-bed');
  box(cart, 1.0, 1.0, 10, 5.2, 2.8, 0, mats.woodDark, 'cart-shaft');
  for (const side of [-1, 1]) {
    const wheel = mark(new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.45, 8, 14), mats.woodDark), 'cart-wheel');
    wheel.position.set(0, 2.6, side * 2.9);
    wheel.rotation.y = Math.PI / 2;
    cart.add(wheel);
  }
  group.add(cart);
  stats.carts++;
}

function addFence(group, house) {
  if (house.kind === 'chapel') return;
  const z = -house.h * 0.72;
  const span = Math.max(12, house.w * 0.65);
  box(group, span, 0.8, 0.8, 0, 2.7, z, mats.woodDark, 'fence-rail');
  box(group, span, 0.8, 0.8, 0, 5.0, z, mats.woodDark, 'fence-rail');
  for (const x of [-span / 2, 0, span / 2]) box(group, 0.9, 6.2, 0.9, x, 3.1, z, mats.wood, 'fence-post');
  stats.fences++;
}

const housesById = new Map();
for (const village of world.villages || []) {
  for (const house of village.houses || []) housesById.set(house.id, house);
}

villageRoot.traverse(object => {
  const sceneryId = object?.userData?.sceneryId;
  if (!sceneryId || !housesById.has(sceneryId) || object.userData.propsDecorated) return;
  const house = housesById.get(sceneryId);
  addBarrels(object, house);
  addCrates(object, house);
  addHayBales(object, house);
  addCart(object, house);
  addFence(object, house);
  object.userData.propsDecorated = true;
  object.userData.propsContract = 'village-props-render-only-v1';
  stats.decorated++;
});

window.__BATTLEFIELD_3D_VILLAGE_PROPS_V1__ = Object.freeze({
  version: 'battlefield-3d-village-props-v1.3.11',
  contract: 'render-only-village-props-v1',
  renderOnly: true,
  features: Object.freeze({
    barrels: true,
    crates: true,
    hayBales: true,
    carts: true,
    fences: true
  }),
  stats: Object.freeze({ ...stats })
});
