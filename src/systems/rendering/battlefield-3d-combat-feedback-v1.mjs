import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D combat feedback skipped: renderer bridge or scene hook unavailable.');
} else {
  const hills = source.staticWorld()?.hills || [];
  const MAX_SMOKE = 96;
  const MAX_FLASH = 48;
  const MAX_TRACKED_SHOTS = 256;
  const UPDATE_INTERVAL_MS = 50;
  const FAR_UPDATE_INTERVAL_MS = 100;
  const ULTRA_FAR_UPDATE_INTERVAL_MS = 200;
  const FAR_LOD_CAMERA_Y = 900;
  const ULTRA_FAR_LOD_CAMERA_Y = 1120;
  const MUSKET_SMOKE_LIFE = 1.45;
  const ARTILLERY_SMOKE_LIFE = 2.35;
  const FLASH_LIFE = 0.11;

  const group = new THREE.Group();
  group.name = 'napoleonic-combat-feedback-v1';
  group.renderOrder = 12;

  const smokeGeometry = new THREE.IcosahedronGeometry(1, 1);
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    vertexColors: true
  });
  const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, MAX_SMOKE);
  smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  smoke.frustumCulled = false;
  smoke.count = 0;
  group.add(smoke);

  const flashGeometry = new THREE.OctahedronGeometry(1, 0);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    depthTest: true,
    vertexColors: true
  });
  const flash = new THREE.InstancedMesh(flashGeometry, flashMaterial, MAX_FLASH);
  flash.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flash.frustumCulled = false;
  flash.count = 0;
  group.add(flash);

  const smokePool = Array.from({ length: MAX_SMOKE }, () => ({ active: false }));
  const flashPool = Array.from({ length: MAX_FLASH }, () => ({ active: false }));
  const lastShotByUnit = new Map();
  let smokeCursor = 0;
  let flashCursor = 0;

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const identityQuaternion = new THREE.Quaternion();
  const smokeColor = new THREE.Color();
  const musketSmokeColor = new THREE.Color(0xbfc1bb);
  const artillerySmokeColor = new THREE.Color(0xa9aaa3);
  const musketFlashColor = new THREE.Color(0xffd77a);
  const artilleryFlashColor = new THREE.Color(0xffbc55);

  const diagnostics = {
    updates: 0,
    emittedMusket: 0,
    emittedArtillery: 0,
    droppedTrackedShots: 0,
    skippedInactive: 0,
    skippedUltraFar: 0,
    smokeVisible: 0,
    flashVisible: 0,
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

  function active3dRendering() {
    if (document.hidden) return false;
    return !renderApi?.enabled || renderApi.enabled();
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

  function allocate(pool, cursorKey) {
    if (cursorKey === 'smoke') {
      const item = pool[smokeCursor];
      smokeCursor = (smokeCursor + 1) % pool.length;
      return item;
    }
    const item = pool[flashCursor];
    flashCursor = (flashCursor + 1) % pool.length;
    return item;
  }

  function muzzlePoint(unit, artillery) {
    const facing = unit.facing || 0;
    const distance = artillery ? 18 : 13;
    return {
      x: unit.x + Math.cos(facing) * distance,
      z: unit.y + Math.sin(facing) * distance,
      y: hillHeightAt(unit.x, unit.y) + (artillery ? 6.2 : 10.8),
      facing
    };
  }

  function emitSmoke(point, now, artillery, seed = 0) {
    const puff = allocate(smokePool, 'smoke');
    const spread = artillery ? 4.8 : 2.2;
    const angle = point.facing + (seed - 0.5) * 0.32;
    puff.active = true;
    puff.born = now;
    puff.life = artillery ? ARTILLERY_SMOKE_LIFE : MUSKET_SMOKE_LIFE;
    puff.x = point.x + Math.cos(angle) * spread * seed;
    puff.y = point.y + seed * 1.2;
    puff.z = point.z + Math.sin(angle) * spread * seed;
    puff.driftX = Math.cos(angle) * (artillery ? 4.0 : 2.1) + 0.8;
    puff.driftZ = Math.sin(angle) * (artillery ? 4.0 : 2.1) + 0.25;
    puff.rise = artillery ? 8.0 + seed * 3.0 : 5.2 + seed * 2.0;
    puff.startScale = artillery ? 3.6 + seed * 1.8 : 2.0 + seed * 1.1;
    puff.growth = artillery ? 8.8 + seed * 4.0 : 5.2 + seed * 2.2;
    puff.artillery = artillery;
  }

  function emitFlash(point, now, artillery) {
    const burst = allocate(flashPool, 'flash');
    burst.active = true;
    burst.born = now;
    burst.life = FLASH_LIFE;
    burst.x = point.x;
    burst.y = point.y;
    burst.z = point.z;
    burst.scale = artillery ? 5.8 : 3.2;
    burst.artillery = artillery;
  }

  function rememberShot(unitId, started) {
    if (lastShotByUnit.size >= MAX_TRACKED_SHOTS && !lastShotByUnit.has(unitId)) {
      const firstKey = lastShotByUnit.keys().next().value;
      lastShotByUnit.delete(firstKey);
      diagnostics.droppedTrackedShots++;
    }
    lastShotByUnit.set(unitId, started);
  }

  function collectNewShots(snapshot, lodMode) {
    if (lodMode === 'ultra-far') return;
    const now = snapshot.elapsed || 0;
    for (const unit of snapshot.units || []) {
      if (unit.dead) continue;
      const event = unit.combatVisualV1;
      if (!event || (event.kind !== 'musket-fire' && event.kind !== 'artillery-fire')) continue;
      if (!Number.isFinite(event.started)) continue;
      if (lastShotByUnit.get(unit.id) === event.started) continue;
      rememberShot(unit.id, event.started);

      const artillery = event.kind === 'artillery-fire';
      const point = muzzlePoint(unit, artillery);
      emitFlash(point, now, artillery);

      if (artillery) {
        emitSmoke(point, now, true, 0.15);
        emitSmoke(point, now, true, 0.48);
        emitSmoke(point, now, true, 0.82);
        diagnostics.emittedArtillery++;
      } else {
        emitSmoke(point, now, false, 0.25);
        if (lodMode === 'near') emitSmoke(point, now, false, 0.72);
        diagnostics.emittedMusket++;
      }
    }
  }

  function updateSmoke(now, lodMode) {
    let count = 0;
    for (const puff of smokePool) {
      if (!puff.active) continue;
      const age = now - puff.born;
      if (age < 0 || age >= puff.life) {
        puff.active = false;
        continue;
      }
      if (count >= MAX_SMOKE) break;
      const t = age / puff.life;
      const tacticalReduction = lodMode === 'far' ? 0.8 : 1;
      const scale = (puff.startScale + puff.growth * t) * tacticalReduction * Math.max(0.2, 1 - t * 0.45);
      tempPosition.set(
        puff.x + puff.driftX * age,
        puff.y + puff.rise * age,
        puff.z + puff.driftZ * age
      );
      tempScale.set(scale, scale * 0.82, scale);
      tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
      smoke.setMatrixAt(count, tempMatrix);
      smokeColor.copy(puff.artillery ? artillerySmokeColor : musketSmokeColor).multiplyScalar(1 - t * 0.22);
      smoke.setColorAt(count, smokeColor);
      count++;
    }
    smoke.count = count;
    smoke.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
    diagnostics.smokeVisible = count;
  }

  function updateFlashes(now, lodMode) {
    let count = 0;
    for (const burst of flashPool) {
      if (!burst.active) continue;
      const age = now - burst.born;
      if (age < 0 || age >= burst.life) {
        burst.active = false;
        continue;
      }
      if (count >= MAX_FLASH) break;
      const t = age / burst.life;
      const scale = burst.scale * (1 - t) * (lodMode === 'far' ? 0.82 : 1);
      tempPosition.set(burst.x, burst.y, burst.z);
      tempScale.set(scale * 1.45, scale, scale * 1.45);
      tempMatrix.compose(tempPosition, tempQuaternion.copy(identityQuaternion), tempScale);
      flash.setMatrixAt(count, tempMatrix);
      flash.setColorAt(count, burst.artillery ? artilleryFlashColor : musketFlashColor);
      count++;
    }
    flash.count = count;
    flash.instanceMatrix.needsUpdate = true;
    if (flash.instanceColor) flash.instanceColor.needsUpdate = true;
    diagnostics.flashVisible = count;
  }

  function updateFeedback(lodMode) {
    const snapshot = source.snapshot();
    const now = snapshot.elapsed || 0;
    collectNewShots(snapshot, lodMode);
    updateSmoke(now, lodMode);
    updateFlashes(now, lodMode);
    diagnostics.updates++;
    diagnostics.lastUpdateAt = performance.now();
  }

  function clearVisibleInstances() {
    smoke.count = 0;
    flash.count = 0;
    diagnostics.smokeVisible = 0;
    diagnostics.flashVisible = 0;
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
      if (!active) {
        diagnostics.skippedInactive++;
        clearVisibleInstances();
      } else if (ultraFar) {
        diagnostics.skippedUltraFar++;
        clearVisibleInstances();
      } else {
        updateFeedback(lodMode);
      }
      const delay = ultraFar ? ULTRA_FAR_UPDATE_INTERVAL_MS : lodMode === 'far' ? FAR_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS;
      setTimeout(tick, delay);
    }
    tick();
  }

  window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__ = Object.freeze({
    version: 'battlefield-3d-combat-feedback-v1',
    maxSmoke: MAX_SMOKE,
    maxFlash: MAX_FLASH,
    farLodCameraY: FAR_LOD_CAMERA_Y,
    ultraFarLodCameraY: ULTRA_FAR_LOD_CAMERA_Y,
    effects: ['musket-muzzle-flash', 'musket-smoke', 'artillery-muzzle-flash', 'layered-artillery-smoke'],
    performanceModel: 'fixed-pool-instanced-effects-with-distance-lod',
    diagnostics: () => ({ ...diagnostics, active: active3dRendering(), cameraY: currentCameraY() })
  });

  attachWhenReady();
}
