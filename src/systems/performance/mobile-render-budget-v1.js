'use strict';
(function installMobileRenderBudgetV1(root) {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const CONTRACT = Object.freeze({
    version: 'mobile-render-budget-v1',
    desktopDprCap: 2,
    mobileDprCap: 1.5,
    mobileShortEdgeCssPx: 700,
    preservesCssViewport: true,
    sharedWorldInputCoordinates: true
  });

  let applications = 0;
  let last = null;

  function mobileTarget() {
    const shortEdge = Math.min(innerWidth || 0, innerHeight || 0);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return coarse || shortEdge <= CONTRACT.mobileShortEdgeCssPx;
  }

  function desiredDpr() {
    const nativeDpr = Math.max(1, Number(root.devicePixelRatio) || 1);
    return Math.min(nativeDpr, mobileTarget() ? CONTRACT.mobileDprCap : CONTRACT.desktopDprCap);
  }

  function apply(reason = 'manual') {
    const dpr = desiredDpr();
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
    apply,
    state: () => last
  });
})(window);
