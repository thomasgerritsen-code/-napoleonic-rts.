'use strict';
// ---------- v1.3.2 large-army + 2D render performance authority ----------
(function installLargeArmyPerformance(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before large-army performance authority.');

  const CELL = 160;
  const MAX_2D_DPR = 1.5;
  const LOD_UNIT_THRESHOLD = 360;
  const LOD_ZOOM_THRESHOLD = 0.82;
  const combatGrid = { france: new Map(), britain: new Map() };
  const regimentById = new Map();
  const membersByRegiment = new Map();
  const getRegimentBeforePerformanceV12 = getRegiment;
  const regimentMembersBeforePerformanceV12 = regimentMembers;
  const renderStats = { fullUnits:0, lodUnits:0, culledUnits:0, dprResizes:0 };

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

  getRegiment = function getRegimentCached(id) {
    const reg = regimentById.get(id);
    if (reg && !reg.destroyed) return reg;
    return getRegimentBeforePerformanceV12(id);
  };

  regimentMembers = function regimentMembersCached(reg) {
    if (!reg || reg.destroyed) return [];
    const members = membersByRegiment.get(reg.id);
    if (!members) return regimentMembersBeforePerformanceV12(reg);
    return members.filter(unit => !unit.dead);
  };

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

  function useUnitLod(unit) {
    if (selectedUnits.has(unit)) return false;
    if (camera.zoom >= LOD_ZOOM_THRESHOLD) return false;
    let living = 0;
    for (const candidate of units) {
      if (!candidate.dead && ++living > LOD_UNIT_THRESHOLD) return true;
    }
    return false;
  }

  function drawUnitLod(unit) {
    const radius = TYPES[unit.type]?.radius || 6;
    const sideColor = unit.side === 'france' ? COLORS.france : COLORS.britain;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.facing || 0);
    if (unit.type === 'cavalry') {
      ctx.fillStyle = '#493a2e';
      ctx.beginPath();ctx.ellipse(0,0,10,4.5,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle = sideColor;ctx.beginPath();ctx.arc(1,0,3.2,0,Math.PI*2);ctx.fill();
    } else if (unit.type === 'artillery') {
      ctx.strokeStyle = '#3e3328';ctx.lineWidth = 3;
      ctx.beginPath();ctx.moveTo(-9,3);ctx.lineTo(11,-2);ctx.stroke();
      ctx.fillStyle = '#282522';ctx.beginPath();ctx.arc(-5,5,3,0,Math.PI*2);ctx.arc(5,4,3,0,Math.PI*2);ctx.fill();
    } else {
      ctx.fillStyle = unit.routing ? '#777' : sideColor;
      ctx.beginPath();ctx.arc(0,0,Math.max(4,radius*.82),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle = unit.side === 'france' ? COLORS.franceLight : COLORS.britainLight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(radius+4,0);ctx.stroke();
      if (unit.type === 'officer') {
        ctx.fillStyle = COLORS.selected;ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }

  const drawUnitBeforePerformanceV12 = drawUnit;
  drawUnit = function drawUnitCameraCulledV132(unit) {
    if (unit.dead || !isOnCamera(unit.x, unit.y, 70)) {
      renderStats.culledUnits++;
      return;
    }
    if (useUnitLod(unit)) {
      renderStats.lodUnits++;
      drawUnitLod(unit);
    } else {
      renderStats.fullUnits++;
      drawUnitBeforePerformanceV12(unit);
    }
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

  function resize2DCanvasForPerformance() {
    const desiredDpr = Math.min(devicePixelRatio || 1, MAX_2D_DPR);
    const desiredWidth = Math.max(1, Math.floor(innerWidth * desiredDpr));
    const desiredHeight = Math.max(1, Math.floor(innerHeight * desiredDpr));
    if (canvas.width === desiredWidth && canvas.height === desiredHeight) return;
    canvas.width = desiredWidth;
    canvas.height = desiredHeight;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(desiredDpr, 0, 0, desiredDpr, 0, 0);
    renderStats.dprResizes++;
  }

  // Core registers its resize handler earlier. Registering this one later means the
  // performance cap is the final canvas size after a browser resize.
  addEventListener('resize', resize2DCanvasForPerformance);
  resize2DCanvasForPerformance();

  // 3D stays available for explicit experiments/tests, but normal play now starts in 2D.
  // This keeps the current development cycle focused on the mature renderer and movement.
  addEventListener('load', () => {
    const params = new URLSearchParams(location.search);
    const explicit3D = params.get('view') === '3d' || params.get('test') === '3d';
    if (!explicit3D && global.__BATTLEFIELD_3D_V1__?.enabled?.()) {
      global.__BATTLEFIELD_3D_V1__.setEnabled(false);
      statusEl.textContent = '2D-weergave actief · geoptimaliseerd voor vloeiende grote veldslagen.';
    }
  }, { once:true });

  const api = Object.freeze({
    version: 'large-army-v1.3.2',
    combatCellSize: CELL,
    prepareFrameIndexes,
    cameraCulling: true,
    cachedRegimentMembership: true,
    spatialCombatQueries: true,
    immediateLookupFallbacks: true,
    twoDDefault: true,
    maxCanvasDpr: MAX_2D_DPR,
    unitLod: true,
    unitLodThreshold: LOD_UNIT_THRESHOLD,
    unitLodZoomThreshold: LOD_ZOOM_THRESHOLD,
    renderStats: () => ({ ...renderStats })
  });
  global.__LARGE_ARMY_PERFORMANCE_V1__ = api;
  if (!nrts.subsystems.has('large-army-performance')) {
    nrts.subsystems.register('large-army-performance', api, {
      phase: 'v1.3.2',
      legacyBridge: false,
      responsibility: 'large-army combat query caching, viewport culling, 2D canvas scaling and density-aware unit rendering'
    });
  }
})(window);
