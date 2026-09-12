'use strict';
// ---------- v1.3.2: narrow bridge/ford formations before follower water-safety ----------
(function installBridgeFormationFlowV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS runtime must load before bridge formation flow.');
  if(typeof forceBridgeColumnTargetsV068!=='function')throw new Error('Bridge traffic must load before bridge formation flow.');

  const stats={applications:0,singleFile:0,twoFile:0};

  function compactOffsets(reg,c){
    const members=regimentMembers(reg).filter(u=>u&&!u.dead);
    const kind=groupKindV06(reg);
    const result=new Map();
    if(!members.length||kind==='artillery')return result;

    const radius=kind==='cavalry'?9:7;
    const usable=Math.max(14,c.width-2*(radius+9));
    const desiredFiles=kind==='cavalry'?1:(usable>=31?2:1);
    const lateralGap=desiredFiles===1?0:Math.min(18,usable*.55);
    const forwardGap=kind==='cavalry'?30:19;

    const lineMembers=members.filter(u=>u.type===(kind==='cavalry'?'cavalry':'infantry'));
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

    if(desiredFiles===1)stats.singleFile++;else stats.twoFile++;
    return result;
  }

  function compressionBlend(c,march,info){
    if(info?.entered||['crossing','clearing'].includes(info?.state))return 1;
    const local=crossingLocalV068(c,march.anchorX,march.anchorY);
    const clearance=local.along*info.initialSide-c.length/2;
    const config=global.NRTS_CONFIG?.navigation?.bridge||{};
    const start=Math.max(1,Number(config.columnFormStartClearance)||90);
    const full=Math.max(0,Math.min(start-1,Number(config.columnFormFullClearance)||24));
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
    previousForceBridgeColumn(reg,march,info);
    if(!reg||reg.destroyed||!march?.v064||!info?.forcedColumn)return;
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if(!c)return;

    // Reservation/steering can start far from a bridge. Do not collapse a field line
    // at that point. Keep the existing field/road formation until the configured
    // bridge-mouth transition begins, then blend smoothly into the compact files.
    const blend=compressionBlend(c,march,info);
    if(blend<=.001)return;
    const normal=normalOffsets(reg,march);
    const compact=compactOffsets(reg,c);
    const desired=new Map();
    const ids=new Set([...normal.keys(),...compact.keys()]);
    for(const id of ids){
      const a=normal.get(id)||compact.get(id)||{ox:0,oy:0};
      const b=compact.get(id)||a;
      desired.set(id,{ox:a.ox+(b.ox-a.ox)*blend,oy:a.oy+(b.oy-a.oy)*blend});
    }

    const rate=info.state==='waiting'?4.4:3.8;
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

  const api=Object.freeze({version:'bridge-formation-flow-v1',compactColumn:true,progressiveCompression:true,stats:()=>({...stats})});
  global.__BRIDGE_FORMATION_FLOW_V1__=api;
  nrts.subsystems.register('bridge-formation-flow',api,{phase:'v1.3.2',legacyBridge:false,responsibility:'progressively compress bridge and ford traffic into a stable one/two-file column near the crossing before per-member water-safety correction'});
})(window);
