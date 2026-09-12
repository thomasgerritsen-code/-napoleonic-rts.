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

  const previousForceBridgeColumn=forceBridgeColumnTargetsV068;
  forceBridgeColumnTargetsV068=function forceBridgeColumnTargetsCompactV132(reg,march,info){
    previousForceBridgeColumn(reg,march,info);
    if(!reg||reg.destroyed||!march?.v064||!info?.forcedColumn)return;
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if(!c)return;

    const desired=compactOffsets(reg,c);
    const rate=info.state==='waiting'?4.4:3.8;
    const offsets=blendFormationOffsetsV064(reg,march,desired,rate);
    const facing=crossingHeadingV068(c,info.initialSide);
    const phase=info.state==='waiting'?'bridge-waiting':info.state==='clearing'?'bridge-clearing':info.state==='crossing'?'bridge-crossing':'bridge-forming';
    applyFormationTargetsV063(reg,march.anchorX,march.anchorY,offsets,facing,phase);
    reg.movementPhaseV063=phase;
    march.phase=phase;
    march.locomotionV064='bridge-column';
    for(const u of regimentMembers(reg))u.marchingV064=true;
    stats.applications++;
  };

  const api=Object.freeze({version:'bridge-formation-flow-v1',compactColumn:true,stats:()=>({...stats})});
  global.__BRIDGE_FORMATION_FLOW_V1__=api;
  nrts.subsystems.register('bridge-formation-flow',api,{phase:'v1.3.2',legacyBridge:false,responsibility:'compress bridge and ford traffic into a stable one/two-file column before per-member water-safety correction'});
})(window);
