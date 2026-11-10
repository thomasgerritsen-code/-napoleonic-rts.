'use strict';
// Bounded, render-only tracks. Coordinates come from observed movement; this
// never writes a unit, consumes gameplay randomness or catches up unseen paths.
(function installWetTracks(root) {
  if (!root.NRTS_CONFIG?.weather) return;
  root.__WET_TRACKS_V1__ = Object.freeze({ create({ capacity = 2600, ppm = 22.5 } = {}) {
    const buffer = new Array(capacity), kinds = { boot: 0, hoof: 0, wheel: 0 };
    let head = 0, count = 0, emitted = 0;
    const life = wetness => 90 + 150 * wetness;
    function removeOldest() {
      kinds[buffer[head].kind]--; buffer[head] = undefined;
      head = (head + 1) % capacity; count--;
    }
    function push(mark) {
      if (count === capacity) removeOldest();
      buffer[(head + count) % capacity] = mark; count++; kinds[mark.kind]++; emitted++;
    }
    function sample(u, memory, wetness, now, eligible = true) {
      const x = u.x, y = u.y;
      if (!eligible || wetness < 0.15 || memory.wetX == null) { memory.wetX = x; memory.wetY = y; return; }
      const dx = x - memory.wetX, dy = y - memory.wetY, distance = Math.hypot(dx, dy);
      // A teleport/newly observed position must not draw a trail across the map.
      if (distance > 8 * ppm) { memory.wetX = x; memory.wetY = y; return; }
      const kind = u.type === 'cavalry' || (u.type === 'officer' && u.troop === 'mounted') ? 'hoof' : u.type === 'artillery' ? 'wheel' : 'boot';
      const gap = (kind === 'hoof' ? 1.2 : kind === 'wheel' ? 0.7 : 0.6) * ppm;
      const steps = Math.floor(distance / gap); if (!steps) return;
      const nx = dx / distance, ny = dy / distance;
      const direction = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      // At most four marks per observed unit/frame, even after a long frame.
      const n = Math.min(4, steps);
      for (let i = 1; i <= n; i++) {
        memory.wetStep = (memory.wetStep || 0) + 1;
        push({ x: memory.wetX + nx * gap * i, y: memory.wetY + ny * gap * i,
          kind, direction, step: memory.wetStep & 1, t: now, unitId: u.id });
      }
      if (steps > n) { memory.wetX = x; memory.wetY = y; }
      else { memory.wetX += nx * gap * n; memory.wetY += ny * gap * n; }
    }
    return Object.freeze({ sample, lifetime: life,
      prune(now, wetness) {
        const maxAge = life(wetness);
        while (count && (now - buffer[head].t > maxAge || now < buffer[head].t)) removeOldest();
      },
      forEach(fn) { for (let i = 0; i < count; i++) fn(buffer[(head + i) % capacity]); },
      reset() { buffer.fill(undefined); head = count = emitted = 0; kinds.boot = kinds.hoof = kinds.wheel = 0; },
      stats: () => ({ count, capacity, emitted, ...kinds }),
      snapshot() { const out = []; for (let i = 0; i < count; i++) out.push({ ...buffer[(head + i) % capacity] }); return out; }
    });
  } });
})(window);
