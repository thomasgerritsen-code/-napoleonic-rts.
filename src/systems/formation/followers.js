'use strict';
// ---------- Architecture v2: formation slot followers ----------
// Behaviour-compatible extraction of the active v0.7.1 follower/collision layer.

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

function waterSafeFollowerTargetV071(u, tx, ty) {
  const memory = u?.bridgeLastCrossingV1;
  if (!memory || !Number.isFinite(tx) || !Number.isFinite(ty) || !segmentCrossesBlockedWaterV067(u.x,u.y,tx,ty)) return {x:tx,y:ty,guarded:false};
  const c = WATER_CROSSINGS_V067.find(item => item.id === memory.crossingId);
  if (!c) return {x:tx,y:ty,guarded:false};
  const direction = -memory.initialSide;
  const local = crossingLocalArchitectureV2(c,u.x,u.y);
  const radius = Number(TYPES[u.type]?.radius)||7;
  const safeHalf = Math.max(8,c.width/2-radius-8);
  const centeredPerp = Math.max(-safeHalf*.2,Math.min(safeHalf*.2,local.perp));
  const maxAlong = c.length/2+90;
  let safe = null;
  for (const step of [28,18,10,5]) {
    const along = Math.max(-maxAlong,Math.min(maxAlong,local.along+direction*step));
    for (const perp of [centeredPerp,0]) {
      const p = crossingPointArchitectureV2(c,along,perp);
      if (!waterAtV067(p.x,p.y) && !segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y) && Math.hypot(p.x-u.x,p.y-u.y)>1) { safe=p; break; }
    }
    if (safe) break;
  }
  if (!safe) {
    const p = crossingPointArchitectureV2(c,Math.max(-maxAlong,Math.min(maxAlong,local.along)),0);
    if (!waterAtV067(p.x,p.y) && !segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y)) safe=p;
  }
  if (!safe) return {x:tx,y:ty,guarded:false};
  u.targetX=safe.x;u.targetY=safe.y;u.arrivedAtTarget=false;
  u.bridgeFollowerSafetyV1={crossingId:c.id,correctedAt:elapsed,motionGuard:true};
  return {x:safe.x,y:safe.y,guarded:true};
}

function dampedSlotMoveV071(u, reg, tx, ty, dt) {
  const cfg = window.NRTS_CONFIG?.formation?.followers || {};
  const movementCfg = window.NRTS_CONFIG?.movement || {};
  const state = followerStateV071(u);
  const safeDt = Math.max(0.001, Math.min(0.05, dt));
  const kind = groupKindV06(reg);
  const march = reg.marchV063;
  const road = !!roadNetworkAtV066(march.anchorX, march.anchorY);
  const engagement = !!reg.engagementV069;
  const traffic = reg.crossingTrafficV068;

  let targetVx = (tx - state.lastTargetX) / safeDt;
  let targetVy = (ty - state.lastTargetY) / safeDt;
  const velocityCaps = cfg.targetVelocityCaps || { infantry:92, cavalry:150 };
  const targetCap = kind === 'cavalry' ? velocityCaps.cavalry : velocityCaps.infantry;
  const targetVelocity = clampMagnitudeV071(targetVx, targetVy, targetCap);
  targetVx = targetVelocity.x;
  targetVy = targetVelocity.y;
  state.lastTargetX = tx;
  state.lastTargetY = ty;

  const errorX = tx - u.x;
  const errorY = ty - u.y;
  const error = Math.hypot(errorX, errorY);
  V071_STATS.maxSlotError = Math.max(V071_STATS.maxSlotError, error);

  const lookAheadCfg = cfg.lookAhead || { road:0.075, field:0.060 };
  const lookAhead = road ? lookAheadCfg.road : lookAheadCfg.field;
  const leadX = tx + targetVx * lookAhead;
  const leadY = ty + targetVy * lookAhead;
  const smoothCfg = cfg.smoothTime || { engagement:0.105, forcedColumn:0.110, road:0.125, field:0.145 };
  const smoothTime = engagement ? smoothCfg.engagement : traffic?.forcedColumn ? smoothCfg.forcedColumn : road ? smoothCfg.road : smoothCfg.field;

  const xResult = smoothDampAxisV071(u.x, leadX, state.vx, smoothTime, safeDt);
  const yResult = smoothDampAxisV071(u.y, leadY, state.vy, smoothTime, safeDt);
  let dx = xResult.value - u.x;
  let dy = yResult.value - u.y;

  const base = Math.max(1, Number(TYPES[u.type]?.speed) || 1);
  const targetSpeed = Math.hypot(targetVx, targetVy);
  const catchupRatio = Number.isFinite(cfg.catchupAllowanceRatio) ? cfg.catchupAllowanceRatio : 0.72;
  const catchupGain = Number.isFinite(cfg.catchupErrorGain) ? cfg.catchupErrorGain : 1.45;
  const catchupAllowance = Math.min(base * catchupRatio, Math.max(0, error - 5) * catchupGain);
  const hardCaps = movementCfg.followerHardCaps || { infantry:124, cavalry:178 };
  const followerHardCap = kind === 'cavalry' ? hardCaps.cavalry : hardCaps.infantry;
  const roadFactor = Number.isFinite(cfg.roadFollowerFactor) ? cfg.roadFollowerFactor : 1.30;
  const fieldFactor = Number.isFinite(cfg.fieldFollowerFactor) ? cfg.fieldFollowerFactor : 1.16;
  const maxSpeed = Math.min(followerHardCap, Math.max(base * (road ? roadFactor : fieldFactor), targetSpeed + catchupAllowance));
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

  if (error < 0.85 && targetSpeed < 0.8 && Math.hypot(state.vx,state.vy) < 2.0) {
    state.vx *= 0.55;
    state.vy *= 0.55;
  }

  u.x = Math.max(8, Math.min(WORLD.width-8, u.x + dx));
  u.y = Math.max(8, Math.min(WORLD.height-8, u.y + dy));
  const arrivalDistance = Number.isFinite(movementCfg.slotArrivalDistance) ? movementCfg.slotArrivalDistance : 1.35;
  u.arrivedAtTarget = error < arrivalDistance && Math.hypot(state.vx-targetVx,state.vy-targetVy) < 3.5;

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
  const moveTowardV070ForV071 = moveToward;
  moveToward = function moveTowardV071(u, tx, ty, dt, speed = TYPES[u.type].speed) {
    const reg = u.regimentId ? getRegiment(u.regimentId) : null;
    if (formalFollowerEligibleV071(u, reg)) {
      const guarded = waterSafeFollowerTargetV071(u,tx,ty);
      return dampedSlotMoveV071(u, reg, guarded.x, guarded.y, dt);
    }
    if (u.slotFollowerV071 && (!reg || !reg.marchV063?.v064 || u.routing)) u.slotFollowerV071 = null;
    return moveTowardV070ForV071(u, tx, ty, dt, speed);
  };

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
}
