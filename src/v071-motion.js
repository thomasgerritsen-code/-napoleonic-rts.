'use strict';
// ---------- Napoleonic RTS v0.7.1: fixed-step anchor motion + critically damped slot followers ----------

const V071_VERSION = '0.7.1';
const V071_TEST_MODE = new URLSearchParams(location.search).get('test');
const V071_ACTIVE = V071_TEST_MODE !== '1' && V071_TEST_MODE !== 'v070';
const V071_FIXED_DT = 1 / 60;
const V071_STATS = {
  solver:'anchor-damped-slots-fixed60-render-interp',
  followerSteps:0,
  followerSamples:0,
  maxSlotError:0,
  maxFollowerSpeed:0,
  maxFollowerAcceleration:0,
  directionReversals:0,
  internalCollisionSkips:0,
  fixedSteps:0,
  renderFrames:0,
  droppedFixedTime:0
};

let V071_ACCUMULATOR = 0;
let V071_RENDER_ALPHA = 1;

function clampMagnitudeV071(x, y, maxLength) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= maxLength || length < 0.0001) return {x, y, length};
  const scale = maxLength / length;
  return {x:x*scale, y:y*scale, length:maxLength};
}

function smoothDampAxisV071(current, target, velocity, smoothTime, dt) {
  smoothTime = Math.max(0.045, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48*x*x + 0.235*x*x*x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const nextVelocity = (velocity - omega * temp) * exp;
  const output = target + (change + temp) * exp;
  return {value:output, velocity:nextVelocity};
}

function followerStateV071(u) {
  if (!u.slotFollowerV071) {
    u.slotFollowerV071 = {
      vx:0, vy:0,
      lastVx:0, lastVy:0,
      lastTargetX:Number.isFinite(u.targetX) ? u.targetX : u.x,
      lastTargetY:Number.isFinite(u.targetY) ? u.targetY : u.y,
      lastCorrectionX:0,
      lastCorrectionY:0
    };
  }
  return u.slotFollowerV071;
}

function formalFollowerEligibleV071(u, reg) {
  if (!V071_ACTIVE || !reg || reg.destroyed || u.dead || u.routing) return false;
  if (groupKindV06(reg) === 'artillery') return false;
  return !!reg.marchV063?.v064;
}

function dampedSlotMoveV071(u, reg, tx, ty, dt) {
  const state = followerStateV071(u);
  const safeDt = Math.max(0.001, Math.min(0.05, dt));
  const kind = groupKindV06(reg);
  const march = reg.marchV063;
  const road = !!roadNetworkAtV066(march.anchorX, march.anchorY);
  const engagement = !!reg.engagementV069;
  const traffic = reg.crossingTrafficV068;

  let targetVx = (tx - state.lastTargetX) / safeDt;
  let targetVy = (ty - state.lastTargetY) / safeDt;
  const targetCap = kind === 'cavalry' ? 150 : 92;
  const targetVelocity = clampMagnitudeV071(targetVx, targetVy, targetCap);
  targetVx = targetVelocity.x;
  targetVy = targetVelocity.y;
  state.lastTargetX = tx;
  state.lastTargetY = ty;

  const errorX = tx - u.x;
  const errorY = ty - u.y;
  const error = Math.hypot(errorX, errorY);
  V071_STATS.maxSlotError = Math.max(V071_STATS.maxSlotError, error);

  // Anticipate a moving formation slot slightly so a marching soldier follows
  // the battalion anchor instead of repeatedly falling behind and catching up.
  const lookAhead = road ? 0.075 : 0.060;
  const leadX = tx + targetVx * lookAhead;
  const leadY = ty + targetVy * lookAhead;
  const smoothTime = engagement ? 0.105 : traffic?.forcedColumn ? 0.110 : road ? 0.125 : 0.145;

  const xResult = smoothDampAxisV071(u.x, leadX, state.vx, smoothTime, safeDt);
  const yResult = smoothDampAxisV071(u.y, leadY, state.vy, smoothTime, safeDt);
  let dx = xResult.value - u.x;
  let dy = yResult.value - u.y;

  // Never allow formation recovery to become a hidden teleport. Large errors may
  // catch up, but only at a bounded physical speed.
  const base = Math.max(1, Number(TYPES[u.type]?.speed) || 1);
  const targetSpeed = Math.hypot(targetVx, targetVy);
  const catchupAllowance = Math.min(base * 0.72, Math.max(0, error - 5) * 1.45);
  const maxSpeed = Math.max(base * (road ? 1.30 : 1.16), targetSpeed + catchupAllowance);
  const bounded = clampMagnitudeV071(dx, dy, maxSpeed * safeDt);
  dx = bounded.x;
  dy = bounded.y;

  const oldVx = state.vx;
  const oldVy = state.vy;
  state.vx = dx / safeDt;
  state.vy = dy / safeDt;
  const acceleration = Math.hypot(state.vx-oldVx, state.vy-oldVy) / safeDt;
  V071_STATS.maxFollowerSpeed = Math.max(V071_STATS.maxFollowerSpeed, Math.hypot(state.vx,state.vy));
  V071_STATS.maxFollowerAcceleration = Math.max(V071_STATS.maxFollowerAcceleration, acceleration);

  // Count meaningful correction reversals. Tiny sub-pixel sign changes are
  // intentionally ignored; they are inside the visual dead-zone.
  if (error > 2.2) {
    const correctionX = Math.sign(errorX);
    const correctionY = Math.sign(errorY);
    if ((state.lastCorrectionX && correctionX && correctionX !== state.lastCorrectionX && Math.abs(errorX) > 3.0) ||
        (state.lastCorrectionY && correctionY && correctionY !== state.lastCorrectionY && Math.abs(errorY) > 3.0)) {
      V071_STATS.directionReversals++;
    }
    state.lastCorrectionX = correctionX || state.lastCorrectionX;
    state.lastCorrectionY = correctionY || state.lastCorrectionY;
  }

  // A small dead-zone prevents sub-pixel left/right hunting around the slot.
  if (error < 0.85 && targetSpeed < 0.8 && Math.hypot(state.vx,state.vy) < 2.0) {
    state.vx *= 0.55;
    state.vy *= 0.55;
  }

  u.x = Math.max(8, Math.min(WORLD.width-8, u.x + dx));
  u.y = Math.max(8, Math.min(WORLD.height-8, u.y + dy));
  u.arrivedAtTarget = error < 1.35 && Math.hypot(state.vx-targetVx,state.vy-targetVy) < 3.5;

  // Facing also approaches the battalion heading continuously instead of being
  // reassigned by every member update.
  if (u.type !== 'artillery') {
    const facingTarget = Number.isFinite(reg.facing) ? reg.facing : u.facing;
    const delta = normalizeAngleV063(facingTarget - u.facing);
    const maxTurn = (kind === 'cavalry' ? 5.4 : 4.4) * safeDt;
    u.facing = normalizeAngleV063(u.facing + clampV064(delta, -maxTurn, maxTurn));
  }

  V071_STATS.followerSteps++;
  V071_STATS.followerSamples++;
  return u.arrivedAtTarget;
}

if (V071_ACTIVE) {
  document.title = `Napoleonic RTS v${V071_VERSION}`;
  const badge = document.querySelector('.version');
  if (badge) badge.textContent = `v${V071_VERSION}`;

  const moveTowardV070ForV071 = moveToward;
  moveToward = function moveTowardV071(u, tx, ty, dt, speed = TYPES[u.type].speed) {
    const reg = u.regimentId ? getRegiment(u.regimentId) : null;
    if (formalFollowerEligibleV071(u, reg)) return dampedSlotMoveV071(u, reg, tx, ty, dt);
    if (u.slotFollowerV071 && (!reg || !reg.marchV063?.v064 || u.routing)) u.slotFollowerV071 = null;
    return moveTowardV070ForV071(u, tx, ty, dt, speed);
  };

  // Formation slots already define separation inside one intact battalion. Do
  // not let a second collision controller push those soldiers away from slots.
  // Cross-battalion, enemy and obstacle contacts retain collision correction.
  resolveUnitOverlaps = function resolveUnitOverlapsV071() {
    const visited = new Set();
    for (const u of units) {
      if (u.dead) continue;
      for (const other of nearbyNavUnits(u)) {
        if (other.dead || other === u) continue;
        const pair = u.id < other.id ? `${u.id}:${other.id}` : `${other.id}:${u.id}`;
        if (visited.has(pair)) continue;
        visited.add(pair);

        let dx = other.x-u.x, dy = other.y-u.y;
        let d = Math.hypot(dx,dy);
        const minD = TYPES[u.type].radius + TYPES[other.type].radius + 1.5;
        if (d >= minD) continue;
        if (d < 0.001) {
          const angle = ((u.id*37 + other.id*53) % 360) * Math.PI / 180;
          dx=Math.cos(angle); dy=Math.sin(angle); d=1;
        }

        const sameGroup = !!(u.regimentId && u.regimentId === other.regimentId);
        const sameReg = sameGroup ? getRegiment(u.regimentId) : null;
        const intactFormation = !!(sameReg && !sameReg.destroyed && !u.routing && !other.routing);
        if (intactFormation) {
          V071_STATS.internalCollisionSkips++;
          continue;
        }

        const regA = u.regimentId ? getRegiment(u.regimentId) : null;
        const regB = other.regimentId ? getRegiment(other.regimentId) : null;
        const softCombat = u.side !== other.side && !!(regA?.engagementV069 || regB?.engagementV069);
        const bothSettled = u.arrivedAtTarget && other.arrivedAtTarget;
        const correction = (minD-d) * (softCombat ? 0.10 : sameGroup ? 0.05 : bothSettled ? 0.12 : 0.28);
        const nx=dx/d, ny=dy/d;
        u.x -= nx*correction; u.y -= ny*correction;
        other.x += nx*correction; other.y += ny*correction;
        navStats.overlapCorrections++;
      }
    }
    if (typeof syncAllBatteryCrewV061 === 'function') syncAllBatteryCrewV061(0);
  };

  // Production frames use a fixed 60 Hz simulation. Manual regression pages
  // continue to advance exactly by RTS_SIM.step()/tick(), preserving deterministic
  // historical tests.
  const updateV070ForV071 = update;
  update = function updateV071(dt) {
    const manual = typeof TEST_MANUAL_SIMULATION !== 'undefined' && TEST_MANUAL_SIMULATION;
    if (manual) {
      V071_RENDER_ALPHA = 1;
      return updateV070ForV071(dt);
    }

    V071_ACCUMULATOR = Math.min(0.20, V071_ACCUMULATOR + Math.max(0, Math.min(0.05, dt)));
    let steps = 0;
    while (V071_ACCUMULATOR >= V071_FIXED_DT && steps < 8) {
      for (const u of units) {
        if (u.dead) continue;
        u.renderPrevXV071 = u.x;
        u.renderPrevYV071 = u.y;
        u.renderPrevFacingV071 = u.facing;
      }
      updateV070ForV071(V071_FIXED_DT);
      V071_ACCUMULATOR -= V071_FIXED_DT;
      V071_STATS.fixedSteps++;
      steps++;
    }
    if (steps >= 8 && V071_ACCUMULATOR >= V071_FIXED_DT) {
      V071_STATS.droppedFixedTime += V071_ACCUMULATOR;
      V071_ACCUMULATOR %= V071_FIXED_DT;
    }
    V071_RENDER_ALPHA = clampV064(V071_ACCUMULATOR / V071_FIXED_DT, 0, 1);
  };

  // Renderer interpolation is deliberately visual-only. Simulation coordinates
  // remain untouched outside the synchronous draw call.
  const drawV070ForV071 = draw;
  draw = function drawV071() {
    const manual = typeof TEST_MANUAL_SIMULATION !== 'undefined' && TEST_MANUAL_SIMULATION;
    if (manual || V071_RENDER_ALPHA >= 0.999) return drawV070ForV071();
    const saved = [];
    for (const u of units) {
      if (u.dead || !Number.isFinite(u.renderPrevXV071) || !Number.isFinite(u.renderPrevYV071)) continue;
      saved.push([u,u.x,u.y,u.facing]);
      u.x = u.renderPrevXV071 + (u.x-u.renderPrevXV071) * V071_RENDER_ALPHA;
      u.y = u.renderPrevYV071 + (u.y-u.renderPrevYV071) * V071_RENDER_ALPHA;
      if (Number.isFinite(u.renderPrevFacingV071)) {
        const fd = normalizeAngleV063(u.facing-u.renderPrevFacingV071);
        u.facing = normalizeAngleV063(u.renderPrevFacingV071 + fd * V071_RENDER_ALPHA);
      }
    }
    try {
      V071_STATS.renderFrames++;
      drawV070ForV071();
    } finally {
      for (const [u,x,y,facing] of saved) { u.x=x; u.y=y; u.facing=facing; }
    }
  };

  const resetGameV070ForV071 = resetGame;
  resetGame = function resetGameV071() {
    resetGameV070ForV071();
    V071_ACCUMULATOR = 0;
    V071_RENDER_ALPHA = 1;
    for (const key of Object.keys(V071_STATS)) {
      if (typeof V071_STATS[key] === 'number') V071_STATS[key] = 0;
    }
    V071_STATS.solver = 'anchor-damped-slots-fixed60-render-interp';
    statusEl.textContent = 'v0.7.1: vloeiende bataljonsmars met 60 Hz simulatie, gedempte formatieslots en renderinterpolatie.';
  };
}
