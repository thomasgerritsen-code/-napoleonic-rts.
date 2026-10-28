'use strict';
// ---------- v1.3.2 large-army + 2D render performance authority ----------
(function installLargeArmyPerformance(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before large-army performance authority.');

  const CELL = 160;
  // The iso view (NRTS_CONFIG.render, open map only) may draw sharper.
  const MAX_2D_DPR = Math.max(1.5, global.NRTS_CONFIG?.render?.mobileDprCap || 0, global.NRTS_CONFIG?.render?.desktopDprCap || 0);
  const LOD_UNIT_THRESHOLD = 360;
  const LOD_ZOOM_THRESHOLD = 0.82;
  const STATIC_TERRAIN_REFRESH_MS = 1000;
  const combatGrid = { france: new Map(), britain: new Map() };
  const combatBounds = Object.fromEntries(['france','britain'].map(side=>[side,{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}]));
  const regimentById = new Map();
  const membersByRegiment = new Map();
  // Where each unit stands in units this step (dead ones too: units are never
  // removed during a battle), and each regiment's living members as last found.
  const unitSlot = new Map();
  let memberMemo = new WeakMap(), frameNo = 0;
  const getRegimentBeforePerformanceV12 = getRegiment;
  const regimentMembersBeforePerformanceV12 = regimentMembers;
  const renderStats = {
    fullUnits:0,lodUnits:0,culledUnits:0,dprResizes:0,
    staticTerrainCaptures:0,staticTerrainHits:0,staticTerrainInvalidations:0,
    mobileZoomReprojections:0, mobileZoomRefreshes:0
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
  let mobileCapturedPose = null;

  const cellKey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;

  function prepareFrameIndexes() {
    combatGrid.france.clear();
    combatGrid.britain.clear();
    for(const bounds of Object.values(combatBounds)){
      bounds.minX=bounds.minY=Infinity;bounds.maxX=bounds.maxY=-Infinity;
    }
    regimentById.clear();
    membersByRegiment.clear();
    livingUnitCount = 0;
    unitSlot.clear(); frameNo++;
    for (let i = 0; i < units.length; i++) unitSlot.set(units[i].id, i);

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
      const bounds=combatBounds[unit.side],cx=Math.floor(unit.x/CELL),cy=Math.floor(unit.y/CELL);
      bounds.minX=Math.min(bounds.minX,cx);bounds.maxX=Math.max(bounds.maxX,cx);
      bounds.minY=Math.min(bounds.minY,cy);bounds.maxY=Math.max(bounds.maxY,cy);
      let bucket = sideGrid.get(key);
      if (!bucket) sideGrid.set(key, bucket = []);
      bucket.push(unit);
    }
  }

  // Regiment IDs restart at 1 every battle. Cached references to a previous
  // battle are invalid even if a newly created group reuses the same ID.
  nrts.events.on('game:reset', () => {
    regimentById.clear();
    membersByRegiment.clear();
    unitSlot.clear(); memberMemo = new WeakMap();
    combatGrid.france.clear();
    combatGrid.britain.clear();
    livingUnitCount = 0;
    for(const bounds of Object.values(combatBounds)){
      bounds.minX=bounds.minY=Infinity;bounds.maxX=bounds.maxY=-Infinity;
    }
  });

  getRegiment = function getRegimentCached(id) {
    const reg = regimentById.get(id);
    // Guard commands executed between two simulation ticks after a reset.
    if (reg && !reg.destroyed && regiments.includes(reg)) return reg;
    return getRegimentBeforePerformanceV12(id);
  };

  // The living units whose ids are in the regiment's memberIds, in units order -
  // exactly what core's regimentMembers returns. memberIds keeps the ids of the
  // fallen, so the old check (as many living members as ids) failed for every
  // regiment that had lost a man, and each call then walked all units. Now the
  // members are looked up by id and kept for the step until one of them falls
  // or memberIds changes; a unit created during the step falls back to the walk.
  regimentMembers = function regimentMembersCached(reg) {
    if (!reg || reg.destroyed) return [];
    // Frame indexes are snapshots, never authoritative for a newly formed or
    // modified group. Fall back to live units until the next frame rebuild.
    if (regimentById.get(reg.id) !== reg) return regimentMembersBeforePerformanceV12(reg);
    const ids = reg.memberIds, memo = memberMemo.get(reg);
    if (memo && memo.frame === frameNo && memo.ids === ids && memo.length === ids.length && memo.list.every(u => !u.dead)) return memo.list;
    const slots = [];
    for (const id of ids) {
      const i = unitSlot.get(id);
      if (i === undefined || units[i]?.id !== id) return regimentMembersBeforePerformanceV12(reg);
      slots.push(i);
    }
    slots.sort((a, b) => a - b);
    const list = [];
    for (let k = 0; k < slots.length; k++) {
      if (k && slots[k] === slots[k - 1]) continue;
      const u = units[slots[k]]; if (!u.dead) list.push(u);
    }
    memberMemo.set(reg, { frame: frameNo, ids, length: ids.length, list });
    return list;
  };

  nearestEnemyEntity = function nearestEnemyEntitySpatial(unit, maxRange) {
    const enemySide = opposite(unit.side);
    const grid = combatGrid[enemySide];
    let best = null;
    let bestD2 = maxRange * maxRange;
    // Empty cells outside the enemy index cannot contain a candidate. Clip
    // only the cell range: candidates and tie-breaking order stay identical.
    const bounds=combatBounds[enemySide];
    const minX = Math.max(Math.floor((unit.x - maxRange) / CELL),bounds.minX);
    const maxX = Math.min(Math.floor((unit.x + maxRange) / CELL),bounds.maxX);
    const minY = Math.max(Math.floor((unit.y - maxRange) / CELL),bounds.minY);
    const maxY = Math.min(Math.floor((unit.y + maxRange) / CELL),bounds.maxY);

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
      // v304: far-away unselected infantry/cavalry/crew can be drawn in one
      // shared GPU batch; the familiar Canvas LOD remains the full fallback.
      if (!global.__GPU_UNITS_V304__?.enqueue?.(unit)) drawUnitLod(unit);
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
  const desktopTiles = global.__DESKTOP_TERRAIN_TILES_V301__ || null;

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

  // v310: cheap, visual-only reprojection of the *existing* mobile
  // static layer between snapshots. This avoids redrawing an entire map
  // on each pinch pointer event; the simulation and hit testing still use
  // the real current camera. Force a fresh raster when uncovered borders
  // or the stored image becomes too stale.
  function reprojectMobileTerrain(now) {
    if (!mobileCapturedPose || now - staticTerrainCapturedAt > 95) return false;
    const scale = camera.zoom / mobileCapturedPose.zoom;
    if (!Number.isFinite(scale) || scale < .88 || scale > 1.14) return false;
    const dx = innerWidth * (1 - scale) / 2 +
      (mobileCapturedPose.x - camera.x) * camera.zoom;
    const dy = innerHeight * (1 - scale) / 2 +
      (mobileCapturedPose.y - camera.y) * camera.zoom;
    const right = dx + innerWidth * scale;
    const bottom = dy + innerHeight * scale;
    // Do not let the cached bitmap uncover a visible slice of the world.
    if (dx > 22 || dy > 22 || right < innerWidth - 22 ||
        bottom < innerHeight - 22) return false;
    staticCanvas.style.transformOrigin = '0 0';
    staticCanvas.style.transform =
      `translate(${dx}px, ${dy}px) scale(${scale})`;
    renderStats.mobileZoomReprojections++;
    return true;
  }

  drawTerrain = function drawTerrainCachedV132() {
    refreshCameraFrame();
    const now = performance.now();
    if (desktopTiles && !global.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile) {
      const previous = desktopTiles.stats();
      desktopTiles.draw(drawStaticTerrainSource, staticCtx);
      const latest = desktopTiles.stats();
      renderStats.staticTerrainCaptures += latest.misses - previous.misses;
      renderStats.staticTerrainHits += latest.hits - previous.hits;
      renderStats.staticTerrainInvalidations += latest.invalidations - previous.invalidations;
      // v308: animated current is not part of world-aligned terrain tiles.
      // Always draw its independent overlay, even when the GPU is disabled.
      global.__RIVER_FLOW_2D_V299__?.draw?.(typeof elapsed==='number'?elapsed:0);
      if (drawAmbientTerrainOverlay) drawAmbientTerrainOverlay();
      return;
    }
    const key = terrainCacheKey();
    const cameraChanged = key !== staticTerrainKey;
    const refreshExpired = now - staticTerrainCapturedAt >= STATIC_TERRAIN_REFRESH_MS;

    const mobile = !!global.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
    const preview = mobile && cameraChanged && !refreshExpired &&
      reprojectMobileTerrain(now);
    if (preview) {
      renderStats.staticTerrainHits++;
    } else if (cameraChanged || refreshExpired) {
      if (cameraChanged && staticTerrainKey) renderStats.staticTerrainInvalidations++;
      // Reset CSS projection before replacing the cached source pixels.
      staticCanvas.style.transform = 'none';
      clearStaticTerrain();
      drawStaticTerrainSource();
      staticCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
      staticTerrainKey = key;
      staticTerrainCapturedAt = now;
      mobileCapturedPose = mobile
        ? { x:camera.x, y:camera.y, zoom:camera.zoom } : null;
      if (mobile) renderStats.mobileZoomRefreshes++;
      renderStats.staticTerrainCaptures++;
    } else {
      renderStats.staticTerrainHits++;
    }

    // The fallback desktop cache also omits animated current from its source.
    if (!global.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile)
      global.__RIVER_FLOW_2D_V299__?.draw?.(typeof elapsed==='number'?elapsed:0);
    if (drawAmbientTerrainOverlay) drawAmbientTerrainOverlay();
  };

  function resize2DCanvasForPerformance() {
    // Share the same DPR decision as the early budget installer: resizing must
    // not allocate a full Retina canvas twice (or undo the desktop pixel cap).
    const desiredDpr = Math.min(MAX_2D_DPR,
      global.__MOBILE_RENDER_BUDGET_V1__?.desiredDpr?.() ?? (devicePixelRatio || 1));
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
    mobileCapturedPose = null;
    staticCanvas.style.transform = 'none';
    desktopTiles?.invalidate();
    renderStats.dprResizes++;
  }

  addEventListener('resize', resize2DCanvasForPerformance);
  resize2DCanvasForPerformance();
  refreshCameraFrame();

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
    worldAlignedTerrainTiles: Boolean(desktopTiles),
    desktopTileCache: () => desktopTiles?.stats() || null,
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
