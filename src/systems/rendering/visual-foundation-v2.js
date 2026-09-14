'use strict';
// Visual Foundation V2: deterministic post-terrain lighting/readability pass.
// It deliberately changes presentation only: no simulation, navigation or input state.
(function installVisualFoundationV2(global) {
  const nrts = global.NRTS;
  const baseApi = global.__MAP_REALISM_V2__;
  if (!nrts || !baseApi || typeof global.drawTerrain !== 'function') return;
  if (global.__VISUAL_FOUNDATION_V2__) return;

  const baseDrawTerrain = global.drawTerrain;
  const seed = 18150618;
  const patches = [];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const patchPalette = [
    'rgba(219,205,147,.025)',
    'rgba(101,126,75,.030)',
    'rgba(78,103,64,.026)',
    'rgba(176,151,99,.024)'
  ];

  // Broad, deterministic tonal variation breaks the single-colour ground without per-frame generation.
  for (let i = 0; i < 72; i += 1) {
    patches.push({
      x: random() * WORLD.width,
      y: random() * WORLD.height,
      rx: 70 + random() * 210,
      ry: 55 + random() * 150,
      angle: (random() - .5) * .8,
      tone: i % patchPalette.length
    });
  }

  const hills = (typeof TERRAIN_HILLS !== 'undefined' ? TERRAIN_HILLS : []).map(h => ({
    x: h.x,
    y: h.y,
    rx: h.rx,
    ry: h.ry
  }));
  const woods = (typeof TERRAIN_WOODS !== 'undefined' ? TERRAIN_WOODS : []).map(w => ({
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h
  }));

  function visible(bounds, x, y, rx, ry, margin = 0) {
    return x + rx >= bounds.left - margin && x - rx <= bounds.right + margin &&
      y + ry >= bounds.top - margin && y - ry <= bounds.bottom + margin;
  }

  function drawTonalVariation(bounds) {
    ctx.save();
    for (let i = 0; i < patches.length; i += 1) {
      const p = patches[i];
      if (!visible(bounds, p.x, p.y, p.rx, p.ry, 20)) continue;
      ctx.fillStyle = patchPalette[p.tone];
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, p.angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Consistent north-west light cue: subtle lower-right shade + upper-left highlight.
  function drawTerrainRelief(bounds) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < hills.length; i += 1) {
      const h = hills[i];
      if (!visible(bounds, h.x, h.y, h.rx, h.ry, 28)) continue;
      ctx.strokeStyle = 'rgba(43,52,35,.10)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(h.x + 9, h.y + 11, h.rx * .76, h.ry * .76, 0, .10, Math.PI * .95);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(229,217,163,.08)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(h.x - 5, h.y - 6, h.rx * .72, h.ry * .72, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }

    for (let i = 0; i < woods.length; i += 1) {
      const w = woods[i];
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      const rx = w.w / 2;
      const ry = w.h / 2;
      if (!visible(bounds, cx, cy, rx, ry, 24)) continue;
      ctx.strokeStyle = 'rgba(28,43,27,.12)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(cx + 7, cy + 9, rx * .92, ry * .88, 0, .08, Math.PI * .95);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(181,195,135,.055)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 5, rx * .88, ry * .84, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  let frameCount = 0;
  function drawTerrainVisualFoundationV2() {
    baseDrawTerrain();
    const bounds = baseApi.visibleBounds(80);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height);
    ctx.clip();
    drawTonalVariation(bounds);
    drawTerrainRelief(bounds);
    ctx.restore();
    frameCount += 1;
  }

  global.drawTerrain = drawTerrainVisualFoundationV2;
  const api = Object.freeze({
    version: 'visual-foundation-v2.0',
    deterministicSeed: seed,
    patchCount: patches.length,
    hillReliefCount: hills.length,
    woodReliefCount: woods.length,
    preservesGameplayState: true,
    viewportCulled: true,
    perFrameRandomGeneration: false,
    getFrameCount: () => frameCount,
    renderer: drawTerrainVisualFoundationV2
  });
  global.__VISUAL_FOUNDATION_V2__ = api;
  if (!nrts.subsystems.has('visual-foundation-v2')) {
    nrts.subsystems.register('visual-foundation-v2', api, {
      phase: 'visual-foundation-v2',
      legacyBridge: false,
      responsibility: 'deterministic viewport-culled 2D terrain tone and consistent relief lighting'
    });
  }
})(window);
