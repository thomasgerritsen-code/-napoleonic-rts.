'use strict';
// ---------- v1.3.2 large-army + 2D render performance authority ----------
(function installLargeArmyPerformance(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before large-army performance authority.');

  const CELL = 160;
  const MAX_2D_DPR = 1.5;
  const LOD_UNIT_THRESHOLD = 360;
  const LOD_ZOOM_THRESHOLD = 0.82;
  const STATIC_TERRAIN_REFRESH_MS = 250;
  const combatGrid = { france: new Map(), britain: new Map() };
  const regimentById = new Map();
  const membersByRegiment = new Map();
  const getRegimentBeforePerformanceV12 = getRegiment;
  const regimentMembersBeforePerformanceV12 = regimentMembers;
  const renderStats = {
    fullUnits:0,lodUnits:0,culledUnits:0,dprResizes:0,
    staticTerrainCaptures:0,staticTerrainHits:0,staticTerrainInvalidations:0
  };
  let livingUnitCount = 0;
  let cameraFrame = { x:0, y:0, halfW:0, halfH:0, zoom:1 };

  const staticCanvas = document.createElement('canvas');
  staticCanvas.id = 'game-static';
  staticCanvas.setAttribute('aria-hidden', 'true');
  Object.assign(staticCanvas.style, {
    position:'fixed', inset:'0', zIndex:'0', pointerEvents:'none', cursor:'default'
  });
  const gameCanvas = document.getElementById('game');
  gameCanvas.insertAdjacentElement('afterend', staticCanvas);
  const staticCtx = staticCanvas.getContext('2d', { alpha:false });

  let staticTerrainKey = '';
  let staticTerrainCapturedAt = -Infinity;

  const cellKey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;

  function prepareFrameIndexes() {
    combatGrid.france.clear();
    combatGrid.britain.clear();
    regimentById.clear();
    membersByRegiment.clear();
    livingUnitCount = 0;

    for (const reg of regiments) {
      if (!reg.destroyed) regimentById.set(reg.id, reg);
    }

    for (const unit of units) {
      if (unit.dead) continue;
      livingUnitCount++;
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

  function refreshCameraFrame() {
    const zoom = Math.max(.05, camera.zoom);
    cameraFrame = {
      x:camera.x,
      y:camera.y,
      zoom,
      halfW:innerWidth / (2 * zoom),
      halfH:innerHeight / (2 * zoom)
    };
  }

  function isOnCamera(x, y, margin = 100) {
    const f = cameraFrame;
    return x >= f.x - f.halfW - margin && x <= f.x + f.halfW + margin &&
      y >= f.y - f.halfH - margin && y <= f.y + f.halfH + margin;
  }

  function useUnitLod(unit) {
    return !selectedUnits.has(unit) && livingUnitCount > LOD_UNIT_THRESHOLD && camera.zoom < LOD_ZOOM_THRESHOLD;
  }

  function drawUnitLod(unit) {
    const radius = TYPES[unit.type]?.radius || 6;
    const sideColor = unit.side === 'france' ? COLORS.france : COLORS.britain;
    const facing = Number.isFinite(unit.facing) ? unit.facing : 0;
    const cos = Math.cos(facing), sin = Math.sin(facing);

    if (unit.type === 'cavalry') {
      ctx.fillStyle = '#493a2e';
      ctx.beginPath();ctx.ellipse(unit.x,unit.y,10,4.5,facing,0,Math.PI*2);ctx.fill();
      ctx.fillStyle = sideColor;ctx.beginPath();ctx.arc(unit.x+cos,unit.y+sin,3.2,0,Math.PI*2);ctx.fill();
    } else if (unit.type === 'artillery') {
      const px=-sin,py=cos;
      ctx.strokeStyle = '#3e3328';ctx.lineWidth = 3;
      ctx.beginPath();ctx.moveTo(unit.x-cos*9+px*2,unit.y-sin*9+py*2);ctx.lineTo(unit.x+cos*11-px*2,unit.y+sin*11-py*2);ctx.stroke();
      ctx.fillStyle = '#282522';ctx.beginPath();
      ctx.arc(unit.x-cos*4+px*5,unit.y-sin*4+py*5,3,0,Math.PI*2);
      ctx.arc(unit.x+cos*4+px*5,unit.y+sin*4+py*5,3,0,Math.PI*2);ctx.fill();
    } else {
      ctx.fillStyle = unit.routing ? '#777' : sideColor;
      ctx.beginPath();ctx.arc(unit.x,unit.y,Math.max(4,radius*.82),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle = unit.side === 'france' ? COLORS.franceLight : COLORS.britainLight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();ctx.moveTo(unit.x,unit.y);ctx.lineTo(unit.x+cos*(radius+4),unit.y+sin*(radius+4));ctx.stroke();
      if (unit.type === 'officer') {
        ctx.fillStyle = COLORS.selected;ctx.beginPath();ctx.arc(unit.x,unit.y,2,0,Math.PI*2);ctx.fill();
      }
    }
  }

  const drawUnitBeforePerformanceV12 = drawUnit;
  drawUnit = function drawUnitCameraCulledV12(unit) {
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

  const drawProjectileBeforePerformanceV12 = drawProjectile;
  drawProjectile = function drawProjectileCameraCulledV12(projectile) {
    if (projectile && isOnCamera(projectile.x, projectile.y, 30)) drawProjectileBeforePerformanceV12(projectile);
  };

  const ambientTerrain = global.__MAP_AMBIENT_MOTION_V1__;
  const drawStaticTerrainSource = ambientTerrain?.baseTerrainDraw || drawTerrain;
  const drawAmbientTerrainOverlay = ambientTerrain?.drawOverlay || null;

  function terrainCacheKey() {
    return [
      canvas.width, canvas.height,
      Math.round(camera.x * 100) / 100,
      Math.round(camera.y * 100) / 100,
      Math.round(camera.zoom * 10000) / 10000
    ].join(':');
  }

  function clearStaticTerrain() {
    staticCtx.setTransform(1,0,0,1,0,0);
    staticCtx.clearRect(0,0,staticCanvas.width,staticCanvas.height);
  }

  drawTerrain = function drawTerrainCachedV132() {
    refreshCameraFrame();
    const now = performance.now();
    const key = terrainCacheKey();
    const cameraChanged = key !== staticTerrainKey;
    const refreshExpired = now - staticTerrainCapturedAt >= STATIC_TERRAIN_REFRESH_MS;

    if (cameraChanged || refreshExpired) {
      if (cameraChanged && staticTerrainKey) renderStats.staticTerrainInvalidations++;
      clearStaticTerrain();
      drawStaticTerrainSource();
      staticCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
      staticTerrainKey = key;
      staticTerrainCapturedAt = now;
      renderStats.staticTerrainCaptures++;
    } else {
      renderStats.staticTerrainHits++;
    }

    if (drawAmbientTerrainOverlay) drawAmbientTerrainOverlay();
  };

  function resize2DCanvasForPerformance() {
    const desiredDpr = Math.min(devicePixelRatio || 1, MAX_2D_DPR);
    const desiredWidth = Math.max(1, Math.floor(innerWidth * desiredDpr));
    const desiredHeight = Math.max(1, Math.floor(innerHeight * desiredDpr));
    const sameMain = canvas.width === desiredWidth && canvas.height === desiredHeight;
    const sameStatic = staticCanvas.width === desiredWidth && staticCanvas.height === desiredHeight;
    if (sameMain && sameStatic) return;

    canvas.width = desiredWidth;
    canvas.height = desiredHeight;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(desiredDpr, 0, 0, desiredDpr, 0, 0);

    staticCanvas.width = desiredWidth;
    staticCanvas.height = desiredHeight;
    staticCanvas.style.width = `${innerWidth}px`;
    staticCanvas.style.height = `${innerHeight}px`;
    staticTerrainKey = '';
    staticTerrainCapturedAt = -Infinity;
    renderStats.dprResizes++;
  }

  addEventListener('resize', resize2DCanvasForPerformance);
  resize2DCanvasForPerformance();
  refreshCameraFrame();

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
    staticTerrainCache: true,
    staticTerrainRefreshMs: STATIC_TERRAIN_REFRESH_MS,
    staticTerrainCanvasId: staticCanvas.id,
    livingUnitCount: () => livingUnitCount,
    renderStats: () => ({ ...renderStats })
  });
  global.__LARGE_ARMY_PERFORMANCE_V1__ = api;
  if (!nrts.subsystems.has('large-army-performance')) {
    nrts.subsystems.register('large-army-performance', api, {
      phase: 'v1.3.2',
      legacyBridge: false,
      responsibility: 'large-army combat query caching, viewport culling, static 2D battlefield caching, canvas scaling and density-aware unit rendering'
    });
  }
})(window);
