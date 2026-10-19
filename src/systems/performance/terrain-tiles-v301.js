'use strict';
// v301: world-aligned 2D terrain tiles; desktop only. The authoritative terrain
// renderer is the single drawing source; the game canvas serves briefly as a
// rasterization scratchpad, then live objects render normally over the tiles.
(function installTerrainTilesV301(root) {
  const CACHE_BYTES = 80 * 1024 * 1024;
  const tiles = new Map();
  const stats = { hits:0, misses:0, evictions:0, invalidations:0, composites:0 };
  let bytes = 0, profile = '';

  function invalidate() {
    root.__GPU_TERRAIN_V303__?.invalidate?.();
    if (tiles.size) stats.invalidations++;
    tiles.clear();
    bytes = 0;
    profile = '';
  }

  function capture(drawBase, tx, ty, tileCss, tilePx, rasterZoom, dpr) {
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tileCanvas.height = tilePx;
    const tileCtx = tileCanvas.getContext('2d', { alpha:false });
    const step = tileCss / rasterZoom;
    const left = tx * step, top = ty * step;
    const oldCamera = [camera.x, camera.y, camera.zoom];
    ctx.save();
    try {
      camera.x = left + innerWidth / (2 * rasterZoom);
      camera.y = top + innerHeight / (2 * rasterZoom);
      camera.zoom = rasterZoom;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * rasterZoom, 0, 0, dpr * rasterZoom,
        -left * dpr * rasterZoom, -top * dpr * rasterZoom);
      ctx.beginPath();
      ctx.rect(left, top, step, step);
      ctx.clip();
      // The animated current must not be baked into stationary landscape tiles.
      root.__STATIC_TERRAIN_CAPTURE_V301__ = true;
      try { drawBase(); }
      finally { root.__STATIC_TERRAIN_CAPTURE_V301__ = false; }
      tileCtx.drawImage(canvas, 0, 0, tilePx, tilePx, 0, 0, tilePx, tilePx);
    } finally {
      camera.x = oldCamera[0];
      camera.y = oldCamera[1];
      camera.zoom = oldCamera[2];
      ctx.restore();
    }
    stats.misses++;
    return { canvas:tileCanvas, bytes:tilePx * tilePx * 4 };
  }

  function draw(drawBase, outputCtx) {
    const liveZoom = Math.max(.05, camera.zoom);
    // Reuse tiles while a smoothed zoom changes by less than 0.025.
    const rasterZoom = Math.max(.05, Math.round(liveZoom * 40) / 40);
    const dpr = canvas.width / Math.max(1, innerWidth);
    // Tiles must always fit on the current scratch canvas.
    const tileCss = Math.max(1, Math.floor(Math.min(1024, innerWidth, innerHeight)));
    const tilePx = Math.max(1, Math.floor(tileCss * dpr));
    const step = tileCss / rasterZoom;
    const nextProfile = [rasterZoom, dpr.toFixed(5), tileCss,
      canvas.width, canvas.height].join(':');
    if (profile !== nextProfile) {
      invalidate();
      profile = nextProfile;
    }

    const left = camera.x - innerWidth / (2 * liveZoom);
    const top = camera.y - innerHeight / (2 * liveZoom);
    const right = camera.x + innerWidth / (2 * liveZoom);
    const bottom = camera.y + innerHeight / (2 * liveZoom);
    const scale = liveZoom * dpr;
    const x0 = Math.floor(left / step), x1 = Math.floor(right / step);
    const y0 = Math.floor(top / step), y1 = Math.floor(bottom / step);
    const gpu = root.__GPU_TERRAIN_V303__;
    const gpuActive = gpu?.begin?.(outputCtx.canvas.width, outputCtx.canvas.height) === true;
    if (!gpuActive) {
      outputCtx.setTransform(1, 0, 0, 1, 0, 0);
      outputCtx.clearRect(0, 0, outputCtx.canvas.width, outputCtx.canvas.height);
    }
    try {
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const key = tx + ':' + ty;
          let tile = tiles.get(key);
          if (tile) {
            tiles.delete(key);
            tiles.set(key, tile);
            stats.hits++;
          } else {
            tile = capture(drawBase, tx, ty, tileCss, tilePx, rasterZoom, dpr);
            tiles.set(key, tile);
            bytes += tile.bytes;
          }
          const sx = Math.round((tx * step - left) * scale);
          const ex = Math.round(((tx + 1) * step - left) * scale);
          const sy = Math.round((ty * step - top) * scale);
          const ey = Math.round(((ty + 1) * step - top) * scale);
          // Identical rounded edges eliminate hairline cracks between tiles.
          if (gpuActive) gpu.drawTile(key, tile.canvas, sx, sy, ex - sx, ey - sy);
          else outputCtx.drawImage(tile.canvas, sx, sy, ex - sx, ey - sy);
          stats.composites++;
        }
      }
    } finally {
      if (gpuActive) gpu.finish();
      // Rasterization used the live game canvas; discard those scratch pixels
      // before the renderer draws units, smoke, resources, and selection HUD.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    while (bytes > CACHE_BYTES && tiles.size > 1) {
      const oldest = tiles.keys().next().value;
      const tile = tiles.get(oldest);
      tiles.delete(oldest);
      bytes -= tile.bytes;
      gpu?.dropTile?.(oldest);
      stats.evictions++;
    }
    // Animation remains real-time even on a completely cached battlefield.
    root.__RIVER_FLOW_2D_V299__?.draw?.(typeof elapsed === 'number' ? elapsed : 0);
  }

  root.__DESKTOP_TERRAIN_TILES_V301__ = Object.freeze({
    version:'v301', desktopOnly:true, worldAligned:true, animatedWaterOverlay:true,
    maxCacheBytes:CACHE_BYTES, draw, invalidate,
    stats:() => ({ ...stats, size:tiles.size, bytes })
  });
  root.NRTS?.events?.on?.('game:reset', invalidate);
})(window);
