import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D selection feedback skipped: renderer bridge or scene hook unavailable.');
} else {
  const hills = source.staticWorld()?.hills || [];
  const MAX_SELECTED = 64;
  const UPDATE_INTERVAL_MS = 75;
  const FAR_UPDATE_INTERVAL_MS = 125;
  const ULTRA_FAR_UPDATE_INTERVAL_MS = 200;
  const FAR_LOD_CAMERA_Y = 900;
  const ULTRA_FAR_LOD_CAMERA_Y = 1120;

  const group = new THREE.Group();
  group.name = 'napoleonic-selection-feedback-v1';
  group.renderOrder = 20;

  const ringGeometry = new THREE.RingGeometry(8.5, 10.4, 24);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    vertexColors: true
  });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, MAX_SELECTED);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false;
  rings.count = 0;
  group.add(rings);

  const facingGeometry = new THREE.ConeGeometry(2.0, 7.0, 3);
  facingGeometry.rotateX(Math.PI / 2);
  facingGeometry.translate(0, 0.8, 14.0);
  const facingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    depthTest: false,
    vertexColors: true
  });
  const facingArrows = new THREE.InstancedMesh(facingGeometry, facingMaterial, MAX_SELECTED);
  facingArrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  facingArrows.frustumCulled = false;
  facingArrows.count = 0;
  group.add(facingArrows);

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const tempEuler = new THREE.Euler();
  const frenchColor = new THREE.Color(0x6ea3ff);
  const britishColor = new THREE.Color(0xff8a7f);
  const neutralColor = new THREE.Color(0xf3dc77);
  const selectedIds = new Set();

  const diagnostics = {
    updates: 0,
    skippedInactive: 0,
    skippedUltraFar: 0,
    selectedVisible: 0,
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

  function currentCameraY() {
    const cameraY = sceneHook.camera?.()?.position?.y;
    if (Number.isFinite(cameraY)) return cameraY;
    const cameraDistance = renderApi?.diagnostics?.().cameraDistance;
    return Number.isFinite(cameraDistance) ? cameraDistance * 0.82 : 0;
  }

  function currentLodMode() {
    const cameraY = currentCameraY();
    if (cameraY >= ULTRA_FAR_LOD_CAMERA_Y) return 'ultra-far';
    if (cameraY >= FAR_LOD_CAMERA_Y) return 'far';
    return 'near';
  }

  function active3dRendering() {
    if (document.hidden) return false;
    return !renderApi?.enabled || renderApi.enabled();
  }

  function unitColor(unit) {
    return unit.side === 'france' ? frenchColor : unit.side === 'britain' ? britishColor : neutralColor;
  }

  function updateFeedback(lodMode) {
    const snapshot = source.snapshot();
    selectedIds.clear();
    for (const id of snapshot.selection?.unitIds || []) selectedIds.add(id);

    let count = 0;
    for (const unit of snapshot.units || []) {
      if (count >= MAX_SELECTED) break;
      if (unit.dead || !selectedIds.has(unit.id)) continue;

      tempPosition.set(unit.x, hillHeightAt(unit.x, unit.y) + 0.45, unit.y);
      tempEuler.set(0, -(unit.facing || 0), 0);
      tempQuaternion.setFromEuler(tempEuler);
      const tacticalScale = lodMode === 'far' ? 1.24 : 1;
      tempScale.set(tacticalScale, tacticalScale, tacticalScale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

      const color = unitColor(unit);
      rings.setMatrixAt(count, tempMatrix);
      rings.setColorAt(count, color);
      if (lodMode === 'near') {
        facingArrows.setMatrixAt(count, tempMatrix);
        facingArrows.setColorAt(count, color);
      }
      count++;
    }

    rings.count = count;
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    facingArrows.count = lodMode === 'near' ? count : 0;
    if (lodMode === 'near') {
      facingArrows.instanceMatrix.needsUpdate = true;
      if (facingArrows.instanceColor) facingArrows.instanceColor.needsUpdate = true;
    }
    diagnostics.selectedVisible = count;
    diagnostics.updates++;
    diagnostics.lastUpdateAt = performance.now();
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
      diagnostics.lodMode = lodMode;
      const ultraFar = active && lodMode === 'ultra-far';
      group.visible = active && !ultraFar;
      if (!active) diagnostics.skippedInactive++;
      else if (ultraFar) diagnostics.skippedUltraFar++;
      else updateFeedback(lodMode);
      const delay = ultraFar ? ULTRA_FAR_UPDATE_INTERVAL_MS : lodMode === 'far' ? FAR_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS;
      setTimeout(tick, delay);
    }
    tick();
  }

  window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__ = Object.freeze({
    version: 'battlefield-3d-selection-feedback-v1',
    maxSelected: MAX_SELECTED,
    updateIntervalMs: UPDATE_INTERVAL_MS,
    farUpdateIntervalMs: FAR_UPDATE_INTERVAL_MS,
    ultraFarUpdateIntervalMs: ULTRA_FAR_UPDATE_INTERVAL_MS,
    farLodCameraY: FAR_LOD_CAMERA_Y,
    ultraFarLodCameraY: ULTRA_FAR_LOD_CAMERA_Y,
    feedback: ['faction-colored-selection-ring', 'near-lod-facing-arrow', 'far-lod-ring-scaling'],
    performanceModel: 'pooled-instanced-selection-feedback',
    diagnostics: () => ({ ...diagnostics, active: active3dRendering(), cameraY: currentCameraY() })
  });

  attachWhenReady();
}
