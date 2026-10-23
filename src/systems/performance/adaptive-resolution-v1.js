'use strict';
// Adaptive resolution (open map only, NRTS_CONFIG.adaptiveResolution): on a
// screen with more than one pixel per CSS pixel, a heavy scene (a big battle)
// is drawn at a lower pixel density while frames are slow, and sharp again once
// they are quick for a while. Drawing at 1.0 instead of 1.5 is less than half
// the pixels. The game's render budget (mobile-render-budget-v1) applies the cap.
(function installAdaptiveResolutionV1(root) {
  const cfg = root.NRTS_CONFIG?.adaptiveResolution;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installAdaptiveResolutionV1(root), { once: true }); return; }
  const budget = root.__MOBILE_RENDER_BUDGET_V1__;
  if (root.__ADAPTIVE_RESOLUTION_V1__ || !budget) return;
  const stats = { lowered: 0, raised: 0 };
  let last = performance.now(), slow = 0, quick = 0, wait = cfg.raiseAfterMs, low = false;

  function set(on) {
    if (on === low) return;
    low = on;
    root.__ADAPTIVE_DPR_CAP__ = on ? cfg.lowDpr : undefined;
    if (on) stats.lowered++; else stats.raised++;
    budget.apply(on ? 'adaptive-low' : 'adaptive-restore');
  }
  function frame(now) {
    const dt = now - last; last = now;
    // Only the iso view (the 2D view keeps a second canvas at the main canvas's size).
    if (!root.__ISO_VIEW_V1__?.isOn?.()) { if (low) set(false); slow = quick = 0; requestAnimationFrame(frame); return; }
    // Ignore pauses (a hidden tab, a debugger) and screens already at one pixel.
    if (dt < 250 && (Number(root.devicePixelRatio) || 1) > cfg.lowDpr + 0.01 && !document.hidden) {
      if (dt > cfg.slowMs) { slow += dt; quick = 0; } else if (dt < cfg.quickMs) { quick += dt; slow = Math.max(0, slow - dt); }
      if (!low && slow > cfg.lowerAfterMs) { set(true); slow = 0; quick = 0; }
      // Back to sharp after a quick spell; if that proves too early, wait twice as long next time.
      else if (low && quick > wait) { set(false); quick = 0; wait = Math.min(cfg.maxWaitMs, wait * 2); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  root.__ADAPTIVE_RESOLUTION_V1__ = Object.freeze({ version: '1.0', set, state: () => ({ low, wait, ...stats, dpr: budget.state()?.renderDpr }) });
})(window);
