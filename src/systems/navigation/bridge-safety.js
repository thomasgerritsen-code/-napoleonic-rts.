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
  // column. Crucially, slot geometry is aligned to the fixed bridge axis instead
  // of the anchor's temporary turning angle; otherwise a long column can swing its
  // rear files sideways through a bridge corner while the anchor turns in.
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
    const bridgeFacing=crossingHeadingV068(c,info.initialSide);
    applyFormationTargetsV063(reg,march.anchorX,march.anchorY,offsets,bridgeFacing,phase);
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
    if (lateral<=tolerance) return;

    // Only bias steering near the crossing. Farther away the normal route planner
    // remains authoritative. Once near the mouth, forward progress is combined
    // with a centreline correction instead of snapping the anchor sideways.
    const distanceToBridge=Math.hypot(march.anchorX-c.x,march.anchorY-c.y);
    if (distanceToBridge>corridor.approachDistance+120) return;

    const direction=-info.initialSide;
    const approachLocal=crossingLocalArchitectureV2(c,corridor.approach.x,corridor.approach.y);
    const exitLocal=crossingLocalArchitectureV2(c,corridor.exit.x,corridor.exit.y);
    const low=Math.min(approachLocal.along,exitLocal.along);
    const high=Math.max(approachLocal.along,exitLocal.along);
    const forward=Math.max(22,Math.min(42,lateral*.82));
    const targetAlong=Math.max(low,Math.min(high,local.along+direction*forward));
    const guide=crossingPointArchitectureV2(c,targetAlong,0);
    const guideDistance=Math.hypot(guide.x-march.anchorX,guide.y-march.anchorY);
    const desiredHeading=Math.atan2(guide.y-march.anchorY,guide.x-march.anchorX);
    march.marchFacing=turnTowardV064(march.marchFacing,desiredHeading,false,guideDistance);

    // A front rank may reserve the bridge before the battalion anchor is centred.
    // Keep the bridge reserved, but reduce forward momentum while lateral error is
    // still large so the column can finish aligning before reaching a deck corner.
    const cap=crossingSpeedCapV067(groupKindV06(reg),c);
    const factor=lateral>30?.46:lateral>20?.58:.72;
    const alignmentCap=Math.max(14,cap*factor);
    if (Number.isFinite(march.speedV064)) march.speedV064=Math.min(march.speedV064,alignmentCap);
  }

  function bridgeExitProgressSafetyV2(reg) {
    const march=reg?.marchV063;
    const info=reg?.crossingTrafficV068;
    if (!march?.v064 || !info?.forcedColumn || !info.entered || info.state!=='crossing') return;

    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if (!c || c.type!=='bridge') return;
    const corridor=window.NRTS_NAVIGATION_V2?.bridgeCorridor(c.id,info.initialSide);
    if (!corridor) return;

    const local=crossingLocalArchitectureV2(c,march.anchorX,march.anchorY);
    const direction=-info.initialSide;
    const progress=local.along*direction;
    // The legacy path solver advances an intermediate waypoint inside 38 px. The
    // bridge holder guide must make the same transition; otherwise the path solver
    // aims at clear while traffic guidance keeps turning back toward exit forever.
    if (progress<corridor.portalDistance-18) return;

    // Keep the anchor on the bridge axis until the *rear* file can clear the deck.
    // This distance is derived from the actual march-column depth, so cavalry and
    // infantry use the same rule without a hard-coded battalion size assumption.
    const desired=marchColumnOffsetsV063(reg);
    let rearExtent=0;
    for (const offset of desired.values()) rearExtent=Math.max(rearExtent,Math.max(0,-Number(offset.ox||0)));
    const touchEdge=c.length/2+16;
    const releaseProgress=Math.max(corridor.approachDistance,touchEdge+rearExtent+10);
    const guide=crossingPointArchitectureV2(c,direction*releaseProgress,0);
    const guideDistance=Math.hypot(guide.x-march.anchorX,guide.y-march.anchorY);
    const desiredHeading=Math.atan2(guide.y-march.anchorY,guide.x-march.anchorX);
    march.marchFacing=turnTowardV064(march.marchFacing,desiredHeading,false,guideDistance);
  }

  const updateGroupPathsBeforeBridgeSafetyV2=updateGroupPathsV06;
  updateGroupPathsV06=function updateGroupPathsBridgeSafetyV2() {
    // Apply the bias before the authoritative movement tick and again afterwards.
    // The first pass influences this step; the second preserves the corrected
    // heading/speed for the next fixed step after legacy waypoint turning runs.
    for (const reg of regiments) {
      bridgeAlignmentSafetyV2(reg);
      bridgeExitProgressSafetyV2(reg);
    }
    updateGroupPathsBeforeBridgeSafetyV2();
    for (const reg of regiments) {
      bridgeAlignmentSafetyV2(reg);
      bridgeExitProgressSafetyV2(reg);
    }

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
