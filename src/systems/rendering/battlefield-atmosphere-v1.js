'use strict';
// Cached ground dressing and bounded smoke mathematics. No gameplay writes,
// random calls, network messages or additional image downloads.
(function installBattlefieldAtmosphere(root) {
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  function hash(x, y, n = 0) {
    let h = Math.imul(x ^ Math.imul(y, 374761393) ^ Math.imul(n + 1, 668265263), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function advanceSmoke(s, now, wind) {
    const previous = s.driftAt ?? s.born, dt = clamp(now - previous, 0, s.life);
    const strength = clamp(wind.strength ?? 1, 0, 2.5);
    const vx = wind.x * strength, vy = wind.y * strength;
    const speed = 8 + s.seed * 5;
    s.curlX ??= -vy; s.curlY ??= vx;
    s.driftX = (s.driftX || 0) + ((s.windX ?? vx) + vx) * .5 * speed * dt;
    s.driftY = (s.driftY || 0) + ((s.windY ?? vy) + vy) * .5 * speed * dt;
    s.windX = vx; s.windY = vy; s.driftAt = now;
  }
  function smokeProfile(s, now) {
    const seconds = Math.max(0, now - s.born), age = clamp(seconds / s.life);
    const swell = 1 - Math.exp(-seconds * 1.3), jet = s.facing == null ? 0 : 10 * seconds * Math.exp(-seconds * 5);
    const curl = (Math.sin(seconds * 1.7 + s.seed * 6.28) - Math.sin(s.seed * 6.28)) * Math.min(1, seconds) * 1.8;
    return { x: s.wx + (s.driftX || 0) + Math.cos(s.facing || 0) * jet + (s.curlX || 0) * curl,
      y: s.wy + (s.driftY || 0) + Math.sin(s.facing || 0) * jet + (s.curlY || 0) * curl,
      height: s.h + swell * 1.35, radius: s.size * (.7 + swell * 1.2) + age * .35,
      opacity: Math.pow(1 - age, 1.15) * .4, stretch: 1 + swell * .32 };
  }
  const CELL = 384, RASTER = .5, PAD = 22;
  function groundSamples(tx, ty, describe) {
    const samples = [];
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const n = row * 8 + col, x = tx * CELL + (col + .2 + hash(tx, ty, n) * .6) * CELL / 8;
      const y = ty * CELL + (row + .2 + hash(ty, tx, n + 71) * .6) * CELL / 8;
      const surface = describe(x, y);
      if (!surface || surface.kind === 'water') continue;
      samples.push({ x, y, kind: surface.kind, angle: surface.angle || 0,
        seed: hash(tx, ty, n + 173), size: 8 + hash(ty, tx, n + 291) * 12 });
    }
    return samples;
  }
  function createGroundCache({makeCanvas, describe, height, mobile}) {
    const tiles = new Map(), maxBytes = (mobile ? 4 : 12) * 2 ** 20, maxTiles = mobile ? 32 : 64;
    const stats = { builds: 0, hits: 0, evictions: 0, bytes: 0, patches: 0 };
    let clock = 0;
    function build(tx, ty) {
      const patches = groundSamples(tx, ty, describe);
      const top = ty * CELL, left = tx * CELL;
      let minY = -PAD, maxY = CELL * .5 + PAD;
      for (const p of patches) {
        p.localY = (p.y - top) * .5 - height(p.x, p.y);
        minY = Math.min(minY, p.localY - PAD); maxY = Math.max(maxY, p.localY + PAD);
      }
      const canvas = makeCanvas(Math.ceil((CELL + PAD * 2) * RASTER), Math.ceil((maxY - minY) * RASTER));
      const c = canvas.getContext('2d');
      c.scale(RASTER, RASTER); c.translate(PAD, -minY);
      for (const p of patches) {
        const earth = p.kind === 'road', wood = p.kind === 'woods' || p.kind === 'fringe';
        const dry = p.kind === 'hill' || p.seed > .68;
        const color = earth ? '128,103,73' : wood ? '68,72,43' : dry ? '164,151,99' : '78,100,57';
        const x = p.x - left, y = p.localY, r = p.size;
        // Soft mottling plus a few fine marks, painted once in world space.
        c.save(); c.translate(x, y); c.scale(1, .5);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(${color},${earth ? .21 : .19})`); g.addColorStop(1, `rgba(${color},0)`);
        c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
        c.strokeStyle = earth ? 'rgba(88,72,49,.15)' : wood ? 'rgba(146,128,79,.18)' : 'rgba(185,180,122,.19)';
        c.lineWidth = earth ? 1.2 : .9; c.beginPath();
        for (let i = 0; i < 4; i++) {
          const ox = (hash(tx + i, ty, p.seed * 10000 | 0) - .5) * r;
          const oy = (hash(ty + i, tx, p.seed * 20000 | 0) - .5) * r * .5;
          const a = earth ? p.angle : p.seed * 6.28 + i;
          c.moveTo(x + ox, y + oy);
          c.lineTo(x + ox + Math.cos(a) * (earth ? 8 : 2.4), y + oy + Math.sin(a) * (earth ? 4 : 1.2) - (earth ? 0 : 1.5));
        }
        c.stroke();
      }
      const tile = { canvas, x: left - PAD, y: top * .5 + minY,
        width: canvas.width / RASTER, height: canvas.height / RASTER,
        bytes: canvas.width * canvas.height * 4, used: ++clock, patches: patches.length };
      stats.builds++; stats.bytes += tile.bytes; stats.patches += patches.length;
      return tile;
    }
    function trim() {
      while (tiles.size > maxTiles || stats.bytes > maxBytes) {
        let oldestKey, oldest;
        for (const [key, tile] of tiles) if (!oldest || tile.used < oldest.used) { oldestKey = key; oldest = tile; }
        if (!oldest) break;
        tiles.delete(oldestKey); stats.bytes -= oldest.bytes; stats.evictions++;
      }
    }
    return Object.freeze({ cell: CELL,
      get(tx, ty, allowBuild = true) {
        const key = tx + ':' + ty; let tile = tiles.get(key);
        if (tile) { tile.used = ++clock; stats.hits++; return tile; }
        if (!allowBuild) return null;
        tile = build(tx, ty); tiles.set(key, tile); trim(); return tile;
      },
      reset() { tiles.clear(); stats.bytes = 0; stats.patches = 0; },
      stats: () => ({ ...stats, tiles: tiles.size, maxBytes, maxTiles })
    });
  }
  const api = Object.freeze({ advanceSmoke, smokeProfile, groundSamples, createGroundCache });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.__BATTLEFIELD_ATMOSPHERE_V1__ = api;
})(typeof window !== 'undefined' ? window : globalThis);
