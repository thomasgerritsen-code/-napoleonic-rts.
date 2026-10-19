'use strict';
// v291: recovering British regiments rejoin the army as a reserve before a
// renewed frontal attack. Never takes ownership of movement, bridge traffic,
// manual French commands or the existing rally route.
(function installAiRegroupReserveV291(root) {
  if (root.__AI_REGROUP_RESERVE_V291__ || typeof aiOrderReg !== 'function') return;
  const RESERVE_SECONDS = 16;
  const SUPPORT_RANGE = 900;
  const RESERVE_BACK = 195;
  const RESERVE_FLANK = 95;
  const stats = { protectedRallies:0, reserveOrders:0, frontlineReturns:0,
    unsupportedHolds:0, officerHolds:0, bridgeHolds:0 };
  const baseOrder = aiOrderReg;
  const aggressive = new Set(['MASS','ADVANCE','ATTACK','FLANK']);
  function living(reg) {
    return regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
  }
  function hasOfficer(reg) {
    return Boolean(reg?.officerId && living(reg).some(u=>u.id===reg.officerId));
  }
  function crossing(reg) {
    const t=reg?.crossingTrafficV068;
    return Boolean(t?.forcedColumn ||
      ['waiting','approach','crossing','clearing'].includes(t?.state));
  }
  function recovering(reg) {
    const phase=reg?.regroupV290?.phase;
    return Boolean(reg?.orderlyFallbackV289 &&
      ['withdrawing','regrouping','threatened'].includes(phase));
  }
  function isBattleOrder(reg) {
    return Boolean(reg && reg.side==='britain' && !reg.destroyed &&
      aggressive.has(AI_COMMANDER_V1.state) && !v05PeaceMode && !gameOver);
  }
  function nearestSupport(reg) {
    const center=aiRegCenter(reg);
    let closest=null;
    for(const other of activeRegiments('britain')) {
      if(other===reg || other.destroyed || crossing(other) || recovering(other) ||
          other.regroupV290?.phase==='interrupted' ||
          other.morale<70 || !hasOfficer(other))continue;
      const position=aiRegCenter(other),distance=Math.hypot(position.x-center.x,position.y-center.y);
      if(distance>SUPPORT_RANGE)continue;
      if(!closest||distance<closest.distance)closest={reg:other,position,distance};
    }
    return closest;
  }
  function safePosition(pos) {
    if(!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) ||
      pos.x<80 || pos.y<80 || pos.x>WORLD.width-80 || pos.y>WORLD.height-80)return false;
    if(typeof waterAtV067==='function' && waterAtV067(pos.x,pos.y))return false;
    return true;
  }
  function reservePosition(reg,support,target) {
    const c=support.position;
    const dx=target.x-c.x,dy=target.y-c.y;
    const length=Math.hypot(dx,dy);
    const facing=length>10?Math.atan2(dy,dx):support.reg.facing||0;
    const ux=Math.cos(facing),uy=Math.sin(facing);
    const lateral=String(reg.id).charCodeAt(String(reg.id).length-1)%2?RESERVE_FLANK:-RESERVE_FLANK;
    return {x:c.x-ux*RESERVE_BACK-uy*lateral,
      y:c.y-uy*RESERVE_BACK+ux*lateral, facing};
  }
  aiOrderReg = function aiOrderRegWithRegroupV291(reg,point,formation='line',facing=null) {
    if(!isBattleOrder(reg))return baseOrder.apply(this,arguments);
    if(recovering(reg)) {
      stats.protectedRallies++;
      return;
    }
    const rally=reg.regroupV290;
    if(rally?.phase!=='ready' || !Number.isFinite(rally.readyAt))return baseOrder.apply(this,arguments);
    // The soldier cannot lead a second charge without surviving command.
    if(!hasOfficer(reg)) {stats.officerHolds++;return;}
    if(crossing(reg)){stats.bridgeHolds++;return;}
    if(elapsed-rally.readyAt<RESERVE_SECONDS) {
      const friend=nearestSupport(reg);
      if(!friend || !point){stats.unsupportedHolds++;return;}
      const reserve=reservePosition(reg,friend,point);
      if(!safePosition(reserve)) {stats.unsupportedHolds++;return;}
      // Existing pathfinder owns the physical column/line and all water crossings.
      const destination={x:reserve.x,y:reserve.y};
      const existing=reg.finalTarget;
      if(existing && Math.hypot(existing.x-destination.x,existing.y-destination.y)<28){
        stats.reserveOrders++;
        return;
      }
      stats.reserveOrders++;
      return baseOrder.call(this,reg,destination,'column',reserve.facing);
    }
    stats.frontlineReturns++;
    return baseOrder.apply(this,arguments);
  };

  const api=Object.freeze({
    version:'291.0', reserveSeconds:RESERVE_SECONDS,
    recovering,hasOfficer,nearestSupport,reservePosition,
    stats:()=>({...stats})
  });
  root.__AI_REGROUP_RESERVE_V291__=api;
  root.NRTS?.subsystems?.register?.('ai-regroup-reserve-v291',api,{
    phase:'gameplay-ai',legacyBridge:false,
    responsibility:'protect active rallies and reintroduce recovered British infantry behind a commanded fresh regiment'
  });
})(window);
