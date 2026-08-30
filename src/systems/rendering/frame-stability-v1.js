'use strict';
// ---------- Architecture v2.2: outer-frame visual stability ----------
// One coherent visual snapshot is applied around the FINAL draw chain so every
// renderer/overlay sees the same interpolated unit and camera coordinates.
(function installFrameStabilityV1(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before frame stability.');

  const visualUnits = new Map();
  const visualCamera = { initialized:false, x:0, y:0, zoom:1 };
  let lastFrameAt = 0;

  const expBlend = (rate, dt) => 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  const angleDelta = (to, from) => {
    if (typeof normalizeAngleV063 === 'function') return normalizeAngleV063(to - from);
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  };
  const lerpAngle = (from, to, alpha) => from + angleDelta(to, from) * alpha;

  function desiredUnitPose(u, alpha) {
    const hasPrevious = Number.isFinite(u.renderPrevXV071) && Number.isFinite(u.renderPrevYV071);
    if (!hasPrevious) return { x:u.x, y:u.y, facing:u.facing || 0 };
    const prevFacing = Number.isFinite(u.renderPrevFacingV071) ? u.renderPrevFacingV071 : (u.facing || 0);
    return {
      x: u.renderPrevXV071 + (u.x - u.renderPrevXV071) * alpha,
      y: u.renderPrevYV071 + (u.y - u.renderPrevYV071) * alpha,
      facing: lerpAngle(prevFacing, u.facing || 0, alpha)
    };
  }

  function smoothUnitPose(u, desired, dt) {
    let visual = visualUnits.get(u.id);
    const teleport = visual && Math.hypot(desired.x - visual.x, desired.y - visual.y) > 110;
    if (!visual || teleport || !Number.isFinite(visual.x) || !Number.isFinite(visual.y)) {
      visual = { x:desired.x, y:desired.y, facing:desired.facing };
      visualUnits.set(u.id, visual);
      return visual;
    }

    // A short visual-only low-pass removes one/two pixel correction reversals from
    // formation followers without changing simulation positions or path timing.
    const positionBlend = expBlend(42, dt);
    const facingBlend = expBlend(34, dt);
    visual.x += (desired.x - visual.x) * positionBlend;
    visual.y += (desired.y - visual.y) * positionBlend;
    visual.facing += angleDelta(desired.facing, visual.facing) * facingBlend;
    return visual;
  }

  function smoothCamera(dt) {
    if (!visualCamera.initialized ||
        Math.hypot(camera.x - visualCamera.x, camera.y - visualCamera.y) > 360 ||
        Math.abs(camera.zoom - visualCamera.zoom) > 0.45) {
      visualCamera.initialized = true;
      visualCamera.x = camera.x;
      visualCamera.y = camera.y;
      visualCamera.zoom = camera.zoom;
      return visualCamera;
    }
    const positionBlend = expBlend(24, dt);
    const zoomBlend = expBlend(30, dt);
    visualCamera.x += (camera.x - visualCamera.x) * positionBlend;
    visualCamera.y += (camera.y - visualCamera.y) * positionBlend;
    visualCamera.zoom += (camera.zoom - visualCamera.zoom) * zoomBlend;
    return visualCamera;
  }

  function renderStableFrameV1(drawFrame, now = performance.now()) {
    if (typeof drawFrame !== 'function') return;
    const manual = typeof TEST_MANUAL_SIMULATION !== 'undefined' && TEST_MANUAL_SIMULATION;
    if (manual) return drawFrame();

    const frameDt = lastFrameAt ? Math.max(0.001, Math.min(0.05, (now - lastFrameAt) / 1000)) : 1 / 60;
    lastFrameAt = now;
    const alpha = typeof V071_RENDER_ALPHA === 'number' ? Math.max(0, Math.min(1, V071_RENDER_ALPHA)) : 1;
    const savedAlpha = typeof V071_RENDER_ALPHA === 'number' ? V071_RENDER_ALPHA : null;
    const savedUnits = [];
    const livingIds = new Set();

    for (const u of units) {
      if (u.dead) continue;
      livingIds.add(u.id);
      const desired = desiredUnitPose(u, alpha);
      const visual = smoothUnitPose(u, desired, frameDt);
      savedUnits.push([u, u.x, u.y, u.facing]);
      u.x = visual.x;
      u.y = visual.y;
      u.facing = visual.facing;
    }
    for (const id of visualUnits.keys()) if (!livingIds.has(id)) visualUnits.delete(id);

    const savedCamera = [camera.x, camera.y, camera.zoom];
    const cameraVisual = smoothCamera(frameDt);
    camera.x = cameraVisual.x;
    camera.y = cameraVisual.y;
    camera.zoom = cameraVisual.zoom;

    // The older fixed-step draw wrapper must not interpolate a second time. Its
    // runtime check sees alpha=1 while this outer snapshot is active.
    if (savedAlpha !== null) V071_RENDER_ALPHA = 1;
    try {
      if (typeof V071_STATS !== 'undefined') V071_STATS.renderFrames++;
      drawFrame();
    } finally {
      if (savedAlpha !== null) V071_RENDER_ALPHA = savedAlpha;
      camera.x = savedCamera[0];
      camera.y = savedCamera[1];
      camera.zoom = savedCamera[2];
      for (const [u, x, y, facing] of savedUnits) {
        u.x = x;
        u.y = y;
        u.facing = facing;
      }
    }
  }

  const api = Object.freeze({
    version:'frame-stability-v1',
    phase:'architecture-v2.2',
    outerFrameSnapshot:true,
    unitInterpolation:true,
    microJitterFilter:true,
    cameraSmoothing:true,
    simulationStatePreserved:true
  });
  global.renderStableFrameV1 = renderStableFrameV1;
  global.__FRAME_STABILITY_V1__ = api;
  nrts.subsystems.register('frame-stability', api, {
    phase:'architecture-v2.2',
    legacyBridge:false,
    responsibility:'single coherent interpolated visual snapshot for units, camera and all final render overlays'
  });
})(window);
