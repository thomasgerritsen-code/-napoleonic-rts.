import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D regimental identity layer skipped: renderer bridge or scene hook unavailable.');
} else {
  const MAX_UNIT_DETAILS = 900;
  const MAX_STANDARDS = 64;
  const UPDATE_INTERVAL_MS = 90;
  const FAR_UPDATE_INTERVAL_MS = 150;
  const ULTRA_FAR_UPDATE_INTERVAL_MS = 240;
  const FAR_LOD_CAMERA_Y = 900;
  const ULTRA_FAR_LOD_CAMERA_Y = 1120;
  const NEAR_RADIUS = 920;
  const FAR_RADIUS = 1120;

  const group = new THREE.Group();
  group.name = 'napoleonic-regimental-identity-v1';

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const tempEuler = new THREE.Euler();
  const hills = source.staticWorld().hills || [];

  const diagnostics = {
    updates: 0,
    skippedInactive: 0,
    skippedUltraFar: 0,
    culledByDistance: 0,
    unitDetailsVisible: 0,
    standardsVisible: 0,
    lodMode: 'near',
    lodTransitions: 0,
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

  function makeInstanced(geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = true;
    group.add(mesh);
    return mesh;
  }

  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf1eee3, roughness: 0.82, metalness: 0.02 });
  const steelMaterial = new THREE.MeshStandardMaterial({ color: 0xc4c7c5, roughness: 0.4, metalness: 0.55 });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4a2d, roughness: 0.8, metalness: 0 });
  const frenchBlueMaterial = new THREE.MeshStandardMaterial({ color: 0x244d93, roughness: 0.78, metalness: 0 });
  const frenchRedMaterial = new THREE.MeshStandardMaterial({ color: 0xc73e3b, roughness: 0.78, metalness: 0 });
  const britishRedMaterial = new THREE.MeshStandardMaterial({ color: 0xa52f32, roughness: 0.78, metalness: 0 });

  const crossbeltGeometry = new THREE.BoxGeometry(0.62, 8.8, 0.46);
  crossbeltGeometry.rotateZ(-0.43);
  crossbeltGeometry.translate(0, 13.2, 2.3);
  const sabreGeometry = new THREE.BoxGeometry(0.32, 7.5, 0.34);
  sabreGeometry.rotateZ(0.22);
  sabreGeometry.translate(4.2, 10.1, 1.1);
  const poleGeometry = new THREE.CylinderGeometry(0.18, 0.2, 17, 5);
  poleGeometry.translate(-1.4, 15.1, 0);
  const flagLeftGeometry = new THREE.BoxGeometry(2.7, 4.8, 0.38);
  flagLeftGeometry.translate(0.0, 20.2, 0);
  const flagMiddleGeometry = new THREE.BoxGeometry(2.7, 4.8, 0.4);
  flagMiddleGeometry.translate(2.7, 20.2, 0);
  const flagRightGeometry = new THREE.BoxGeometry(2.7, 4.8, 0.38);
  flagRightGeometry.translate(5.4, 20.2, 0);
  const britishCrossVerticalGeometry = new THREE.BoxGeometry(1.1, 4.95, 0.5);
  britishCrossVerticalGeometry.translate(2.7, 20.2, 0.06);
  const britishCrossHorizontalGeometry = new THREE.BoxGeometry(8.0, 1.0, 0.5);
  britishCrossHorizontalGeometry.translate(2.7, 20.2, 0.06);

  const crossbeltMesh = makeInstanced(crossbeltGeometry, whiteMaterial, MAX_UNIT_DETAILS);
  const sabreMesh = makeInstanced(sabreGeometry, steelMaterial, MAX_UNIT_DETAILS);
  const standardPoleMesh = makeInstanced(poleGeometry, poleMaterial, MAX_STANDARDS);
  const standardLeftMesh = makeInstanced(flagLeftGeometry, frenchBlueMaterial, MAX_STANDARDS);
  const standardMiddleMesh = makeInstanced(flagMiddleGeometry, whiteMaterial.clone(), MAX_STANDARDS);
  const standardRightMesh = makeInstanced(flagRightGeometry, frenchRedMaterial, MAX_STANDARDS);
  const britishCrossVerticalMesh = makeInstanced(britishCrossVerticalGeometry, whiteMaterial.clone(), MAX_STANDARDS);
  const britishCrossHorizontalMesh = makeInstanced(britishCrossHorizontalGeometry, whiteMaterial.clone(), MAX_STANDARDS);

  function active3dRendering() {
    if (document.hidden) return false;
    return !renderApi?.enabled || renderApi.enabled();
  }

  function currentCamera() {
    const camera = sceneHook.camera?.();
    const publicCamera = source.camera?.();
    return {
      x: Number.isFinite(camera?.position?.x) ? camera.position.x : (publicCamera?.x || 0),
      z: Number.isFinite(camera?.position?.z) ? camera.position.z : (publicCamera?.y || 0),
      y: Number.isFinite(camera?.position?.y) ? camera.position.y : ((renderApi?.diagnostics?.().cameraDistance || 0) * 0.82)
    };
  }

  function currentLodMode() {
    const y = currentCamera().y;
    if (y >= ULTRA_FAR_LOD_CAMERA_Y) return 'ultra-far';
    if (y >= FAR_LOD_CAMERA_Y) return 'far';
    return 'near';
  }

  function composeUnitMatrix(unit) {
    tempPosition.set(unit.x, hillHeightAt(unit.x, unit.y), unit.y);
    tempEuler.set(0, -(unit.facing || 0), 0);
    tempQuaternion.setFromEuler(tempEuler);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
  }

  function setMatrix(mesh, index) {
    mesh.setMatrixAt(index, tempMatrix);
  }

  function finish(mesh, count) {
    mesh.count = count;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  function stableHash(value) {
    const text = String(value || 'unit');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function carriesStandard(unit) {
    return unit.type !== 'cavalry' && unit.type !== 'artillery' && unit.type !== 'worker' && stableHash(unit.id) % 17 === 0;
  }

  function clearVisuals() {
    for (const mesh of group.children) mesh.count = 0;
    diagnostics.unitDetailsVisible = 0;
    diagnostics.standardsVisible = 0;
  }

  function updateIdentity(lodMode) {
    const snapshot = source.snapshot();
    const camera = currentCamera();
    const near = lodMode === 'near';
    const radius = near ? NEAR_RADIUS : FAR_RADIUS;
    const radiusSq = radius * radius;
    let crossbelts = 0;
    let sabres = 0;
    let standards = 0;

    for (const unit of snapshot.units || []) {
      if (unit.dead || unit.type === 'worker') continue;
      const dx = unit.x - camera.x;
      const dz = unit.y - camera.z;
      if (dx * dx + dz * dz > radiusSq) {
        diagnostics.culledByDistance++;
        continue;
      }

      const standard = standards < MAX_STANDARDS && carriesStandard(unit);
      const detail = near && (crossbelts < MAX_UNIT_DETAILS || sabres < MAX_UNIT_DETAILS);
      if (!standard && !detail) continue;

      composeUnitMatrix(unit);

      if (near && unit.type === 'cavalry' && sabres < MAX_UNIT_DETAILS) {
        setMatrix(sabreMesh, sabres++);
      } else if (near && unit.type !== 'artillery' && crossbelts < MAX_UNIT_DETAILS) {
        setMatrix(crossbeltMesh, crossbelts++);
      }

      if (!standard) continue;
      setMatrix(standardPoleMesh, standards);
      setMatrix(standardLeftMesh, standards);
      setMatrix(standardMiddleMesh, standards);
      setMatrix(standardRightMesh, standards);
      if (unit.side !== 'france') {
        setMatrix(britishCrossVerticalMesh, standards);
        setMatrix(britishCrossHorizontalMesh, standards);
      }
      standards++;
    }

    finish(crossbeltMesh, near ? crossbelts : 0);
    finish(sabreMesh, near ? sabres : 0);
    finish(standardPoleMesh, standards);
    finish(standardLeftMesh, standards);
    finish(standardMiddleMesh, standards);
    finish(standardRightMesh, standards);
    const britishStandards = standards;
    finish(britishCrossVerticalMesh, britishStandards);
    finish(britishCrossHorizontalMesh, britishStandards);

    // French flags are a blue-white-red tricolour. British standards reuse the red field
    // and add a bright cross overlay; unused cross instances are placed under the terrain.
    let britishWrite = 0;
    for (const unit of snapshot.units || []) {
      if (britishWrite >= standards) break;
      if (unit.dead || unit.side === 'france' || !carriesStandard(unit)) continue;
      const dx = unit.x - camera.x;
      const dz = unit.y - camera.z;
      if (dx * dx + dz * dz > radiusSq) continue;
      composeUnitMatrix(unit);
      setMatrix(britishCrossVerticalMesh, britishWrite);
      setMatrix(britishCrossHorizontalMesh, britishWrite);
      britishWrite++;
    }
    finish(britishCrossVerticalMesh, britishWrite);
    finish(britishCrossHorizontalMesh, britishWrite);

    diagnostics.unitDetailsVisible = crossbelts + sabres;
    diagnostics.standardsVisible = standards;
    diagnostics.updates++;
    diagnostics.lastUpdateAt = performance.now();
  }

  function applyLod(lodMode) {
    if (diagnostics.lodMode !== lodMode) {
      diagnostics.lodMode = lodMode;
      diagnostics.lodTransitions++;
    }
    const near = lodMode === 'near';
    crossbeltMesh.visible = near;
    sabreMesh.visible = near;
    const standardsVisible = lodMode !== 'ultra-far';
    standardPoleMesh.visible = standardsVisible;
    standardLeftMesh.visible = standardsVisible;
    standardMiddleMesh.visible = standardsVisible;
    standardRightMesh.visible = standardsVisible;
    britishCrossVerticalMesh.visible = standardsVisible;
    britishCrossHorizontalMesh.visible = standardsVisible;
  }

  function attachWhenReady() {
    const scene = sceneHook.scene();
    if (!scene) {
      requestAnimationFrame(attachWhenReady);
      return;
    }
    scene.add(group);
    function tick() {
      const active = active3dRendering();
      const lodMode = active ? currentLodMode() : diagnostics.lodMode;
      if (active) applyLod(lodMode);
      const ultraFar = active && lodMode === 'ultra-far';
      group.visible = active && !ultraFar;
      if (!active) {
        clearVisuals();
        diagnostics.skippedInactive++;
      } else if (ultraFar) {
        clearVisuals();
        diagnostics.skippedUltraFar++;
      } else {
        updateIdentity(lodMode);
      }
      const delay = ultraFar ? ULTRA_FAR_UPDATE_INTERVAL_MS : lodMode === 'far' ? FAR_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS;
      setTimeout(tick, delay);
    }
    tick();
  }

  window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__ = Object.freeze({
    version: 'battlefield-3d-regimental-identity-v1',
    maxUnitDetails: MAX_UNIT_DETAILS,
    maxStandards: MAX_STANDARDS,
    nearRadius: NEAR_RADIUS,
    farRadius: FAR_RADIUS,
    farLodCameraY: FAR_LOD_CAMERA_Y,
    ultraFarLodCameraY: ULTRA_FAR_LOD_CAMERA_Y,
    visualFeatures: ['infantry-crossbelts', 'cavalry-sabres', 'french-tricolour-standards', 'british-cross-standards'],
    performanceModel: 'instanced-fixed-budget-distance-culled-two-tier-identity-lod',
    diagnostics: () => ({ ...diagnostics, active: active3dRendering(), cameraY: currentCamera().y })
  });

  attachWhenReady();
}
