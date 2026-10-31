'use strict';
// Adaptive resolution. Nearly all of a frame is spent filling pixels (the
// ground, the scenery, the weather and light layers, the clouds), so a frame's
// cost follows the size of the canvas. The render budget fixes that size once;
// this governor watches the frame rate and draws a step less sharp when frames
// run long (below about 30 a second), and a step sharper again when there is
// room. If a lower resolution does not make frames faster (the simulation is
// what is slow), it goes back and leaves the resolution alone for a while.
// Only the canvas is scaled: CSS pixels, input and the HUD are untouched.
// Off with ?autores=0; automated test browsers keep the fixed budget unless
// they ask for it with ?autores=1.
(function installAdaptiveResolution(root) {
  const budget = root.__MOBILE_RENDER_BUDGET_V1__;
  if (!budget?.setScale || root.__ADAPTIVE_RESOLUTION_V1__) return;
  const params = new URLSearchParams(location.search);
  const enabled = params.get('autores') === '1' || (params.get('autores') !== '0' && !navigator.webdriver);
  const STEPS = [1, 0.85, 0.72, 0.6, 0.5];
  const SLOW_MS = 38, FAST_MS = 24;              // median frame: step down above, up below
  const WINDOW_MS = 1500, UP_AFTER = 4;          // windows of frames; up only after 6 s of room
  const SETTLE_MS = 1200;                        // frames right after a change are not judged
  const stats = { windows: 0, down: 0, up: 0, reverted: 0, lastMedian: 0 };
  let step = 0, frames = [], windowStart = 0, last = 0, settleUntil = 0, goodWindows = 0;
  let trial = null;              // { from, before } after a step down, to check it helped
  let holdUntil = 0;             // no steps down before this (a lower resolution did not help)
  let upBlockedUntil = 0;        // no steps up before this (the last step up was too much)
  let lastUpAt = -Infinity;

  function setStep(next, reason) {
    step = Math.max(0, Math.min(STEPS.length - 1, next));
    budget.setScale(STEPS[step], reason);
    settleUntil = performance.now() + SETTLE_MS;
    frames = []; windowStart = 0;
  }
  function judge(median, now) {
    stats.windows++; stats.lastMedian = Math.round(median * 10) / 10;
    // Did the last step down help? Less than a tenth faster: undo it and hold.
    if (trial) {
      const helped = median < trial.before * 0.9;
      if (!helped) { stats.reverted++; holdUntil = now + 30000; setStep(trial.from, 'adaptive-revert'); trial = null; return; }
      trial = null;
    }
    if (median > SLOW_MS) {
      goodWindows = 0;
      // Straight after a step up: that was too sharp, stay lower for a minute.
      if (now - lastUpAt < 8000) upBlockedUntil = now + 60000;
      if (now >= holdUntil && step < STEPS.length - 1) { stats.down++; trial = { from: step, before: median }; setStep(step + 1, 'adaptive-down'); }
      return;
    }
    if (median < FAST_MS && step > 0 && now >= upBlockedUntil) {
      if (++goodWindows >= UP_AFTER) { goodWindows = 0; stats.up++; lastUpAt = now; setStep(step - 1, 'adaptive-up'); }
    } else goodWindows = 0;
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = now - last; last = now;
    // A hidden tab, a stall or loading pictures says nothing about drawing.
    if (!enabled || document.hidden || dt <= 0 || dt > 400 || now < settleUntil || !root.__ISO_ASSETS_READY__) return;
    if (!windowStart) windowStart = now;
    frames.push(dt);
    if (now - windowStart >= WINDOW_MS && frames.length >= 8) {
      const sorted = frames.slice().sort((a, b) => a - b);
      judge(sorted[sorted.length >> 1], now);
      frames = []; windowStart = now;
    }
  }
  requestAnimationFrame(t => { last = t; tick(t); });
  root.__ADAPTIVE_RESOLUTION_V1__ = Object.freeze({
    version: '1.0', enabled, steps: STEPS,
    state: () => ({ enabled, step, scale: STEPS[step], renderDpr: budget.state()?.renderDpr, holding: performance.now() < holdUntil, ...stats }),
    // For tests and the test field: judge a window of this median frame time now.
    judge: median => judge(median, performance.now()),
    setStep: n => setStep(n, 'manual')
  });
})(window);
