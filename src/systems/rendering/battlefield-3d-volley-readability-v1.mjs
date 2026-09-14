import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D volley readability skipped: renderer bridge or scene hook unavailable.');
} else {
  const MAX_VOLLEY_RIBBONS = 32;
  const MAX_CANNON_STREAKS = 12;
  const MAX_TRACKED = 160;
  const NEAR_UPDATE_MS = 55;
  const MID_UPDATE_MS = 95;
  const MID_CAMERA_Y = 680;
  const FAR_CAMERA_Y = 900;
  const EFFECT_RADIUS = 850;
  const RIBBON_LIFE = 0.24;
  const STREAK_LIFE = 0.16;

  const group = new THREE.Group();
  group.name = 'napoleonic-volley-readability-v1';
  group.renderOrder = 12;

  const ribbonGeometry = new THREE.PlaneGeometry(1, 1);
  ribbonGeometry.rotateX(-Math.PI / 2);
  const ribbonMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe4aa,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const ribbons = new THREE.InstancedMesh(ribbonGeometry, ribbonMaterial, MAX_VOLLEY_RIBBONS);
  ribbons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ribbons.frustumCulled = false;
  ribbons.count = 0;
  group.add(ribbons);

  const streakGeometry = new THREE.PlaneGeometry(1, 1);
  streakGeometry.rotateX(-Math.PI / 2);
  const streakMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc36c,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const streaks = new THREE.InstancedMesh(streakGeometry, streakMaterial, MAX_CANNON_STREAKS);
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streaks.frustumCulled = false;
  streaks.count = 0;
  group.add(streaks);

  const ribbonPool = Array.from({ length: MAX_VOLLEY_RIBBONS }, () => ({ active: false }));
  const streakPool = Array.from({ length: MAX_CANNON_STREAKS }, () => ({ active: false }));
  const tracked = new Map();
  let ribbonCursor = 0;
  let streakCursor = 0;
  let previousRibbonCount = 0;
  let previousStreakCount = 0;

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const diagnostics = {
    updates: 0,
    emittedVolleyRibbons: 0,
    emittedCannonStreaks: 0,
    culledByDistance: 0,
    skippedFar: 0,
    skippedInactive: 0,
    midLodUpdates: 0,
    ribbonsVisible: 0,
    streaksVisible: 0,
    lastUpdateAt: 0
  };

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

  function terrainHeight(x, z) {
    const sample = source.terrainHeight?.(x, z);
    return Number.isFinite(sample) ? sample : 0;
  }

  function remember(id, started) {
    if (tracked.size >= MAX_TRACKED && !tracked.has(id)) tracked.delete(tracked.keys().next().value);
    tracked.set(id, started);
  }

  function allocateRibbon() {
    const item = ribbonPool[ribbonCursor];
    ribbonCursor = (ribbonCursor + 1) % MAX_VOLLEY_RIBBONS;
    return item;
  }

  function allocateStreak() {
    const item = streakPool[streakCursor];
    streakCursor = (streakCursor + 1) % MAX_CANNON_STREAKS;
    return item;
  }

  function emitRibbon(unit, now, midLod) {
    const facing = unit.facing || 0;
    const forwardX = Math.cos(facing);
    const forwardZ = Math.sin(facing);
    const item = allocateRibbon();
    item.active = true;
    item.born = now;
    item.life = RIBBON_LIFE;
    item.x = unit.x + forwardX * 16;
    item.z = unit.y + forwardZ * 16;
    item.y = terrainHeight(item.x, item.z) + 0.9;
    item.facing = facing;
    item.width = midLod ? 20 : 28;
    diagnostics.emittedVolleyRibbons++;
  }

  function emitCannonStreak(unit, now) {
    const facing = unit.facing || 0;
    const forwardX = Math.cos(facing);
    const forwardZ = Math.sin(facing);
    const item = allocateStreak();
    item.active = true;
    item.born = now;
    item.life = STREAK_LIFE;
    item.x = unit.x + forwardX * 20;
    item.z = unit.y + forwardZ * 20;
    item.y = terrainHeight(item.x, item.z) + 0.75;
    item.facing = facing;
    diagnostics.emittedCannonStreaks++;
  }

  function collect(snapshot, midLod) {
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
      if (event.kind === 'musket-fire') emitRibbon(unit, now, midLod);
      else if (!midLod) emitCannonStreak(unit, now);
    }
  }

  function updateRibbons(now) {
    let count = 0;
    for (const item of ribbonPool) {
      if (!item.active) continue;
      const age = now - item.born;
      if (age < 0 || age >= item.life) {
        item.active = false;
        continue;
      }
      const t = age / item.life;
      const width = item.width * (1 + t * 0.18);
      const depth = Math.max(0.35, 1.55 * (1 - t));
      tempPosition.set(item.x, item.y, item.z);
      tempQuaternion.setFromAxisAngle(yAxis, -item.facing);
      tempScale.set(width, 1, depth);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      ribbons.setMatrixAt(count, tempMatrix);
      count++;
      if (count >= MAX_VOLLEY_RIBBONS) break;
    }
    ribbons.count = count;
    if (count > 0 || previousRibbonCount > 0) ribbons.instanceMatrix.needsUpdate = true;
    previousRibbonCount = count;
    diagnostics.ribbonsVisible = count;
  }

  function updateStreaks(now) {
    let count = 0;
    for (const item of streakPool) {
      if (!item.active) continue;
      const age = now - item.born;
      if (age < 0 || age >= item.life) {
        item.active = false;
        continue;
      }
      const t = age / item.life;
      tempPosition.set(item.x, item.y, item.z);
      tempQuaternion.setFromAxisAngle(yAxis, -item.facing);
      tempScale.set(4.5 + t * 3.5, 1, Math.max(1.2, 12 * (1 - t)));
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      streaks.setMatrixAt(count, tempMatrix);
      count++;
      if (count >= MAX_CANNON_STREAKS) break;
    }
    streaks.count = count;
    if (count > 0 || previousStreakCount > 0) streaks.instanceMatrix.needsUpdate = true;
    previousStreakCount = count;
    diagnostics.streaksVisible = count;
  }

  function clearVisible() {
    ribbons.count = 0;
    streaks.count = 0;
    if (previousRibbonCount > 0) ribbons.instanceMatrix.needsUpdate = true;
    if (previousStreakCount > 0) streaks.instanceMatrix.needsUpdate = true;
    previousRibbonCount = 0;
    previousStreakCount = 0;
    diagnostics.ribbonsVisible = 0;
    diagnostics.streaksVisible = 0;
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
      const height = cameraY();
      const far = active && height >= FAR_CAMERA_Y;
      const midLod = active && height >= MID_CAMERA_Y && !far;
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
        collect(snapshot, midLod);
        updateRibbons(now);
        updateStreaks(now);
        diagnostics.updates++;
        if (midLod) diagnostics.midLodUpdates++;
        diagnostics.lastUpdateAt = performance.now();
      }
      setTimeout(tick, far ? 160 : (midLod ? MID_UPDATE_MS : NEAR_UPDATE_MS));
    }
    tick();
  }

  window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__ = Object.freeze({
    version: 'battlefield-3d-volley-readability-v1',
    maxVolleyRibbons: MAX_VOLLEY_RIBBONS,
    maxCannonStreaks: MAX_CANNON_STREAKS,
    midCameraY: MID_CAMERA_Y,
    farCameraY: FAR_CAMERA_Y,
    effectRadius: EFFECT_RADIUS,
    effects: ['regiment-volley-ribbon', 'directional-cannon-streak', 'adaptive-mid-lod'],
    performanceModel: 'fixed-pool-distance-culled-adaptive-lod-readability',
    diagnostics: () => ({ ...diagnostics, active: active3d(), cameraY: cameraY() })
  });

  attachWhenReady();
}
