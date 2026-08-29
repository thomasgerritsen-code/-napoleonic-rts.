'use strict';
// ---------- Architecture v2: bridge safety policies ----------
// Completes the corridor traversal for loose units after they technically reach
// the opposite bank, and guarantees useful forward speed after a corner recovery.

if (typeof NRTS_NAV_V2_ACTIVE !== 'undefined' && NRTS_NAV_V2_ACTIVE) {
  const looseCrossingTargetBeforeBridgeSafetyV2=looseCrossingTargetV067;
  looseCrossingTargetV067=function looseCrossingTargetBridgeSafetyV2(u,tx,ty) {
    const state=u.navigationBridgeV2;
    const currentSide=bankSideV067(u.x,u.y);
    const targetSide=bankSideV067(tx,ty);

    // Once the unit is on the destination bank, keep following the bridge axis
    // until the exit/clear portal is reached. This prevents a diagonal turn off
    // the deck clipping the downstream bridge corner and being rolled back.
    if (state && state.phase!=='done' && currentSide*targetSide>=0) {
      const c=WATER_CROSSINGS_V067.find(item=>item.id===state.crossingId);
      const corridor=c?.type==='bridge'?window.NRTS_NAVIGATION_V2?.bridgeCorridor(c.id,state.initialSide):null;
      if (c && corridor) {
        const tolerance=window.NRTS_CONFIG?.navigation?.bridge?.looseWaypointTolerance || 10;
        if (state.phase==='exit' && Math.hypot(u.x-corridor.exit.x,u.y-corridor.exit.y)<=tolerance) state.phase='clear';
        if (state.phase==='clear' && Math.hypot(u.x-corridor.clear.x,u.y-corridor.clear.y)<=tolerance) {
          state.phase='done';
          u.navigationBridgeV2=null;
          u.waterCrossingIdV067=null;
          return {x:tx,y:ty,detour:false};
        }
        const target=state.phase==='clear'?corridor.clear:corridor.exit;
        return {x:target.x,y:target.y,detour:true,crossing:c};
      }
    }

    return looseCrossingTargetBeforeBridgeSafetyV2(u,tx,ty);
  };

  const updateGroupPathsBeforeBridgeSafetyV2=updateGroupPathsV06;
  updateGroupPathsV06=function updateGroupPathsBridgeSafetyV2() {
    updateGroupPathsBeforeBridgeSafetyV2();
    for (const reg of regiments) {
      const march=reg?.marchV063;
      const info=reg?.crossingTrafficV068;
      const recoveredAt=reg?.navigationV2?.bridgeLastRecoveryAt;
      if (!march?.v064 || !info || !Number.isFinite(recoveredAt) || elapsed-recoveredAt>0.20) continue;
      const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
      if (!c || c.type!=='bridge') continue;
      const cap=crossingSpeedCapV067(groupKindV06(reg),c);
      march.speedV064=Math.min(cap,Math.max(12,Number(march.speedV064)||0));
    }
  };
}
