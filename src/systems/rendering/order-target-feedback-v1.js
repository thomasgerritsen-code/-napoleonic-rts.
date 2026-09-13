'use strict';
(function initOrderTargetFeedback(root) {
  const MIN_VISIBLE_DISTANCE = 28;
  const MARKER_RADIUS_PX = 12;
  const MARKER_HALO_PX = 6;
  const LABEL_GAP_PX = 8;

  function livingSelectedRegiments() {
    if (typeof selectedRegiments !== 'function') return [];
    return selectedRegiments().filter(reg => reg && !reg.destroyed);
  }

  function regimentOrderTargets() {
    return livingSelectedRegiments().map(reg => {
      const members = typeof regimentMembers === 'function' ? regimentMembers(reg).filter(u => !u.dead) : [];
      if (!members.length || !Number.isFinite(reg.targetX) || !Number.isFinite(reg.targetY)) return null;
      const from = centroid(members);
      const dx = reg.targetX - from.x;
      const dy = reg.targetY - from.y;
      return {
        kind: 'regiment',
        id: reg.id,
        label: `R${reg.id} · ${typeof formationLabel === 'function' ? formationLabel(reg.formation) : reg.formation}`,
        fromX: from.x,
        fromY: from.y,
        x: reg.targetX,
        y: reg.targetY,
        distance: Math.hypot(dx, dy)
      };
    }).filter(Boolean);
  }

  function looseOrderTarget() {
    if (!(selectedUnits instanceof Set)) return null;
    const regimentIds = new Set(livingSelectedRegiments().map(reg => reg.id));
    const loose = [...selectedUnits].filter(u => !u.dead && !u.routing && !regimentIds.has(u.regimentId));
    if (!loose.length) return null;
    const moving = loose.filter(u => Number.isFinite(u.targetX) && Number.isFinite(u.targetY));
    if (!moving.length) return null;
    const from = centroid(loose);
    const x = moving.reduce((sum, u) => sum + u.targetX, 0) / moving.length;
    const y = moving.reduce((sum, u) => sum + u.targetY, 0) / moving.length;
    return {
      kind: 'loose',
      id: null,
      label: `${loose.length} losse eenheden`,
      fromX: from.x,
      fromY: from.y,
      x,
      y,
      distance: Math.hypot(x - from.x, y - from.y)
    };
  }

  function getTargets() {
    const targets = regimentOrderTargets();
    const loose = looseOrderTarget();
    if (loose) targets.push(loose);
    return targets;
  }

  function safeZoom() {
    const zoom = Number(camera?.zoom);
    return Number.isFinite(zoom) && zoom > 0.05 ? zoom : 1;
  }

  function drawTarget(target) {
    if (target.distance < MIN_VISIBLE_DISTANCE) return;
    const zoom = safeZoom();
    const pulse = 1 + Math.sin((typeof elapsed === 'number' ? elapsed : 0) * 5) * 0.08;
    const radius = (MARKER_RADIUS_PX * pulse) / zoom;
    const halo = MARKER_HALO_PX / zoom;
    const cross = 7 / zoom;

    ctx.save();
    ctx.strokeStyle = 'rgba(244,216,109,.62)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([10 / zoom, 7 / zoom]);
    ctx.beginPath();
    ctx.moveTo(target.fromX, target.fromY);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(20,20,15,.72)';
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius + halo, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2.2 / zoom;
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(target.x - cross, target.y);
    ctx.lineTo(target.x + cross, target.y);
    ctx.moveTo(target.x, target.y - cross);
    ctx.lineTo(target.x, target.y + cross);
    ctx.stroke();

    ctx.font = `${11 / zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#f4d86d';
    ctx.fillText(`${target.label} · ${Math.round(target.distance)}m`, target.x, target.y - radius - (LABEL_GAP_PX / zoom));
    ctx.restore();
  }

  function drawOrderFeedback() {
    const targets = getTargets();
    if (!targets.length || typeof ctx === 'undefined' || typeof camera === 'undefined') return;
    const zoom = safeZoom();
    ctx.save();
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);
    targets.forEach(drawTarget);
    ctx.restore();
  }

  const baseDraw = root.draw;
  if (typeof baseDraw === 'function') {
    root.draw = function drawWithOrderFeedback() {
      baseDraw();
      drawOrderFeedback();
    };
  }

  root.RTS_ORDER_FEEDBACK = Object.freeze({ getTargets, drawOrderFeedback, minVisibleDistance: MIN_VISIBLE_DISTANCE });
})(window);
