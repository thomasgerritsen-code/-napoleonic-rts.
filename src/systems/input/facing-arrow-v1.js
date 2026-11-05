'use strict';
// Facing arrow (open map only, NRTS_CONFIG.facingArrow): with troops selected,
// press where they should go and drag - one finger on a phone, the right
// button on a computer - and an arrow shows the front they will face, with a
// bar across where the line will stand. Letting go gives the order (the game's
// own drag-to-face input does that); the arrow stays a moment and fades.
(function installFacingArrowV1(root) {
  const cfg = root.NRTS_CONFIG?.facingArrow;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installFacingArrowV1(root), { once: true }); return; }
  if (root.__FACING_ARROW_V1__ || typeof canvas === 'undefined') return;
  const stats = { shown: 0, orders: 0 };
  const layer = document.createElement('canvas');
  layer.id = 'facing-arrow-layer';
  layer.dataset.overlay = 'facing-arrow';   // the iso view hides other canvases, not overlays
  layer.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:5';
  document.body.appendChild(layer);
  const g = layer.getContext('2d');
  // drag: { id, sx, sy, x, y, live } in client pixels; fade: the last order while it fades.
  let drag = null, fade = null, frame = 0;

  const movable = () => [...selectedUnits].some(u => u && !u.dead && u.side === 'france');
  const onOwn = (x, y) => { const w = screenToWorld(x, y); return !!(unitAt?.(w.x, w.y, 'france') || buildingAt?.(w.x, w.y, 'france')); };
  const busy = () => (typeof buildMode !== 'undefined' && buildMode) || (typeof rallyPlacementBuilding !== 'undefined' && rallyPlacementBuilding);
  const touches = new Set();

  // Listen on the window, ahead of the game's own handlers (which stop the event at the canvas).
  const on = (type, fn) => addEventListener(type, e => { if (e.target === canvas || drag?.id === e.pointerId || touches.has(e.pointerId)) fn(e); }, true);
  on('pointerdown', e => {
    if (e.pointerType === 'touch') touches.add(e.pointerId);
    // A second finger is a camera gesture: no order, no arrow.
    if (touches.size > 1) { drag = null; return; }
    const ok = e.pointerType === 'touch' ? e.isPrimary : e.button === 2;
    if (!ok || busy() || !movable() || onOwn(e.clientX, e.clientY)) { drag = null; return; }
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, live: false };
  });
  on('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.live && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > cfg.dragPx) { drag.live = true; stats.shown++; }
    if (drag.live) paint();
  });
  const end = e => {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.live && e.type === 'pointerup') { fade = { ...drag, x: e.clientX, y: e.clientY, at: performance.now() }; stats.orders++; }
    drag = null; paint();
  };
  on('pointerup', end);
  on('pointercancel', e => { if (drag && e.pointerId === drag.id) drag.live = false; end(e); });

  // ---- drawing ----
  function size() {
    const r = devicePixelRatio || 1, w = innerWidth, h = innerHeight;
    if (layer.width !== Math.round(w * r) || layer.height !== Math.round(h * r)) {
      layer.width = Math.round(w * r); layer.height = Math.round(h * r);
      layer.style.width = w + 'px'; layer.style.height = h + 'px';
    }
    g.setTransform(r, 0, 0, r, 0, 0);
  }
  // The line's front in the world: one pace per file (two ranks, three when large),
  // across the way it will face; returned as its two ends on screen.
  function frontEnds(a) {
    const regs = typeof selectedRegiments === 'function' ? selectedRegiments() : [];
    const men = regs.reduce((n, reg) => n + regimentMembers(reg).filter(u => u.type === 'infantry' || u.type === 'cavalry').length, 0) || selectedUnits.size;
    const files = Math.ceil(men / (men > 24 ? 3 : 2));
    const w0 = screenToWorld(a.sx, a.sy), w1 = screenToWorld(a.x, a.y), f = Math.atan2(w1.y - w0.y, w1.x - w0.x);
    const half = Math.max(cfg.minFront, Math.min(cfg.maxFront, files * cfg.filePitch)) / 2, ax = Math.cos(f + Math.PI / 2) * half, ay = Math.sin(f + Math.PI / 2) * half;
    return [worldToScreen(w0.x - ax, w0.y - ay), worldToScreen(w0.x + ax, w0.y + ay)];
  }
  function arrow(a, alpha) {
    const dx = a.x - a.sx, dy = a.y - a.sy, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, head = Math.min(26, 10 + len * 0.18);
    const [l, r] = frontEnds(a);
    g.save();
    g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [colour, extra] of [['rgba(20,14,8,0.85)', 4], [cfg.colour, 0]]) {
      g.strokeStyle = colour; g.fillStyle = colour;
      // The line's front: a bar across the start point.
      g.lineWidth = 5 + extra;
      g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.stroke();
      // The arrow: from the place to the way it faces.
      g.lineWidth = 4 + extra;
      g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(a.x - ux * head * 0.6, a.y - uy * head * 0.6); g.stroke();
      g.beginPath();
      g.moveTo(a.x + ux * extra * 0.5, a.y + uy * extra * 0.5);
      g.lineTo(a.x - ux * head + nx * head * 0.6 - nx * extra * 0.3, a.y - uy * head + ny * head * 0.6 - ny * extra * 0.3);
      g.lineTo(a.x - ux * head - nx * head * 0.6 + nx * extra * 0.3, a.y - uy * head - ny * head * 0.6 + ny * extra * 0.3);
      g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(a.sx, a.sy, 5, 0, Math.PI * 2); g.fillStyle = cfg.colour; g.fill();
    g.restore();
  }
  function paint() {
    size();
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (drag?.live) arrow(drag, 1);
    if (fade) {
      const t = (performance.now() - fade.at) / cfg.fadeMs;
      if (t >= 1) fade = null; else arrow(fade, 1 - t);
    }
    cancelAnimationFrame(frame);
    if (fade) frame = requestAnimationFrame(paint);
  }

  root.__FACING_ARROW_V1__ = Object.freeze({ version: '1.0', state: () => ({ dragging: !!drag?.live, fading: !!fade, ...stats }) });
})(window);
