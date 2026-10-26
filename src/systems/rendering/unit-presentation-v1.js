'use strict';
// Presentation only: one small record per rendered unit, no timers or assets.
// Distance drives feet; elapsed render time only damps transitions and breathing.
(function installUnitPresentation(root) {
  const TAU = Math.PI * 2, SECTOR = Math.PI / 4, PPM = 22.5;
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  let lastDt = -1, rates;
  function timing(dt) {
    if (dt !== lastDt) {
      lastDt = dt;
      rates = { speed: 1 - Math.exp(-dt / .075), weight: 1 - Math.exp(-dt / .1),
        turn: 1 - Math.exp(-dt / .11), brake: 1 - Math.exp(-dt / .09),
        offset: 1 - Math.exp(-dt / .045), scale: 1 - Math.exp(-dt / .06) };
    }
    return rates;
  }
  const approach = (a, b, rate) => a + (b - a) * rate;
  const seedOf = id => ((Math.imul((Number(id) || 0) + 17, 2654435761) >>> 0) / 4294967296);
  const mounted = u => u.type === 'cavalry' || (u.type === 'officer' && u.troop === 'mounted');
  function create(u) {
    return { x: u.x, y: u.y, speed: 0, vx: 0, vy: 0, moving: false,
      dir: ((Math.round((u.facing || 0) / SECTOR) % 8) + 8) % 8,
      turnWait: 0, turn: 0, gait: 'walk', phase: seedOf(u.id) * .35,
      weight: 0, brake: 0, dx: 0, dy: 0, scaleX: 1, scaleY: 1,
      seed: seedOf(u.id), action: null };
  }
  function update(p, u, dt, now, simTime, visible = true) {
    dt = clamp(dt, 0, .1);
    const rate = timing(dt);
    const dx = u.x - p.x, dy = u.y - p.y, distance = Math.hypot(dx, dy);
    p.x = u.x; p.y = u.y;
    // A snapshot relocation is not a stride or a sudden gallop.
    const relocated = distance > 80;
    const velocity = dt > 0 && !relocated ? distance / PPM / dt : 0;
    const oldSpeed = p.speed;
    p.speed = approach(p.speed, velocity, rate.speed);
    p.vx = approach(p.vx, dt > 0 && !relocated ? dx / dt : 0, rate.speed);
    p.vy = approach(p.vy, dt > 0 && !relocated ? dy / dt : 0, rate.speed);
    p.moving = p.speed > (p.moving ? .17 : .34);
    p.weight = approach(p.weight, p.moving ? 1 : 0, rate.weight);
    const horse = mounted(u);
    if (horse) {
      // Hysteresis keeps a horse from alternating gait at a speed boundary.
      if (u.chargeTimer > 0 && p.moving) p.gait = 'gallop';
      else if (p.gait === 'gallop' && p.speed > 4.05) p.gait = 'gallop';
      else if (p.speed > 4.65) p.gait = 'gallop';
      else if (p.speed > (p.gait === 'trot' ? 2.15 : 2.65)) p.gait = 'trot';
      else p.gait = 'walk';
    }
    const stride = horse ? (p.gait === 'gallop' ? 3.6 : p.gait === 'trot' ? 2.8 : 2.4)
      : u.type === 'artillery' ? 1.2 : u.routing ? 1.6 : 1.5;
    // Keep normalized phase through gait changes, never restart the feet.
    if (!relocated) p.phase = (p.phase + distance / PPM / stride) % 1;
    const heading = p.moving && Math.hypot(p.vx, p.vy) > 2 ? Math.atan2(p.vy, p.vx) : u.facing || 0;
    const delta = wrap(heading - p.dir * SECTOR);
    p.turnWait = Math.max(0, p.turnWait - dt);
    if (Math.abs(delta) > SECTOR / 2 + .12 && p.turnWait <= 0) {
      p.dir = (p.dir + (delta > 0 ? 1 : 7)) % 8;
      p.turnWait = horse ? .085 : .06;
    }
    p.turn = approach(p.turn, clamp(delta / Math.PI, -1, 1), rate.turn);
    p.brake = approach(p.brake, horse ? clamp((oldSpeed - p.speed) * 3) : 0, rate.brake);
    if (!visible) return distance;
    const phase = p.phase * TAU, breath = Math.sin(now * (1.5 + p.seed * .35) + p.seed * TAU);
    let x = horse ? p.turn * p.weight * .9 : Math.sin(phase) * .16 * p.weight;
    let y = -Math.abs(Math.sin(phase)) * (horse ? .8 : .34) * p.weight - breath * .13 * (1 - p.weight);
    let sx = 1 - (horse ? Math.abs(p.turn) * .025 + p.brake * .025 : 0);
    let sy = 1 + (horse ? p.brake * .015 : 0);
    if (u.injuryLevel) {
      const injury = clamp(u.injuryLevel, 0, 2);
      y += (1 + Math.sin(phase)) * injury * .3 * p.weight;
      sy -= injury * (horse ? .006 : .012);
    }
    const active = !u.routing && u.meleeActionUntil > simTime;
    p.action = active ? u.meleeAction : null;
    if (active) {
      const age = clamp((simTime - u.meleeActionAt) / Math.max(.01, u.meleeActionUntil - u.meleeActionAt));
      const variant = (u.meleeVariant || 0) % 2;
      const impulse = Math.sin(Math.PI * age) ** (variant ? .7 : 1.4);
      const a = u.meleeActionFacing || 0;
      const force = u.meleeAction === 'strike' ? (variant ? 3.7 : 4.5)
        : u.meleeAction === 'parry' ? -1.8 : -3;
      x += Math.cos(a) * force * impulse;
      y += Math.sin(a) * force * impulse * .5;
      if (u.meleeAction === 'strike') { sx += impulse * .018; sy -= impulse * .008; }
      else if (u.meleeAction === 'brace' || u.meleeAction === 'recoil') sy -= impulse * .025;
    }
    // A body may ease into a pose, but its feet and simulation position stay put.
    p.dx = approach(p.dx, x, rate.offset); p.dy = approach(p.dy, y, rate.offset);
    p.scaleX = approach(p.scaleX, sx, rate.scale); p.scaleY = approach(p.scaleY, sy, rate.scale);
    return distance;
  }
  function strikeFrame(u, simTime) {
    const age = clamp((simTime - u.meleeActionAt) / Math.max(.01, u.meleeActionUntil - u.meleeActionAt));
    // Two real strike variants: a quick thrust/cut, or a longer held extension.
    const extension = u.meleeVariant ? .24 : .34, recovery = u.meleeVariant ? .7 : .55;
    return age < extension ? 0 : age < recovery ? 1 : 2;
  }
  function fallFrame(id, age, duration) {
    const seed = seedOf(id), fall = .49 + seed * .12;
    const down = clamp(age / fall), rise = Number.isFinite(duration) ? clamp((duration - age) / (.67 + seed * .12)) : 1;
    const progress = Math.min(down * down * (3 - 2 * down), rise * rise * (3 - 2 * rise));
    return clamp(Math.floor(progress * 4), 0, 3);
  }
  const api = Object.freeze({ create, update, strikeFrame, fallFrame });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.__UNIT_PRESENTATION_V1__ = api;
})(typeof window !== 'undefined' ? window : globalThis);
