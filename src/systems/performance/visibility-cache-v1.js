'use strict';
// Visibility cache (open map only, NRTS_CONFIG.visibilityCache): "can France see
// this?" is asked for every British man several times a frame (drawing, regiment
// marks, the minimap), and each answer walked every French man and building and
// his vision chain. Now, once per moment of the game, the French watchers go into
// a grid of cells with their vision reach; a question looks only at the cells
// around, and each answer is kept for that moment. Same answers as before:
// watchers and enemies only move as the game's time runs on.
(function installVisibilityCacheV1(root) {
  const cfg = root.NRTS_CONFIG?.visibilityCache;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installVisibilityCacheV1(root), { once: true }); return; }
  if (root.__VISIBILITY_CACHE_V1__ || typeof isVisibleToFrance !== 'function' || typeof frenchVisionSources !== 'function') return;
  const stats = { builds: 0, asked: 0, answered: 0 };
  let grid = null;   // { at, count, cell, cells: Map(key -> [[x, y, r²], ...]), answers: Map(entity -> bool) }
  const key = (cx, cy) => cx * 100003 + cy;

  function build() {
    const sources = frenchVisionSources();
    let reach = 0;
    const list = sources.map(s => { const r = visionRadius(s); if (r > reach) reach = r; return [s.x, s.y, r * r]; });
    const cell = Math.max(cfg.minCell, reach), cells = new Map();
    for (const w of list) {
      const k = key(Math.floor(w[0] / cell), Math.floor(w[1] / cell));
      let bucket = cells.get(k); if (!bucket) cells.set(k, bucket = []);
      bucket.push(w);
    }
    stats.builds++;
    return { at: elapsed, count: units.length + buildings.length, epoch: root.__VISION_EPOCH__ || 0, cell, cells, answers: new Map() };
  }
  const fresh = () => grid && grid.at === elapsed && grid.count === units.length + buildings.length && grid.epoch === (root.__VISION_EPOCH__ || 0);

  const original = isVisibleToFrance;
  isVisibleToFrance = function isVisibleToFranceCached(entity) {
    if (!entity || entity.side === 'france') return true;
    stats.asked++;
    if (!fresh()) grid = build();
    // A plain point (a regiment's centre) is not kept; units and buildings are.
    const keep = entity.kind === 'unit' || entity.kind === 'building';
    if (keep) { const a = grid.answers.get(entity); if (a !== undefined) return a; }
    const cx = Math.floor(entity.x / grid.cell), cy = Math.floor(entity.y / grid.cell);
    let seen = false;
    for (let dy = -1; dy <= 1 && !seen; dy++) for (let dx = -1; dx <= 1 && !seen; dx++) {
      const bucket = grid.cells.get(key(cx + dx, cy + dy)); if (!bucket) continue;
      for (const w of bucket) { const ex = entity.x - w[0], ey = entity.y - w[1]; if (ex * ex + ey * ey <= w[2]) { seen = true; break; } }
    }
    stats.answered++;
    if (keep) grid.answers.set(entity, seen);
    // Keep the scouts' last-known positions as the original chain did.
    if (seen) root.__FOG_SCOUTING_V1__?.note?.(entity);
    return seen;
  };

  root.__VISIBILITY_CACHE_V1__ = Object.freeze({ version: '1.0', original, stats: () => ({ ...stats, cell: grid?.cell || 0 }) });
})(window);
