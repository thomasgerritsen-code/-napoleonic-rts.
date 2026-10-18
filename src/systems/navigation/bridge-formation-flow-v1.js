'use strict';
// ---------- v1.3.3: four-file compact bridge formations before follower water-safety ----------
(function installBridgeFormationFlowV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS runtime must load before bridge formation flow.');
  if(typeof forceBridgeColumnTargetsV068!=='function')throw new Error('Bridge traffic must load before bridge formation flow.');

  const stats={applications:0,singleFile:0,twoFile:0,fourFile:0};

  function compactOffsets(reg,c){
    const members=regimentMembers(reg).filter(u=>u&&!u.dead);
    const kind=groupKindV06(reg);
    const result=new Map();
    if(!members.length||kind==='artillery')return result;

    const radius=kind==='cavalry'?9:7;
    const edgeClearance=radius+9;
    const usableCenterSpan=Math.max(0,c.width-2*edgeClearance);
    const lineMembers=members.filter(u=>u.type===(kind==='cavalry'?'cavalry':'infantry'));
    // Infantry remains four files across every current bridge. The lateral gap is
    // slightly tighter than the 18-unit road column, but never below one diameter.
    // This derives the legal spacing from the deck width and soldier radius instead
    // of silently dropping to the legacy one/two-file bridge column.
    const desiredFiles=kind==='cavalry'
      ?Math.min(2,Math.max(1,lineMembers.length))
      :Math.min(4,Math.max(1,lineMembers.length));
    const minimumGap=radius*2;
    const preferredGap=kind==='cavalry'?24:15;
    const maximumGap=desiredFiles>1?usableCenterSpan/(desiredFiles-1):0;
    const lateralGap=desiredFiles===1?0:Math.max(minimumGap,Math.min(preferredGap,maximumGap));
    const forwardGap=kind==='cavalry'?30:19;

    lineMembers.forEach((u,i)=>{
      const rank=Math.floor(i/desiredFiles);
      const file=i%desiredFiles;
      result.set(u.id,{ox:-rank*forwardGap,oy:(file-(desiredFiles-1)/2)*lateralGap});
    });

    const officer=members.find(u=>u.id===reg.officerId);
    const drummer=members.find(u=>u.id===reg.drummerId);
    if(officer)result.set(officer.id,{ox:forwardGap*.8,oy:desiredFiles===1?0:lateralGap*.5});
    if(drummer)result.set(drummer.id,{ox:forwardGap*.8,oy:desiredFiles===1?0:-lateralGap*.5});
    for(const u of members)if(!result.has(u.id))result.set(u.id,{ox:-forwardGap,oy:0});

    if(desiredFiles===1)stats.singleFile++;
    else if(desiredFiles===2)stats.twoFile++;
    else if(desiredFiles===4)stats.fourFile++;
    return result;
  }

  function compressionBlend(c,march,info){
    const local=crossingLocalV068(c,march.anchorX,march.anchorY);
    const clearance=local.along*info.initialSide-c.length/2;
    const config=global.NRTS_CONFIG?.navigation?.bridge||{};
    // Keep full-width road files until the final ~110 world units before
    // the bridge portal. A ~100-unit smooth transition is ample for the
    // 4.5-unit outer-file adjustment without compressing hundreds of units
    // too early. Use exactly the same thresholds as the physical v261 owner.
    const start=Math.max(70,Number(config.columnFormStartClearance)||110);
    const full=Math.max(0,Math.min(start-10,Number(config.columnFormFullClearance)??12));
    if(info?.state==='clearing')return 1;
    if(clearance>=start)return 0;
    if(clearance<=full)return 1;
    const t=(start-clearance)/Math.max(1,start-full);
    return t*t*(3-2*t);
  }

  function normalOffsets(reg,march){
    const roadMarch=typeof roadAtV064==='function'
      ? roadAtV064(march.anchorX,march.anchorY)
      : Boolean(typeof roadNetworkAtV066==='function'&&roadNetworkAtV066(march.anchorX,march.anchorY));
    return roadMarch?marchColumnOffsetsV063(reg):finalFormationOffsetsV063(reg,reg.formation);
  }

  const previousForceBridgeColumn=forceBridgeColumnTargetsV068;
  forceBridgeColumnTargetsV068=function forceBridgeColumnTargetsCompactV132(reg,march,info){
    if(!reg||reg.destroyed||!march?.v064||!info?.forcedColumn)
      return previousForceBridgeColumn(reg,march,info);
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if(!c)return previousForceBridgeColumn(reg,march,info);

    // Single owner for bridge slot targets. Calling the older 3/4-file target
    // writer first, then the two-file writer second, blends two conflicting
    // columns in the same frame and keeps soldiers between their actual slots.
    // Apply only this combined field→bridge interpolation once per update.
    const blend=compressionBlend(c,march,info);
    const normal=normalOffsets(reg,march);
    const compact=compactOffsets(reg,c);
    const desired=new Map();
    const ids=new Set([...normal.keys(),...compact.keys()]);
    for(const id of ids){
      const a=normal.get(id)||compact.get(id)||{ox:0,oy:0};
      const b=compact.get(id)||a;
      desired.set(id,{ox:a.ox+(b.ox-a.ox)*blend,oy:a.oy+(b.oy-a.oy)*blend});
    }

    // When a player issues a new order right in front of a bridge, start with
    // four *assigned* files immediately, but let soldiers walk into their slots
    // physically. Never teleport their actual positions.
    const local=crossingLocalV068(c,march.anchorX,march.anchorY);
    const clearance=local.along*info.initialSide-c.length/2;
    if(groupKindV06(reg)==='infantry' && info.state==='approach' && !info.entered
      && blend>=.999 && clearance>52 && march.bridgeStageCrossingV249!==c.id){
      march.slotOffsetsV064=new Map(desired);
      march.bridgeStageCrossingV249=c.id;
      march.bridgeStageStartedAtV249=elapsed;
    }
    const rate=info.state==='waiting'?6.2:5.7;
    const offsets=blendFormationOffsetsV064(reg,march,desired,rate);
    const bridgeFacing=crossingHeadingV068(c,info.initialSide);
    const facingDelta=normalizeAngleV063(bridgeFacing-march.marchFacing);
    const facing=normalizeAngleV063(march.marchFacing+facingDelta*blend);
    const phase=info.state==='waiting'?'bridge-waiting':info.state==='clearing'?'bridge-clearing':info.state==='crossing'?'bridge-crossing':'bridge-forming';
    applyFormationTargetsV063(reg,march.anchorX,march.anchorY,offsets,facing,phase);
    reg.movementPhaseV063=phase;
    march.phase=phase;
    march.locomotionV064='bridge-column';
    for(const u of regimentMembers(reg))u.marchingV064=true;
    stats.applications++;
  };

  const previousDesiredSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function desiredGroupSpeedBridgeStagingV249(reg,march,roadMarch){
    const speed=previousDesiredSpeed(reg,march,roadMarch);
    const info=reg?.crossingTrafficV068;
    if(groupKindV06(reg)!=='infantry' || !march?.v064 || !info ||
       info.state!=='approach' || info.entered || !Number.isFinite(march.bridgeStageStartedAtV249) ||
       march.bridgeStageCrossingV249!==info.crossingId) return speed;
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if(!c)return speed;
    const local=crossingLocalV068(c,march.anchorX,march.anchorY);
    const clearance=local.along*info.initialSide-c.length/2;
    if(clearance<=12 || clearance>110 || elapsed-march.bridgeStageStartedAtV249>1.35)return speed;
    const members=regimentMembers(reg).filter(u=>!u.dead && u.type==='infantry');
    if(!members.length)return speed;
    const outOfFile=members.filter(u=>Math.hypot(u.x-u.targetX,u.y-u.targetY)>18).length;
    // Slow the lead rank until all four files are visually assembled.
    // The timer bounds the wait so an obstructed soldier cannot jam the lane.
    return outOfFile>members.length*.2?Math.min(speed,5):speed;
  };

  const api=Object.freeze({version:'bridge-formation-flow-v1.3',compactColumn:true,fourFileBridge:true,widthAwareSpacing:true,progressiveCompression:true,singleSlotWriter:true,earlyColumnStaging:true,stats:()=>({...stats})});
  global.__BRIDGE_FORMATION_FLOW_V1__=api;
  nrts.subsystems.register('bridge-formation-flow',api,{phase:'v1.3.3',legacyBridge:false,responsibility:'retain four infantry files with width-aware compact spacing across bridges before per-member water-safety correction'});
})(window);
