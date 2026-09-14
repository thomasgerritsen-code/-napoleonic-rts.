import * as THREE from 'three';

const source = window.NRTS_3D_SOURCE;
const sceneHook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const renderApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !sceneHook) {
  console.warn('3D regiment polish layer skipped: renderer bridge or scene hook unavailable.');
} else {
  const staticWorld = source.staticWorld();
  const hills = staticWorld.hills || [];
  const MAX_ACCENTS = 900;
  const MAX_DUST = 72;
  const UPDATE_INTERVAL_MS = 70;
  const FAR_UPDATE_INTERVAL_MS = 130;
  const ULTRA_FAR_UPDATE_INTERVAL_MS = 220;
  const FAR_LOD_CAMERA_Y = 900;
  const ULTRA_FAR_LOD_CAMERA_Y = 1120;
  const NEAR_RADIUS = 980;
  const FAR_RADIUS = 1180;
  const group = new THREE.Group();
  group.name = 'napoleonic-regiment-polish-v1';

  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const tempEuler = new THREE.Euler();
  const colorFrenchPlume = new THREE.Color(0xc7443e);
  const colorBritishPlume = new THREE.Color(0xf1eee4);
  const colorFrenchTrim = new THREE.Color(0xf0eee2);
  const colorBritishTrim = new THREE.Color(0xe0b64d);
  const colorFrenchSaddle = new THREE.Color(0x264f92);
  const colorBritishSaddle = new THREE.Color(0x9c3433);
  const previousPositions = new Map();
  const dust = [];

  const diagnostics = {
    updates: 0,
    skippedInactive: 0,
    skippedUltraFar: 0,
    lodTransitions: 0,
    lodMode: 'near',
    accentsVisible: 0,
    dustVisible: 0,
    dustSpawned: 0,
    culledByDistance: 0,
    movingUnits: 0,
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

  function instancedMesh(geometry, material, maxInstances) {
    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = true;
    group.add(mesh);
    return mesh;
  }

  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  const saddleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const dustMaterial = new THREE.MeshBasicMaterial({ color: 0xb8aa91, transparent: true, opacity: 0.22, depthWrite: false });

  const plumeGeometry = new THREE.CylinderGeometry(0.28, 0.38, 2.2, 5);
  plumeGeometry.translate(0, 18.4, 0);
  const trimGeometry = new THREE.BoxGeometry(5.5, 0.75, 4.05);
  trimGeometry.translate(0, 11.45, 0);
  const saddleGeometry = new THREE.BoxGeometry(9.2, 0.8, 8.6);
  saddleGeometry.translate(0, 8.1, -0.4);
  const dustGeometry = new THREE.SphereGeometry(1, 6, 4);

  const plumeMesh = instancedMesh(plumeGeometry, accentMaterial, MAX_ACCENTS);
  const trimMesh = instancedMesh(trimGeometry, accentMaterial.clone(), MAX_ACCENTS);
  const saddleMesh = instancedMesh(saddleGeometry, saddleMaterial, MAX_ACCENTS);
  const dustMesh = instancedMesh(dustGeometry, dustMaterial, MAX_DUST);

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
    const cameraY = currentCamera().y;
    if (cameraY >= ULTRA_FAR_LOD_CAMERA_Y) return 'ultra-far';
    if (cameraY >= FAR_LOD_CAMERA_Y) return 'far';
    return 'near';
  }

  function composeUnitMatrix(unit, yOffset = 0) {
    tempPosition.set(unit.x, hillHeightAt(unit.x, unit.y) + yOffset, unit.y);
    tempEuler.set(0, -(unit.facing || 0), 0);
    tempQuaternion.setFromEuler(tempEuler);
    tempScale.set(1, 1, 1);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
  }

  function setAccent(mesh, index, unit, color) {
    mesh.setMatrixAt(index, tempMatrix);
    mesh.setColorAt(index, color);
  }

  function finish(mesh, count) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function spawnDust(unit, movementDistance, farLod) {
    if (dust.length >= MAX_DUST) dust.shift();
    const cavalry = unit.type === 'cavalry';
    const artillery = unit.type === 'artillery';
    const size = cavalry ? 3.5 : artillery ? 2.8 : 1.9;
    const facing = unit.facing || 0;
    const rear = cavalry ? 6.5 : artillery ? 5.2 : 3.4;
    dust.push({
      x: unit.x + Math.sin(facing) * rear,
      z: unit.y + Math.cos(facing) * rear,
      born: performance.now(),
      ttl: farLod ? 520 : cavalry ? 760 : 620,
      size: size * Math.min(1.35, 0.8 + movementDistance * 0.18),
      driftX: Math.sin((unit.id?.length || 1) * 1.7) * 0.8,
      driftZ: Math.cos((unit.id?.length || 1) * 1.3) * 0.55
    });
    diagnostics.dustSpawned++;
  }

  function updateDust(now) {
    let write = 0;
    for (let i = 0; i < dust.length; i++) {
      const puff = dust[i];
      const age = now - puff.born;
      if (age >= puff.ttl) continue;
      dust[write++] = puff;
    }
    dust.length = write;

    for (let i = 0; i < dust.length; i++) {
      const puff = dust[i];
      const t = (now - puff.born) / puff.ttl;
      const scale = puff.size * (0.65 + t * 1.35);
      tempPosition.set(puff.x + puff.driftX * t, hillHeightAt(puff.x, puff.z) + 0.35 + t * 1.4, puff.z + puff.driftZ * t);
      tempQuaternion.identity();
      tempScale.set(scale * 1.35, Math.max(0.35, scale * 0.42), scale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      dustMesh.setMatrixAt(i, tempMatrix);
    }
    finish(dustMesh, dust.length);
    diagnostics.dustVisible = dust.length;
  }

  function clearVisuals() {
    plumeMesh.count = 0;
    trimMesh.count = 0;
    saddleMesh.count = 0;
    dustMesh.count = 0;
    dust.length = 0;
    diagnostics.accentsVisible = 0;
    diagnostics.dustVisible = 0;
  }

  function updatePolish(lodMode) {
    const snapshot = source.snapshot();
    const camera = currentCamera();
    const farLod = lodMode === 'far';
    const radius = farLod ? FAR_RADIUS : NEAR_RADIUS;
    const radiusSq = radius * radius;
    const seen = new Set();
    let plumeCount = 0;
    let trimCount = 0;
    let saddleCount = 0;
    let movingUnits = 0;

    for (const unit of snapshot.units || []) {
      if (unit.dead || unit.type === 'worker') continue;
      seen.add(unit.id);
      const dx = unit.x - camera.x;
      const dz = unit.y - camera.z;
      if (dx * dx + dz * dz > radiusSq) {
        diagnostics.culledByDistance++;
        previousPositions.set(unit.id, { x: unit.x, y: unit.y });
        continue;
      }

      const previous = previousPositions.get(unit.id);
      const movementDistance = previous ? Math.hypot(unit.x - previous.x, unit.y - previous.y) : 0;
      const moving = movementDistance > 0.12;
      if (moving) {
        movingUnits++;
        const cadence = farLod ? 5 : unit.type === 'cavalry' ? 2 : 3;
        if ((diagnostics.updates + (unit.id?.length || 0)) % cadence === 0) spawnDust(unit, movementDistance, farLod);
      }
      previousPositions.set(unit.id, { x: unit.x, y: unit.y });

      if (farLod || plumeCount >= MAX_ACCENTS) continue;
      composeUnitMatrix(unit);
      const french = unit.side === 'france';
      if (unit.type === 'cavalry') {
        setAccent(plumeMesh, plumeCount, unit, french ? colorFrenchPlume : colorBritishPlume);
        plumeCount++;
        if (saddleCount < MAX_ACCENTS) {
          setAccent(saddleMesh, saddleCount, unit, french ? colorFrenchSaddle : colorBritishSaddle);
          saddleCount++;
        }
        continue;
      }
      if (unit.type === 'artillery') {
        if (trimCount < MAX_ACCENTS) {
          setAccent(trimMesh, trimCount, unit, french ? colorFrenchTrim : colorBritishTrim);
          trimCount++;
        }
        continue;
      }
      setAccent(plumeMesh, plumeCount, unit, french ? colorFrenchPlume : colorBritishPlume);
      plumeCount++;
      if (trimCount < MAX_ACCENTS) {
        setAccent(trimMesh, trimCount, unit, french ? colorFrenchTrim : colorBritishTrim);
        trimCount++;
      }
    }

    for (const id of previousPositions.keys()) if (!seen.has(id)) previousPositions.delete(id);
    if (!farLod) {
      finish(plumeMesh, plumeCount);
      finish(trimMesh, trimCount);
      finish(saddleMesh, saddleCount);
    } else {
      plumeMesh.count = 0;
      trimMesh.count = 0;
      saddleMesh.count = 0;
    }
    updateDust(performance.now());
    diagnostics.accentsVisible = plumeCount + trimCount + saddleCount;
    diagnostics.movingUnits = movingUnits;
    diagnostics.updates++;
    diagnostics.lastUpdateAt = performance.now();
  }

  function applyLod(lodMode) {
    if (diagnostics.lodMode !== lodMode) {
      diagnostics.lodMode = lodMode;
      diagnostics.lodTransitions++;
    }
    const accentsVisible = lodMode === 'near';
    plumeMesh.visible = accentsVisible;
    trimMesh.visible = accentsVisible;
    saddleMesh.visible = accentsVisible;
    dustMesh.visible = lodMode !== 'ultra-far';
  }

  function attachWhenReady() {
    const scene = sceneHook.scene();
    if (!scene) { requestAnimationFrame(attachWhenReady); return; }
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
        updatePolish(lodMode);
      }
      const delay = ultraFar ? ULTRA_FAR_UPDATE_INTERVAL_MS : lodMode === 'far' ? FAR_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS;
      setTimeout(tick, delay);
    }
    tick();
  }

  window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__ = Object.freeze({
    version: 'battlefield-3d-regiment-polish-v1',
    maxAccents: MAX_ACCENTS,
    maxDust: MAX_DUST,
    nearRadius: NEAR_RADIUS,
    farRadius: FAR_RADIUS,
    farLodCameraY: FAR_LOD_CAMERA_Y,
    ultraFarLodCameraY: ULTRA_FAR_LOD_CAMERA_Y,
    visualFeatures: ['faction-plumes', 'faction-shoulder-trim', 'cavalry-saddlecloth', 'movement-dust'],
    performanceModel: 'instanced-near-detail-pooled-motion-dust-distance-culled-lod',
    diagnostics: () => ({ ...diagnostics, active: active3dRendering(), cameraY: currentCamera().y })
  });

  attachWhenReady();
}
