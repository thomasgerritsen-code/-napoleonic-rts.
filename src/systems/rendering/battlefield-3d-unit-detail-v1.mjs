import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D unit detail layer skipped: renderer bridge or scene hook unavailable.');
} else {
  const staticWorld = source.staticWorld();
  const hills = staticWorld.hills || [];
  const MAX_INSTANCES = 1400;
  const UPDATE_INTERVAL_MS = 50;
  const FAR_UPDATE_INTERVAL_MS = 100;
  const FAR_LOD_CAMERA_Y = 900;
  const detailGroup = new THREE.Group();
  detailGroup.name = 'napoleonic-unit-details-v1';

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const tempEuler = new THREE.Euler();
  const frenchColor = new THREE.Color(0x2855a5);
  const britishColor = new THREE.Color(0xa63b35);
  const selectedColor = new THREE.Color(0xf4d86d);
  const selectedUnitIds = new Set();
  const diagnostics = {
    updates: 0,
    skippedInactive: 0,
    lodTransitions: 0,
    lodMode: 'near',
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

  function instancedMesh(geometry, color, roughness = 0.86) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    detailGroup.add(mesh);
    return mesh;
  }

  function translatedBox(w, h, d, x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    return geometry;
  }

  function translatedSphere(radius, x, y, z) {
    const geometry = new THREE.SphereGeometry(radius, 8, 6);
    geometry.translate(x, y, z);
    return geometry;
  }

  function translatedCylinder(rTop, rBottom, height, segments, x, y, z) {
    const geometry = new THREE.CylinderGeometry(rTop, rBottom, height, segments);
    geometry.translate(x, y, z);
    return geometry;
  }

  const meshes = {
    infantryTorso: instancedMesh(translatedBox(5.1, 7.2, 3.7, 0, 8.4, 0), 0xffffff),
    infantryHead: instancedMesh(translatedSphere(1.8, 0, 13.4, 0), 0xd3aa82, 0.95),
    infantryShako: instancedMesh(translatedCylinder(1.75, 1.95, 3.3, 8, 0, 16.0, 0), 0x20201f, 0.94),
    infantryMusket: instancedMesh(translatedBox(0.65, 0.65, 14.5, 2.9, 8.8, 1.5), 0x4f3927, 0.96),
    infantryPack: instancedMesh(translatedBox(4.0, 5.2, 1.8, 0, 9.0, -2.8), 0x4b3a2b, 0.98),
    officerTorso: instancedMesh(translatedBox(5.8, 8.0, 4.0, 0, 9.0, 0), 0xffffff),
    officerHead: instancedMesh(translatedSphere(1.9, 0, 14.5, 0), 0xd3aa82, 0.95),
    officerBicorne: instancedMesh(translatedBox(5.2, 1.1, 2.0, 0, 17.0, 0), 0x1f1f1f, 0.94),
    cavalryRider: instancedMesh(translatedBox(5.0, 7.2, 4.0, 0, 12.0, -1.0), 0xffffff),
    cavalryHead: instancedMesh(translatedSphere(1.8, 0, 16.8, -1.0), 0xd3aa82, 0.95),
    cavalryShako: instancedMesh(translatedCylinder(1.7, 1.9, 3.0, 8, 0, 19.2, -1.0), 0x20201f, 0.94),
    cavalryHorseBody: instancedMesh(translatedBox(8.8, 5.6, 14.0, 0, 5.4, 0.4), 0x5a4332, 1),
    cavalryHorseNeck: instancedMesh(translatedBox(4.0, 7.5, 5.0, 0, 7.8, 5.8), 0x5a4332, 1),
    cavalryHorseHead: instancedMesh(translatedBox(3.5, 3.6, 5.2, 0, 10.0, 9.0), 0x5a4332, 1),
    cavalryHorseTail: instancedMesh((() => { const g = new THREE.CylinderGeometry(0.45, 0.8, 7.0, 6); g.rotateX(Math.PI / 5); g.translate(0, 4.0, -8.6); return g; })(), 0x2f241d, 1),
    artilleryBarrel: instancedMesh((() => { const g = new THREE.CylinderGeometry(1.25, 1.6, 16, 10); g.rotateX(Math.PI / 2); g.translate(0, 5.4, 2.5); return g; })(), 0x3b3b38, 0.72),
    artilleryCarriage: instancedMesh(translatedBox(8.2, 2.5, 8.8, 0, 3.4, -1.8), 0x735332, 0.98),
    artilleryTrail: instancedMesh((() => { const g = new THREE.BoxGeometry(3.0, 1.8, 15.0); g.rotateX(-0.08); g.translate(0, 2.4, -10.6); return g; })(), 0x735332, 0.98),
    artilleryWheelL: instancedMesh((() => { const g = new THREE.CylinderGeometry(3.7, 3.7, 0.9, 12); g.rotateZ(Math.PI / 2); g.translate(-5.4, 3.1, 0); return g; })(), 0x5a402b, 0.96),
    artilleryWheelR: instancedMesh((() => { const g = new THREE.CylinderGeometry(3.7, 3.7, 0.9, 12); g.rotateZ(Math.PI / 2); g.translate(5.4, 3.1, 0); return g; })(), 0x5a402b, 0.96),
    artilleryCrewTorso: instancedMesh(translatedBox(4.8, 6.8, 3.5, -7.0, 7.9, -2.5), 0xffffff),
    artilleryCrewHead: instancedMesh(translatedSphere(1.65, -7.0, 12.6, -2.5), 0xd3aa82, 0.95)
  };

  const fineDetailMeshes = [
    meshes.infantryHead,
    meshes.infantryShako,
    meshes.infantryMusket,
    meshes.infantryPack,
    meshes.officerHead,
    meshes.officerBicorne,
    meshes.cavalryHead,
    meshes.cavalryShako,
    meshes.cavalryHorseHead,
    meshes.cavalryHorseTail,
    meshes.artilleryCrewHead
  ];

  function setInstance(mesh, index, unit, selected, colorize = false) {
    const y = hillHeightAt(unit.x, unit.y);
    tempPosition.set(unit.x, y, unit.y);
    tempEuler.set(0, -(unit.facing || 0), 0);
    tempQuaternion.setFromEuler(tempEuler);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    mesh.setMatrixAt(index, tempMatrix);
    if (colorize) {
      mesh.setColorAt(index, selected ? selectedColor : unit.side === 'france' ? frenchColor : britishColor);
    }
  }

  function finish(mesh, count) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function active3dRendering() {
    if (document.hidden) return false;
    return !renderApi?.enabled || renderApi.enabled();
  }

  function farLodActive() {
    const camera = sceneHook.camera?.();
    return Boolean(camera && camera.position.y >= FAR_LOD_CAMERA_Y);
  }

  function applyLodVisibility(farLod) {
    const nextMode = farLod ? 'far' : 'near';
    if (diagnostics.lodMode !== nextMode) {
      diagnostics.lodMode = nextMode;
      diagnostics.lodTransitions++;
    }
    for (const mesh of fineDetailMeshes) mesh.visible = !farLod;
  }

  function updateDetails() {
    const snapshot = source.snapshot();
    const farLod = farLodActive();
    applyLodVisibility(farLod);
    selectedUnitIds.clear();
    for (const id of snapshot.selection?.unitIds || []) selectedUnitIds.add(id);
    let infantry = 0;
    let officers = 0;
    let cavalry = 0;
    let artillery = 0;

    for (const unit of snapshot.units || []) {
      if (unit.dead) continue;
      const isSelected = selectedUnitIds.has(unit.id);
      if (unit.type === 'artillery') {
        if (artillery >= MAX_INSTANCES) continue;
        setInstance(meshes.artilleryBarrel, artillery, unit, false);
        setInstance(meshes.artilleryCarriage, artillery, unit, false);
        setInstance(meshes.artilleryTrail, artillery, unit, false);
        setInstance(meshes.artilleryWheelL, artillery, unit, false);
        setInstance(meshes.artilleryWheelR, artillery, unit, false);
        setInstance(meshes.artilleryCrewTorso, artillery, unit, isSelected, true);
        if (!farLod) setInstance(meshes.artilleryCrewHead, artillery, unit, false);
        artillery++;
        continue;
      }
      if (unit.type === 'cavalry') {
        if (cavalry >= MAX_INSTANCES) continue;
        setInstance(meshes.cavalryRider, cavalry, unit, isSelected, true);
        if (!farLod) {
          setInstance(meshes.cavalryHead, cavalry, unit, false);
          setInstance(meshes.cavalryShako, cavalry, unit, false);
          setInstance(meshes.cavalryHorseHead, cavalry, unit, false);
          setInstance(meshes.cavalryHorseTail, cavalry, unit, false);
        }
        setInstance(meshes.cavalryHorseBody, cavalry, unit, false);
        setInstance(meshes.cavalryHorseNeck, cavalry, unit, false);
        cavalry++;
        continue;
      }
      if (unit.type === 'officer') {
        if (officers >= MAX_INSTANCES) continue;
        setInstance(meshes.officerTorso, officers, unit, isSelected, true);
        if (!farLod) {
          setInstance(meshes.officerHead, officers, unit, false);
          setInstance(meshes.officerBicorne, officers, unit, false);
        }
        officers++;
        continue;
      }
      if (unit.type === 'worker') continue;
      if (infantry >= MAX_INSTANCES) continue;
      setInstance(meshes.infantryTorso, infantry, unit, isSelected, true);
      if (!farLod) {
        setInstance(meshes.infantryHead, infantry, unit, false);
        setInstance(meshes.infantryShako, infantry, unit, false);
        setInstance(meshes.infantryMusket, infantry, unit, false);
        setInstance(meshes.infantryPack, infantry, unit, false);
      }
      infantry++;
    }

    finish(meshes.infantryTorso, infantry);
    if (!farLod) {
      finish(meshes.infantryHead, infantry);
      finish(meshes.infantryShako, infantry);
      finish(meshes.infantryMusket, infantry);
      finish(meshes.infantryPack, infantry);
    }
    finish(meshes.officerTorso, officers);
    if (!farLod) {
      finish(meshes.officerHead, officers);
      finish(meshes.officerBicorne, officers);
    }
    finish(meshes.cavalryRider, cavalry);
    if (!farLod) {
      finish(meshes.cavalryHead, cavalry);
      finish(meshes.cavalryShako, cavalry);
      finish(meshes.cavalryHorseHead, cavalry);
      finish(meshes.cavalryHorseTail, cavalry);
    }
    finish(meshes.cavalryHorseBody, cavalry);
    finish(meshes.cavalryHorseNeck, cavalry);
    finish(meshes.artilleryBarrel, artillery);
    finish(meshes.artilleryCarriage, artillery);
    finish(meshes.artilleryTrail, artillery);
    finish(meshes.artilleryWheelL, artillery);
    finish(meshes.artilleryWheelR, artillery);
    finish(meshes.artilleryCrewTorso, artillery);
    if (!farLod) finish(meshes.artilleryCrewHead, artillery);
    diagnostics.updates++;
    diagnostics.lastUpdateAt = performance.now();
  }

  function attachWhenReady() {
    const scene = sceneHook.scene();
    if (!scene) {
      requestAnimationFrame(attachWhenReady);
      return;
    }
    scene.add(detailGroup);
    function tick() {
      const active = active3dRendering();
      detailGroup.visible = active;
      if (active) updateDetails();
      else diagnostics.skippedInactive++;
      setTimeout(tick, active && farLodActive() ? FAR_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS);
    }
    tick();
  }

  window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__ = Object.freeze({
    version: 'battlefield-3d-unit-detail-v1',
    updateIntervalMs: UPDATE_INTERVAL_MS,
    farUpdateIntervalMs: FAR_UPDATE_INTERVAL_MS,
    farLodCameraY: FAR_LOD_CAMERA_Y,
    maxInstances: MAX_INSTANCES,
    layerCount: Object.keys(meshes).length,
    visualRoles: ['infantry', 'officer', 'cavalry', 'artillery'],
    silhouetteFeatures: ['infantry-pack', 'horse-body-head-tail', 'gun-carriage-trail', 'artillery-crew'],
    performanceModel: 'shared-instanced-low-poly-detail',
    scheduler: 'adaptive-active-3d-lod',
    diagnostics: () => ({ ...diagnostics, active: active3dRendering() })
  });

  attachWhenReady();
}
