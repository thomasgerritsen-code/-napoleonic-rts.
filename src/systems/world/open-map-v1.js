'use strict';
// ---------- Open map v1 (iso view only: ?view=iso) ----------
// The iso view plays on an open map: fewer, smaller villages, well apart. Runs
// right after village-collision-v4 so navigation obstacles, ecology, building
// placement and rendering all see the same thinned villages. On the normal map
// (config.world.village.open is null) it does nothing.
(function installOpenMapV1(global) {
  const open = global.NRTS_CONFIG?.world?.village?.open;
  const villages = global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__;
  if (!open || !Array.isArray(villages)) return;
  const before = { villages: villages.length, houses: villages.reduce((n, v) => n + (v.houses || []).length, 0) };
  // Larger villages first; keep those at least minSpacing from every village kept.
  const kept = [];
  for (const v of [...villages].sort((a, b) => (b.houses || []).length - (a.houses || []).length)) {
    if (kept.length >= open.maxVillages) break;
    if (kept.every(k => Math.hypot(k.x - v.x, k.y - v.y) >= open.minSpacing)) kept.push(v);
  }
  // Each keeps its chapel or inn (if any) and the houses nearest its centre.
  // The village data is frozen, so the thinned villages replace it.
  const landmark = h => h.kind === 'chapel' || h.kind === 'inn';
  const thinned = Object.freeze(kept.map(v => {
    const near = [...(v.houses || [])].sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
    const first = near.find(landmark);
    const houses = [...(first ? [first] : []), ...near.filter(h => !landmark(h))].slice(0, open.maxHouses);
    return Object.freeze({ ...v, structureCount: houses.length, houses: Object.freeze(houses) });
  }));
  global.__VILLAGE_SCENERY_V4_DATA__ = thinned;
  global.VILLAGE_SCENERY_V4 = thinned;
  global.__OPEN_MAP_V1__ = Object.freeze({
    version: 'open-map-v1', before,
    after: { villages: thinned.length, houses: thinned.reduce((n, v) => n + v.houses.length, 0) }
  });
})(window);
