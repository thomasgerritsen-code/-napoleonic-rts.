'use strict';
// Wildlife (open map only, NRTS_CONFIG.wildlife): red deer in small herds by the
// woods - a stag with his hinds - and rabbits in the meadows. They graze, wander
// about their home ground and bolt from men coming near and from gunfire, then
// settle again further off. They are scenery: nobody shoots at them and they
// block nothing. The iso view draws them (render-iso-wildlife.py sprites).
(function installWildlifeV1(root) {
  const cfg = root.NRTS_CONFIG?.wildlife;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installWildlifeV1(root), { once: true }); return; }
  if (root.__WILDLIFE_V1__ || typeof updateProjectiles !== 'function') return;
  const stats = { spawned: 0, bolts: 0 };
  // Each animal: { id, kind: 'stag'|'hind'|'rabbit', x, y, hx, hy (home), state: 'graze'|'idle'|'walk'|'run',
  //   tx, ty, until, facing, scaredUntil, herd }
  const animals = [];
  let seed = 1, nextId = 1, lookAt = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const W = () => (typeof WORLD !== 'undefined' ? WORLD : { width: 3800, height: 1850 });
  const wet = (x, y) => typeof waterAtV067 === 'function' && waterAtV067(x, y);
  const inside = (x, y) => x > 30 && y > 30 && x < W().width - 30 && y < W().height - 30;
  const free = (x, y) => inside(x, y) && !wet(x, y) && !buildings.some(b => !b.dead && Math.abs(b.x - x) < b.w / 2 + 20 && Math.abs(b.y - y) < b.h / 2 + 20);
  // Dry land all the way: they do not swim the river.
  const clear = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 30); for (let i = 1; i <= n; i++) if (!free(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false; return true; };
  const deer = a => a.kind !== 'rabbit';
  const range = a => deer(a) ? cfg.homeRange : cfg.rabbitRange;

  function spot(cx, cy, r, tries = 24) {
    for (let i = 0; i < tries; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (free(x, y)) return { x, y };
    }
    return null;
  }
  function add(kind, x, y, hx, hy, herd) {
    animals.push({ id: nextId++, kind, x, y, hx, hy, herd, state: 'graze', tx: x, ty: y, until: elapsed + rnd() * 6, facing: rnd() * Math.PI * 2, scaredUntil: 0 });
    stats.spawned++;
  }
  // Deer at the edges of the woods (they come out to graze), rabbits in the open.
  function populate() {
    animals.length = 0; seed = 7919; nextId = 1;
    const woods = typeof TERRAIN_WOODS !== 'undefined' ? TERRAIN_WOODS : [];
    for (let h = 0; h < cfg.herds && woods.length; h++) {
      const w = woods[h % woods.length], a = rnd() * Math.PI * 2;
      const home = spot(w.x + w.w / 2 + Math.cos(a) * w.w * 0.55, w.y + w.h / 2 + Math.sin(a) * w.h * 0.55, 120);
      if (!home) continue;
      const n = cfg.herdMin + Math.floor(rnd() * (cfg.herdMax - cfg.herdMin + 1));
      for (let i = 0; i < n; i++) {
        const p = spot(home.x, home.y, 50) || home;
        add(i === 0 || rnd() < cfg.stagShare * 0.3 ? 'stag' : 'hind', p.x, p.y, home.x, home.y, h);
      }
    }
    for (let i = 0; i < cfg.rabbits; i++) {
      const p = spot(W().width / 2, W().height / 2, Math.min(W().width, W().height) * 0.7);
      if (p) add('rabbit', p.x, p.y, p.x, p.y, -1);
    }
  }

  // ---- fright: men near, or shots and bursts near ----
  function threat(a) {
    const shy = deer(a) ? cfg.deerShy : cfg.rabbitShy;
    let best = null, bd = shy;
    for (const u of units) {
      if (u.dead) continue;
      const dx = u.x - a.x; if (dx > bd || dx < -bd) continue;
      const d = Math.hypot(dx, u.y - a.y); if (d < bd) { best = u; bd = d; }
    }
    if (best) return best;
    if (typeof projectiles !== 'undefined') for (const p of projectiles) if (Math.hypot(p.x - a.x, p.y - a.y) < cfg.gunfireShy) return p;
    for (const b of root.__GRENADES_V1__?.bursts?.() || []) if (elapsed - b.t < 1 && Math.hypot(b.x - a.x, b.y - a.y) < cfg.gunfireShy) return b;
    return null;
  }
  function bolt(a, from) {
    // Away from the danger, a little to the side; a herd flees together.
    const mates = a.herd >= 0 ? animals.filter(b => b.herd === a.herd) : [a];
    const dist = deer(a) ? 260 + rnd() * 160 : 90 + rnd() * 70;
    for (const m of mates) {
      // Straight away if the way is clear, else veering off to one side or the other.
      const away = Math.atan2(m.y - from.y, m.x - from.x), jitter = (rnd() - 0.5) * 0.7;
      let tx = m.x, ty = m.y;
      for (const turn of [0, 0.5, -0.5, 1, -1, 1.4, -1.4]) {
        const ang = away + jitter + turn, x = m.x + Math.cos(ang) * dist, y = m.y + Math.sin(ang) * dist;
        if (clear(m.x, m.y, x, y)) { tx = x; ty = y; break; }
      }
      Object.assign(m, { state: 'run', tx, ty, scaredUntil: elapsed + cfg.calmAfter });
      // The new home ground is where they stop.
      m.hx = tx; m.hy = ty;
    }
    stats.bolts++;
  }
  function wander(a) {
    const r = rnd();
    if (r < 0.45) { a.state = 'graze'; a.until = elapsed + 4 + rnd() * 8; return; }
    if (r < 0.65) { a.state = 'idle'; a.until = elapsed + 2 + rnd() * 4; return; }
    const p = spot(a.hx, a.hy, range(a), 6);
    if (!p || !clear(a.x, a.y, p.x, p.y)) { a.state = 'graze'; a.until = elapsed + 3; return; }
    a.state = 'walk'; a.tx = p.x; a.ty = p.y;
  }
  function step(a, dt) {
    const speed = a.state === 'run' ? (deer(a) ? cfg.deerRun : cfg.rabbitRun) : deer(a) ? cfg.deerWalk : cfg.rabbitHop;
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), s = speed * dt;
    if (d > 0.5) a.facing = Math.atan2(dy, dx);
    const nx = d <= s ? a.tx : a.x + dx / d * s, ny = d <= s ? a.ty : a.y + dy / d * s;
    if (wet(nx, ny) || !inside(nx, ny)) { a.state = 'idle'; a.until = elapsed + 1; a.tx = a.x; a.ty = a.y; return; }
    a.x = nx; a.y = ny;
    if (d <= s) { a.state = 'graze'; a.until = elapsed + 3 + rnd() * 6; }
  }

  function update(dt) {
    if (!animals.length && units.length) populate();
    const look = elapsed >= lookAt;
    if (look) lookAt = elapsed + 0.25;
    for (const a of animals) {
      if (look && a.state !== 'run') { const t = threat(a); if (t) bolt(a, t); }
      if (a.state === 'walk' || a.state === 'run') step(a, dt);
      else if (elapsed >= a.until) wander(a);
    }
  }
  const baseUpdateProjectiles = updateProjectiles;
  updateProjectiles = function updateProjectilesWithWildlife(dt) {
    const r = baseUpdateProjectiles(dt);
    if (!gameOver) update(dt);
    return r;
  };
  if (typeof resetGame === 'function') {
    const base = resetGame;
    resetGame = function resetGameWithWildlife(...args) { animals.length = 0; return base(...args); };
  }

  root.__WILDLIFE_V1__ = Object.freeze({ version: '1.0', config: cfg, animals: () => animals, populate, bolt,
    stats: () => ({ ...stats, deer: animals.filter(deer).length, rabbits: animals.filter(a => !deer(a)).length,
      running: animals.filter(a => a.state === 'run').length }) });
})(window);
