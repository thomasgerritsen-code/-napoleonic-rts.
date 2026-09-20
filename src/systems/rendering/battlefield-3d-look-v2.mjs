import * as THREE from 'three';

// GRAPHICS-V2: non-authoritative visual layer inspired by the approved master keyframe.
// It only changes rendering: terrain palette/variation, atmosphere and soft contact shadows.
const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;

if (!source || !sceneHook) {
  console.warn('Graphics V2 look layer skipped: renderer bridge or scene hook unavailable.');
} else {
  const staticWorld = source.staticWorld();
  const hills = staticWorld.hills || [];
  const MAX_SHADOWS = 1400;
  const UPDATE_MS = 70;
  const group = new THREE.Group();
  group.name = 'graphics-v2-look';

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const terrainBase = new THREE.Color(0x6f7f50);
  const terrainDry = new THREE.Color(0x8b8158);
  const terrainDark = new THREE.Color(0x556943);
  const colorScratch = new THREE.Color();

  const shadowGeometry = new THREE.CircleGeometry(1, 14);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x171710,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    toneMapped: false
  });
  const unitShadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, MAX_SHADOWS);
  unitShadows.name = 'graphics-v2-unit-contact-shadows';
  unitShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  unitShadows.frustumCulled = false;
  unitShadows.renderOrder = 2;
  unitShadows.count = 0;
  group.add(unitShadows);

  let terrainStylized = false;
  let roadsStylized = false;
  let atmosphereStylized = false;
  let attached = false;
  let updateCount = 0;

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

  function deterministicGroundMix(x, z) {
    const broad = 0.5 + 0.5 * Math.sin(x * 0.0061 + Math.cos(z * 0.0047) * 1.6);
    const fine = 0.5 + 0.5 * Math.sin(x * 0.021 + z * 0.017 + Math.sin(x * 0.003) * 2.2);
    return THREE.MathUtils.clamp(broad * 0.62 + fine * 0.38, 0, 1);
  }

  function stylizeTerrain(scene) {
    const terrain = scene.getObjectByName('battlefield-terrain');
    if (!terrain?.geometry?.attributes?.position || terrainStylized) return;
    const position = terrain.geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const mix = deterministicGroundMix(x, z);
      colorScratch.copy(terrainBase);
      if (mix > 0.57) colorScratch.lerp(terrainDry, (mix - 0.57) * 0.66);
      else colorScratch.lerp(terrainDark, (0.57 - mix) * 0.58);
      colors[i * 3] = colorScratch.r;
      colors[i * 3 + 1] = colorScratch.g;
      colors[i * 3 + 2] = colorScratch.b;
    }
    terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrain.material.vertexColors = true;
    terrain.material.color.set(0xffffff);
    terrain.material.roughness = 1;
    terrain.material.metalness = 0;
    terrain.material.needsUpdate = true;
    terrainStylized = true;
  }

  function stylizeRoads(scene) {
    const roadGroup = scene.getObjectByName('roads-3d');
    if (!roadGroup || roadsStylized) return;
    const roadClassById = new Map((staticWorld.roads || []).map(road => [road.id, road.roadClass]));
    const palette = {
      chaussee: 0xb39b6e,
      secondary: 0x997a52,
      track: 0x715337
    };
    roadGroup.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const roadClass = roadClassById.get(object.userData.roadId) || 'secondary';
      object.material.color.set(palette[roadClass] || palette.secondary);
      object.material.roughness = 1;
      object.material.metalness = 0;
      object.material.needsUpdate = true;
    });
    roadsStylized = true;
  }

  function stylizeAtmosphere(scene) {
    if (atmosphereStylized) return;
    if (scene.background?.isColor) scene.background.set(0xa6ad9b);
    if (scene.fog?.isFogExp2) {
      scene.fog.color.set(0xaeb2a1);
      scene.fog.density = 0.00019;
    }
    scene.traverse(object => {
      if (object.isHemisphereLight) {
        object.color.set(0xe2dcc5);
        object.groundColor.set(0x4b5138);
        object.intensity = 1.75;
      } else if (object.isDirectionalLight) {
        object.color.set(0xffe7c2);
        object.intensity = 2.15;
      }
    });
    atmosphereStylized = true;
  }

  function shadowScale(unit) {
    if (unit.type === 'cavalry') return [7.6, 13.0];
    if (unit.type === 'artillery') return [10.5, 8.0];
    if (unit.type === 'officer') return [4.4, 5.2];
    if (unit.type === 'worker') return [3.5, 4.4];
    return [3.9, 4.8];
  }

  function updateShadows() {
    const renderApi = window.__BATTLEFIELD_3D_V1__;
    const pixiApi = window.__NRTS_PIXI_V1__;
    const active = renderApi?.enabled?.() !== false && pixiApi?.enabled?.() !== true;
    group.visible = active;
    if (!active || document.hidden) {
      unitShadows.count = 0;
      return;
    }

    const snapshot = source.snapshot();
    let count = 0;
    for (const unit of snapshot.units || []) {
      if (unit.dead || count >= MAX_SHADOWS) continue;
      const [sx, sz] = shadowScale(unit);
      tempPosition.set(unit.x + 2.4, hillHeightAt(unit.x, unit.y) + 0.16, unit.y - 1.8);
      tempQuaternion.identity();
      tempScale.set(sx, 1, sz);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      unitShadows.setMatrixAt(count++, tempMatrix);
    }
    unitShadows.count = count;
    unitShadows.instanceMatrix.needsUpdate = true;
    updateCount++;
  }

  function attachWhenReady() {
    const scene = sceneHook.scene();
    if (!scene) {
      requestAnimationFrame(attachWhenReady);
      return;
    }
    if (!attached) {
      scene.add(group);
      attached = true;
    }
    stylizeTerrain(scene);
    stylizeRoads(scene);
    stylizeAtmosphere(scene);
    updateShadows();
    setTimeout(attachWhenReady, UPDATE_MS);
  }

  window.__BATTLEFIELD_3D_LOOK_V2__ = Object.freeze({
    version: 'graphics-v2-look-foundation',
    palette: 'warm-muted-1815',
    diagnostics() {
      return {
        attached,
        terrainStylized,
        roadsStylized,
        atmosphereStylized,
        shadows: unitShadows.count,
        updates: updateCount
      };
    }
  });

  attachWhenReady();
}
