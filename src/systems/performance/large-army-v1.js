'use strict';
// ---------- v1.2 large-army performance authority ----------
(function installLargeArmyPerformance(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before large-army performance authority.');

  const CELL = 160;
  const combatGrid = { france: new Map(), britain: new Map() };
  const regimentById = new Map();
  const membersByRegiment = new Map();

  const cellKey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;

  function prepareFrameIndexes() {
    combatGrid.france.clear();
    combatGrid.britain.clear();
    regimentById.clear();
    membersByRegiment.clear();

    for (const reg of regiments) {
      if (!reg.destroyed) regimentById.set(reg.id, reg);
    }

    for (const unit of units) {
      if (unit.dead) continue;
      if (unit.regimentId) {
        let members = membersByRegiment.get(unit.regimentId);
        if (!members) membersByRegiment.set(unit.regimentId, members = []);
        members.push(unit);
      }
      if (unit.routing || unit.type === 'worker') continue;
      const sideGrid = combatGrid[unit.side];
      if (!sideGrid) continue;
      const key = cellKey(unit.x, unit.y);
      let bucket = sideGrid.get(key);
      if (!bucket) sideGrid.set(key, bucket = []);
      bucket.push(unit);
    }
  }

  // Replace repeated O(regiments * units) scans with one cache rebuild per simulation frame.
  getRegiment = function getRegimentCached(id) {
    const reg = regimentById.get(id);
    return reg && !reg.destroyed ? reg : null;
  };

  regimentMembers = function regimentMembersCached(reg) {
    if (!reg || reg.destroyed) return [];
    const members = membersByRegiment.get(reg.id);
    if (!members) return [];
    // Deaths can happen after the frame cache is built; filter only this small regiment array,
    // never the full global unit list.
    return members.filter(unit => !unit.dead);
  };

  // Replace the two full enemy-array scans performed by every combat unit each tick.
  nearestEnemyEntity = function nearestEnemyEntitySpatial(unit, maxRange) {
    const enemySide = opposite(unit.side);
    const grid = combatGrid[enemySide];
    let best = null;
    let bestD2 = maxRange * maxRange;
    const minX = Math.floor((unit.x - maxRange) / CELL);
    const maxX = Math.floor((unit.x + maxRange) / CELL);
    const minY = Math.floor((unit.y - maxRange) / CELL);
    const maxY = Math.floor((unit.y + maxRange) / CELL);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = grid?.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.dead || other.routing || other.type === 'worker') continue;
          const dx = other.x - unit.x;
          const dy = other.y - unit.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = other;
          }
        }
      }
    }

    // Building counts stay tiny, so keep this exact scan for gameplay parity.
    for (const b of buildings) {
      if (b.dead || b.side !== enemySide || !b.complete) continue;
      const dx = b.x - unit.x;
      const dy = b.y - unit.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = b;
      }
    }
    return best;
  };

  const updateBeforePerformanceV12 = update;
  update = function updateLargeArmyPerformanceV12(dt) {
    prepareFrameIndexes();
    updateBeforePerformanceV12(dt);
  };

  function isOnCamera(x, y, margin = 100) {
    const halfW = innerWidth / (2 * camera.zoom) + margin;
    const halfH = innerHeight / (2 * camera.zoom) + margin;
    return x >= camera.x - halfW && x <= camera.x + halfW && y >= camera.y - halfH && y <= camera.y + halfH;
  }

  // Rendering outside the viewport was still paying the full character/cavalry canvas cost.
  const drawUnitBeforePerformanceV12 = drawUnit;
  drawUnit = function drawUnitCameraCulledV12(unit) {
    if (!unit.dead && isOnCamera(unit.x, unit.y, 70)) drawUnitBeforePerformanceV12(unit);
  };

  const drawResourceBeforePerformanceV12 = drawResource;
  drawResource = function drawResourceCameraCulledV12(resource) {
    if (!resource.dead && isOnCamera(resource.x, resource.y, 45)) drawResourceBeforePerformanceV12(resource);
  };

  const drawBuildingBeforePerformanceV12 = drawBuilding;
  drawBuilding = function drawBuildingCameraCulledV12(building) {
    if (!building.dead && isOnCamera(building.x, building.y, Math.max(building.w || 0, building.h || 0) + 60)) {
      drawBuildingBeforePerformanceV12(building);
    }
  };

  const api = Object.freeze({
    version: 'large-army-v1',
    combatCellSize: CELL,
    prepareFrameIndexes,
    cameraCulling: true,
    cachedRegimentMembership: true,
    spatialCombatQueries: true
  });
  global.__LARGE_ARMY_PERFORMANCE_V1__ = api;
  if (!nrts.subsystems.has('large-army-performance')) {
    nrts.subsystems.register('large-army-performance', api, {
      phase: 'v1.2',
      legacyBridge: false,
      responsibility: 'large-army combat query caching and camera render culling'
    });
  }
})(window);
