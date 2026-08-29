'use strict';
// ---------- Architecture v2: fixed-step movement runtime ----------
// Keeps production simulation at 60 Hz and interpolation visual-only.

if (V071_ACTIVE) {
  document.title = `Napoleonic RTS v${V071_VERSION}`;
  const badge = document.querySelector('.version');
  if (badge) badge.textContent = `v${V071_VERSION}`;

  const updateV070ForV071 = update;
  update = function updateV071(dt) {
    const manual = typeof TEST_MANUAL_SIMULATION !== 'undefined' && TEST_MANUAL_SIMULATION;
    if (manual) {
      V071_RENDER_ALPHA = 1;
      return updateV070ForV071(dt);
    }

    const simulationCfg = window.NRTS_CONFIG?.simulation || {};
    const maxFrameDt = Number.isFinite(simulationCfg.maxFrameDt) ? simulationCfg.maxFrameDt : 0.05;
    const maxCatchUpSteps = Number.isFinite(simulationCfg.maxCatchUpSteps) ? simulationCfg.maxCatchUpSteps : 8;
    V071_ACCUMULATOR = Math.min(0.20, V071_ACCUMULATOR + Math.max(0, Math.min(maxFrameDt, dt)));
    let steps = 0;
    while (V071_ACCUMULATOR >= V071_FIXED_DT && steps < maxCatchUpSteps) {
      for (const u of units) {
        if (u.dead) continue;
        u.renderPrevXV071 = u.x;
        u.renderPrevYV071 = u.y;
        u.renderPrevFacingV071 = u.facing;
      }
      updateV070ForV071(V071_FIXED_DT);
      V071_ACCUMULATOR -= V071_FIXED_DT;
      V071_STATS.fixedSteps++;
      steps++;
    }
    if (steps >= maxCatchUpSteps && V071_ACCUMULATOR >= V071_FIXED_DT) {
      V071_STATS.droppedFixedTime += V071_ACCUMULATOR;
      V071_ACCUMULATOR %= V071_FIXED_DT;
    }
    V071_RENDER_ALPHA = clampV064(V071_ACCUMULATOR / V071_FIXED_DT, 0, 1);
  };

  const drawV070ForV071 = draw;
  draw = function drawV071() {
    const manual = typeof TEST_MANUAL_SIMULATION !== 'undefined' && TEST_MANUAL_SIMULATION;
    if (manual || V071_RENDER_ALPHA >= 0.999) return drawV070ForV071();
    const saved = [];
    for (const u of units) {
      if (u.dead || !Number.isFinite(u.renderPrevXV071) || !Number.isFinite(u.renderPrevYV071)) continue;
      saved.push([u,u.x,u.y,u.facing]);
      u.x = u.renderPrevXV071 + (u.x-u.renderPrevXV071) * V071_RENDER_ALPHA;
      u.y = u.renderPrevYV071 + (u.y-u.renderPrevYV071) * V071_RENDER_ALPHA;
      if (Number.isFinite(u.renderPrevFacingV071)) {
        const fd = normalizeAngleV063(u.facing-u.renderPrevFacingV071);
        u.facing = normalizeAngleV063(u.renderPrevFacingV071 + fd * V071_RENDER_ALPHA);
      }
    }
    try {
      V071_STATS.renderFrames++;
      drawV070ForV071();
    } finally {
      for (const [u,x,y,facing] of saved) { u.x=x; u.y=y; u.facing=facing; }
    }
  };

  const resetGameV070ForV071 = resetGame;
  resetGame = function resetGameV071() {
    resetGameV070ForV071();
    V071_ACCUMULATOR = 0;
    V071_RENDER_ALPHA = 1;
    for (const key of Object.keys(V071_STATS)) {
      if (typeof V071_STATS[key] === 'number') V071_STATS[key] = 0;
    }
    V071_STATS.solver = 'anchor-damped-slots-fixed60-render-interp';
    statusEl.textContent = 'v0.7.1: vloeiende bataljonsmars met 60 Hz simulatie, gedempte formatieslots en renderinterpolatie.';
  };
}
