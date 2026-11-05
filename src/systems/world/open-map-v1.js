'use strict';
// ---------- Open map v1 (iso view only: ?view=iso) ----------
// The iso view plays on an open map: fewer, smaller villages, well apart, and more hills. Runs
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
  // More relief: hills across the open country east and south of the river, clear
  // of the bases and villages. They are hill terrain to the game as the first three
  // (a little slower going); the iso view raises them (height in metres).
  const HILLS = [
    { x: 4200, y: 650, rx: 460, ry: 260, height: 10 }, { x: 5500, y: 1300, rx: 520, ry: 300, height: 13 },
    { x: 6900, y: 900, rx: 480, ry: 280, height: 11 }, { x: 4600, y: 2500, rx: 420, ry: 260, height: 8 },
    { x: 6100, y: 2900, rx: 560, ry: 320, height: 14 }, { x: 3500, y: 3700, rx: 380, ry: 240, height: 8 },
    { x: 5100, y: 4100, rx: 420, ry: 240, height: 10 }, { x: 900, y: 3800, rx: 380, ry: 240, height: 8 },
    { x: 3300, y: 2200, rx: 300, ry: 200, height: 7 }
  ];
  let hillsAdded = 0;
  if (typeof TERRAIN_HILLS !== 'undefined' && Array.isArray(TERRAIN_HILLS) && !Object.isFrozen(TERRAIN_HILLS)) {
    TERRAIN_HILLS.push(...HILLS);
    hillsAdded = HILLS.length;
  }
  global.__OPEN_MAP_V1__ = Object.freeze({ hillsAdded,
    version: 'open-map-v1', before,
    after: { villages: thinned.length, houses: thinned.reduce((n, v) => n + v.houses.length, 0) }
  });
})(window);
