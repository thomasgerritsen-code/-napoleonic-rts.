'use strict';
// ---------- Architecture v2: bridge safety policies ----------
// Completes the corridor traversal for loose units after they technically reach
// the opposite bank, keeps battalion anchors aligned with the bridge centreline,
// and keeps the outside files of a forced bridge column clear of bridge corners.

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

  // A normal road march can use the full historical column width, but bridges are
  // bottlenecks. Narrow only the lateral component while forced into a bridge
  // column; longitudinal spacing and all non-bridge formation geometry stay intact.
  const forceBridgeColumnTargetsBeforeBridgeSafetyV2=forceBridgeColumnTargetsV068;
  forceBridgeColumnTargetsV068=function forceBridgeColumnTargetsBridgeSafetyV2(reg,march,info) {
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info?.crossingId);
    if (!c || c.type!=='bridge') return forceBridgeColumnTargetsBeforeBridgeSafetyV2(reg,march,info);

    const desired=marchColumnOffsetsV063(reg);
    const lateralScale=window.NRTS_CONFIG?.navigation?.bridge?.columnLateralScale || 0.72;
    for (const offset of desired.values()) offset.oy*=lateralScale;

    const offsets=blendFormationOffsetsV064(reg,march,desired,info.state==='waiting'?3.6:3.1);
    const phase=info.state==='waiting'?'bridge-waiting':
      info.state==='crossing'?'bridge-crossing':
      info.state==='clearing'?'bridge-clearing':'bridge-forming';
    applyFormationTargetsV063(reg,march.anchorX,march.anchorY,offsets,march.marchFacing,phase);
    reg.movementPhaseV063=phase;
    march.phase=phase;
    march.locomotionV064='bridge-column';
    for (const u of regimentMembers(reg)) u.marchingV064=true;
  };

  function bridgeAlignmentSafetyV2(reg) {
    const march=reg?.marchV063;
    const info=reg?.crossingTrafficV068;
    if (!march?.v064 || !info?.forcedColumn || ['waiting','clearing'].includes(info.state)) return;

    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if (!c || c.type!=='bridge') return;
    const corridor=window.NRTS_NAVIGATION_V2?.bridgeCorridor(c.id,info.initialSide);
    if (!corridor) return;

    const local=crossingLocalArchitectureV2(c,march.anchorX,march.anchorY);
    const lateral=Math.abs(local.perp);
    const tolerance=window.NRTS_CONFIG?.navigation?.bridge?.centerlineTolerance || 12;
    const direction=-info.initialSide;
    const approachLocal=crossingLocalArchitectureV2(c,corridor.approach.x,corridor.approach.y);
    const entryLocal=crossingLocalArchitectureV2(c,corridor.entry.x,corridor.entry.y);
    const exitLocal=crossingLocalArchitectureV2(c,corridor.exit.x,corridor.exit.y);

    // Before the bridge deck, allow the damped slot followers to finish forming
    // the narrow bridge column. This avoids a front/outside file entering the
    // longitudinal bridge band while it is still converging from a field line.
    let maxMemberLateral=0;
    for (const u of regimentMembers(reg)) {
      if (u.dead || u.routing) continue;
      const memberLocal=crossingLocalArchitectureV2(c,u.x,u.y);
      maxMemberLateral=Math.max(maxMemberLateral,Math.abs(memberLocal.perp));
    }
    const remainingToEntry=(entryLocal.along-local.along)*direction;
    const safeMemberLateral=Math.max(18,c.width/2-8);
    const formingBeforeDeck=remainingToEntry>0 && remainingToEntry<115 && maxMemberLateral>safeMemberLateral;

    if (lateral<=tolerance && !formingBeforeDeck) return;

    // Only bias steering near the crossing. Farther away the normal route planner
    // remains authoritative. Once near the mouth, forward progress is combined
    // with a centreline correction instead of snapping the anchor sideways.
    const distanceToBridge=Math.hypot(march.anchorX-c.x,march.anchorY-c.y);
    if (distanceToBridge>corridor.approachDistance+120) return;

    const low=Math.min(approachLocal.along,exitLocal.along);
    const high=Math.max(approachLocal.along,exitLocal.along);
    // While the outside files are still narrowing, make almost all movement a
    // lateral alignment movement and preserve a small forward creep. The creep
    // avoids a visible stop/stall but gives the followers time to converge.
    const forward=formingBeforeDeck?6:Math.max(22,Math.min(42,lateral*.82));
    const targetAlong=Math.max(low,Math.min(high,local.along+direction*forward));
    const guide=crossingPointArchitectureV2(c,targetAlong,0);
    const guideDistance=Math.hypot(guide.x-march.anchorX,guide.y-march.anchorY);
    const desiredHeading=Math.atan2(guide.y-march.anchorY,guide.x-march.anchorX);
    march.marchFacing=turnTowardV064(march.marchFacing,desiredHeading,false,guideDistance);

    // A front rank may reserve the bridge before the battalion anchor is centred.
    // Keep the bridge reserved, but reduce forward momentum while lateral error is
    // still large so the column can finish aligning before reaching a deck corner.
    const cap=crossingSpeedCapV067(groupKindV06(reg),c);
    const factor=formingBeforeDeck?.22:lateral>30?.46:lateral>20?.58:.72;
    const minimum=formingBeforeDeck?7:14;
    const alignmentCap=Math.max(minimum,cap*factor);
    if (Number.isFinite(march.speedV064)) march.speedV064=Math.min(march.speedV064,alignmentCap);
  }

  const updateGroupPathsBeforeBridgeSafetyV2=updateGroupPathsV06;
  updateGroupPathsV06=function updateGroupPathsBridgeSafetyV2() {
    // Apply the bias before the authoritative movement tick and again afterwards.
    // The first pass influences this step; the second preserves the corrected
    // heading/speed for the next fixed step after legacy waypoint turning runs.
    for (const reg of regiments) bridgeAlignmentSafetyV2(reg);
    updateGroupPathsBeforeBridgeSafetyV2();
    for (const reg of regiments) bridgeAlignmentSafetyV2(reg);

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
