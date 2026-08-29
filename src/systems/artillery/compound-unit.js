'use strict';
// ---------- Architecture v2: artillery compound unit ----------
// Cannon position is authoritative. Crew are rigid visual/logical followers of a
// smoothed battery state instead of independent movers that can fight the cannon.
(function installArtilleryCompoundV2(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before artillery systems.');

  const STATE = new Map();
  const DEPLOYED = Object.freeze([
    Object.freeze({ox:-9, oy:-24}),
    Object.freeze({ox:-9, oy:24})
  ]);
  const TRAVEL = Object.freeze([
    Object.freeze({ox:-28, oy:-14}),
    Object.freeze({ox:-28, oy:14})
  ]);

  function angleDelta(from, to) {
    return Math.atan2(Math.sin(to-from), Math.cos(to-from));
  }

  function smoothAngle(current, target, rate, dt) {
    if (!(dt > 0)) return current;
    const alpha = 1 - Math.exp(-Math.max(0.01, rate) * dt);
    return current + angleDelta(current, target) * alpha;
  }

  function batteryState(reg, cannon) {
    let state = STATE.get(reg.id);
    if (!state) {
      state = {
        mode:'deployed',
        travelBlend:0,
        settledSeconds:0,
        facing:Number.isFinite(cannon.facing) ? cannon.facing : (Number.isFinite(reg.facing) ? reg.facing : 0),
        lastX:cannon.x,
        lastY:cannon.y,
        lastDisplacement:0
      };
      STATE.set(reg.id, state);
    }
    return state;
  }

  function travelIntent(reg, cannon, state) {
    // Travel stance follows authoritative command + physical motion only. Legacy
    // targetX/arrivedAtTarget fields may remain stale after the route has handed off,
    // so they must not keep the crew permanently in its travel pose.
    const routeActive = Array.isArray(reg.path);
    const physicallyMoving = state.lastDisplacement > 0.10;
    return routeActive || physicallyMoving;
  }

  function targetTravelFacing(reg, cannon, state) {
    const dx = cannon.x - state.lastX;
    const dy = cannon.y - state.lastY;
    if (Math.hypot(dx,dy) > 0.08) return Math.atan2(dy,dx);
    const tx = (cannon.targetX ?? cannon.x) - cannon.x;
    const ty = (cannon.targetY ?? cannon.y) - cannon.y;
    if (Math.hypot(tx,ty) > 3) return Math.atan2(ty,tx);
    if (Number.isFinite(reg.targetFacing)) return reg.targetFacing;
    if (Number.isFinite(reg.facing)) return reg.facing;
    return Number.isFinite(cannon.facing) ? cannon.facing : state.facing;
  }

  function blendOffset(index, blend) {
    const a = DEPLOYED[index] || DEPLOYED[0];
    const b = TRAVEL[index] || TRAVEL[0];
    return {
      ox:a.ox + (b.ox-a.ox)*blend,
      oy:a.oy + (b.oy-a.oy)*blend
    };
  }

  function currentOffsets(reg, cannon) {
    const state = batteryState(reg,cannon);
    return [blendOffset(0,state.travelBlend), blendOffset(1,state.travelBlend)];
  }

  function worldPoint(cannon, offset, facing) {
    const cos=Math.cos(facing), sin=Math.sin(facing);
    return {
      x:cannon.x + offset.ox*cos - offset.oy*sin,
      y:cannon.y + offset.ox*sin + offset.oy*cos
    };
  }

  function syncCompound(reg, dt=0) {
    if (!reg || reg.destroyed || groupKindV06(reg)!=='artillery') return;
    const cannon=artilleryForGroupV06(reg);
    const crew=artilleryCrewV06(reg).slice(0,2);
    if (!cannon || crew.length<2) return;

    const state=batteryState(reg,cannon);
    const previousX=state.lastX, previousY=state.lastY;
    // Several collision/compatibility hooks call sync with dt=0 in the same frame.
    // Only the authoritative timed update may consume the displacement sample, otherwise
    // a dt=0 sync can erase the fact that the cannon just moved.
    if (dt>0) {
      state.lastDisplacement=Math.hypot(cannon.x-previousX,cannon.y-previousY);
    }

    const intent=travelIntent(reg,cannon,state);
    if (intent) {
      state.mode='travel';
      state.settledSeconds=0;
    } else if (dt>0) {
      state.settledSeconds += dt;
      // Do not deploy the crew the instant the cannon crosses its arrival threshold.
      // This hysteresis removes the travel/deployed flicker at the end of a move.
      if (state.settledSeconds >= 0.32) state.mode='deployed';
    }

    if (dt>0) {
      const desiredBlend=state.mode==='travel'?1:0;
      const blendRate=desiredBlend>state.travelBlend?7.5:4.8;
      const alpha=1-Math.exp(-blendRate*dt);
      state.travelBlend += (desiredBlend-state.travelBlend)*alpha;
      if (Math.abs(state.travelBlend-desiredBlend)<0.002) state.travelBlend=desiredBlend;

      const desiredFacing=state.mode==='travel'
        ? targetTravelFacing(reg,cannon,{...state,lastX:previousX,lastY:previousY})
        : (Number.isFinite(reg.targetFacing)?reg.targetFacing:(Number.isFinite(reg.facing)?reg.facing:cannon.facing));
      state.facing=smoothAngle(state.facing,desiredFacing,state.mode==='travel'?8.5:6.0,dt);
    }

    cannon.batteryMovingV061 = state.mode==='travel' || state.travelBlend>0.08;
    cannon.facing=state.facing;
    reg.facing=state.facing;

    const offsets=currentOffsets(reg,cannon);
    crew.forEach((member,index)=>{
      const p=worldPoint(cannon,offsets[index],state.facing);
      // Crew have no independent movement authority while attached to the battery.
      member.x=p.x; member.y=p.y;
      member.targetX=p.x; member.targetY=p.y;
      member.facing=state.facing;
      member.formationFacing=state.facing;
      member.arrivedAtTarget=state.mode==='deployed' && state.travelBlend<0.04;
      member.task=null;
      member.resourceTarget=null;
      member.slotFollowerV071=null;
    });

    if (dt>0) {
      state.lastX=cannon.x;
      state.lastY=cannon.y;
    }
  }

  function syncAll(dt=0) {
    for (const reg of regiments) {
      if (!reg.destroyed && groupKindV06(reg)==='artillery') syncCompound(reg,dt);
    }
    for (const id of [...STATE.keys()]) {
      const reg=regiments.find(item=>item.id===id);
      if (!reg || reg.destroyed) STATE.delete(id);
    }
  }

  // Keep v0.6.1 compatibility call sites, but route them into the Architecture-v2 owner.
  batteryCrewLocalOffsetsV061=function batteryCrewLocalOffsetsArtilleryV2(reg,cannon){
    return currentOffsets(reg,cannon);
  };
  batteryMovingV061=function batteryMovingArtilleryV2(reg,cannon){
    if (!reg || !cannon) return false;
    const state=batteryState(reg,cannon);
    return state.mode==='travel' || state.travelBlend>0.08;
  };
  syncBatteryCrewV061=syncCompound;
  syncAllBatteryCrewV061=syncAll;

  const api=Object.freeze({
    syncBattery:syncCompound,
    syncAll,
    state(id){
      const reg=regiments.find(item=>item.id===id && !item.destroyed && groupKindV06(item)==='artillery');
      const cannon=reg?artilleryForGroupV06(reg):null;
      if (!reg || !cannon) return null;
      const state=batteryState(reg,cannon);
      return {
        mode:state.mode,
        travelBlend:state.travelBlend,
        settledSeconds:state.settledSeconds,
        facing:state.facing,
        displacement:state.lastDisplacement,
        offsets:currentOffsets(reg,cannon),
        routeActive:Array.isArray(reg.path),
        cannonArrived:cannon.arrivedAtTarget===true,
        targetDistance:Math.hypot((cannon.targetX ?? cannon.x)-cannon.x,(cannon.targetY ?? cannon.y)-cannon.y),
        pathIndex:reg.pathIndex||0,
        pathLength:Array.isArray(reg.path)?reg.path.length:0
      };
    }
  });

  if (!nrts.subsystems.has('artillery')) {
    nrts.subsystems.register('artillery',api,{
      phase:'architecture-v2',
      legacyBridge:false,
      responsibility:'authoritative cannon compound movement with rigid crew followers and stable deploy/travel transitions'
    });
  }

  nrts.events.emit('artillery:ready',{owner:'src/systems/artillery/compound-unit.js'});
})(window);
