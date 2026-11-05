'use strict';
(function installMobileRenderBudgetV1(root) {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const CONTRACT = Object.freeze({
    version: 'mobile-render-budget-v1',
    desktopDprCap: 1.5,
    mobileDprCap: 1.5,
    desktopMaxBackingPixels: 2200000,
    minDesktopDpr: 0.75,
    mobileShortEdgeCssPx: 700,
    preservesCssViewport: true,
    sharedWorldInputCoordinates: true
  });

  let applications = 0;
  let last = null;
  // Share of the budget actually drawn (1 = full). The adaptive resolution
  // governor lowers it when frames run long and raises it again with headroom.
  let scale = 1;
  const MIN_RENDER_DPR = 0.6;

  function mobileTarget() {
    const shortEdge = Math.min(innerWidth || 0, innerHeight || 0);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return coarse || shortEdge <= CONTRACT.mobileShortEdgeCssPx;
  }

  // The iso view (NRTS_CONFIG.render, open map only) may draw sharper than the 2D map.
  const caps = () => ({ ...CONTRACT, ...(root.NRTS_CONFIG?.render || {}) });
  function desiredDpr() {
    const nativeDpr = Math.max(1, Number(root.devicePixelRatio) || 1), cap = caps();
    if (mobileTarget()) return Math.min(nativeDpr, cap.mobileDprCap);
    // A large monitor may otherwise require 4-8x as many pixels as a phone
    // on every frame, despite showing the same simulation.
    const viewportPixels = Math.max(1, Math.floor(innerWidth) * Math.floor(innerHeight));
    const pixelCapDpr = Math.max(cap.minDesktopDpr,
      Math.sqrt(cap.desktopMaxBackingPixels / viewportPixels));
    return Math.min(nativeDpr, cap.desktopDprCap, pixelCapDpr);
  }

  function apply(reason = 'manual') {
    const full = desiredDpr(), dpr = scale < 1 ? Math.max(Math.min(full, MIN_RENDER_DPR), Math.round(full * scale * 100) / 100) : full;
    const cssWidth = Math.max(1, Math.floor(innerWidth));
    const cssHeight = Math.max(1, Math.floor(innerHeight));
    const width = Math.max(1, Math.floor(cssWidth * dpr));
    const height = Math.max(1, Math.floor(cssHeight * dpr));
    const changed = canvas.width !== width || canvas.height !== height;

    if (changed) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    applications++;
    last = Object.freeze({
      reason,
      mobile: mobileTarget(),
      nativeDpr: Math.max(1, Number(root.devicePixelRatio) || 1),
      renderDpr: dpr,
      fullDpr: full,
      scale,
      cssWidth,
      cssHeight,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      backingPixels: canvas.width * canvas.height,
      applications,
      changed
    });
    return last;
  }

  function onResize() {
    // core.js resizes first; this later listener reapplies the render budget
    // in the same resize event, so orientation changes never need a second frame.
    apply('resize');
  }

  addEventListener('resize', onResize);
  apply('install');

  root.__MOBILE_RENDER_BUDGET_V1__ = Object.freeze({
    contract: CONTRACT,
    desiredDpr,
    apply,
    // Draw at this share of the budget (clamped to 0.4..1); returns the new state.
    setScale(k, reason = 'scale') {
      const next = Math.max(0.4, Math.min(1, Number(k) || 1));
      if (next === scale) return last;
      scale = next; return apply(reason);
    },
    scale: () => scale,
    minRenderDpr: MIN_RENDER_DPR,
    state: () => last
  });
})(window);
