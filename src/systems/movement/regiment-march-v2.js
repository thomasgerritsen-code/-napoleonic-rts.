'use strict';
// Unified regiment road/bridge column controller, v2.
//
// Existing navigation decides WHICH waypoints the group should visit; bridge
// traffic owns WHICH regiment has permission to enter. Neither should decide
// the physical slot of each infantryman. This module is installed after those
// systems and writes ONE final four-file target per living regiment member.
// No teleportation, independent soldier paths, or per-frame rigid rectangle
// rotating at every road corner.
(function installRegimentMarchV251(global){
  const nrts=global.NRTS;
  if(!nrts || typeof updateGroupPathsV06!=='function' || typeof desiredGroupSpeedV064!=='function')return;
  const stateByReg=new WeakMap();
  const TRACK_LIMIT=590;
  const ROAD_RANK_GAP=20;
  const ROAD_FILE_GAP=18;
  const stats={activeFrames:0,roadFrames:0,bridgeFrames:0,formationFrames:0,
    assignedSlots:0,unsafeSlots:0,physicalSlotSamples:0,physicalErrorTotal:0,
    maxPhysicalError:0,paceFrames:0,phaseTransitions:0};

  const live=reg=>regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
  function alongDirection(a,b){return Math.atan2(a.y-b.y,a.x-b.x);}
  function facingOf(march){return Number.isFinite(march.marchFacing)?march.marchFacing:0;}
  function roadAnchor(march){
    return (typeof roadAtV064==='function'&&roadAtV064(march.anchorX,march.anchorY))||
      (typeof roadNetworkAtV066==='function'&&!!roadNetworkAtV066(march.anchorX,march.anchorY))||
      march.locomotionV064==='road-march';
  }
  function record(state,march){
    const p={x:march.anchorX,y:march.anchorY};
    const points=state.points;
    if(!points.length){points.push(p,{...p});return;}
    const old=points[0];
    if(distance(old,p)>125){points.length=0;points.push(p,{...p});return;}
    if(distance(points[1],p)>=2.2)points.splice(1,0,{...old});
    points[0]=p;
    let length=0;
    for(let i=1;i<points.length;i++){
      length+=distance(points[i-1],points[i]);
      if(length>TRACK_LIMIT){points.length=i+1;break;}
    }
  }
  function trailPoint(state,march,back){
    const pts=state.points;
    const defaultHeading=facingOf(march);
    if(back<0)return{x:march.anchorX+Math.cos(defaultHeading)*-back,
      y:march.anchorY+Math.sin(defaultHeading)*-back,heading:defaultHeading};
    let rest=back;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],seg=distance(a,b);
      if(seg<.0001)continue;
      const heading=alongDirection(a,b);
      if(rest<=seg){let t=rest/seg;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading};}
      rest-=seg;
    }
    const last=pts[pts.length-1]||{x:march.anchorX,y:march.anchorY};
    const next=pts.length>1?pts[pts.length-2]:null;
    const heading=next&&distance(next,last)>1?alongDirection(next,last):defaultHeading;
    return{x:last.x-Math.cos(heading)*rest,y:last.y-Math.sin(heading)*rest,heading};
  }
  function activeBridge(reg,march,state,members){
    const info=reg.crossingTrafficV068;
    if(info?.forcedColumn){
      const c=WATER_CROSSINGS_V067.find(c=>c.id===info.crossingId);
      if(c){state.bridgeId=c.id;state.bridgeSide=info.initialSide;return c;}
    }
    // Logical bridge reservations may be released for deadlock avoidance
    // while actual rear files still occupy the crossing. Retain one physical
    // column until all living members are beyond its far exit.
    if(!state.bridgeId)return null;
    const c=WATER_CROSSINGS_V067.find(c=>c.id===state.bridgeId);
    if(!c){state.bridgeId=null;return null;}
    const direction=-state.bridgeSide;
    const allPast=members.every(u=>{
      const q=crossingLocalV068(c,u.x,u.y);
      return q.along*direction>c.length/2+35&&!waterAtV067(u.x,u.y);
    });
    if(allPast){state.bridgeId=null;return null;}
    return c;
  }
  function isSafe(u,p,bridge){
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||waterAtV067(p.x,p.y))return false;
    // Existing individual water safety handles the exceptional case of a
    // soldier needing to enter the bridge from an awkward off-lane location.
    // Keep its recovery target rather than generating a shortcut over water.
    if(segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y))return false;
    if(bridge){
      const q=crossingLocalV068(bridge,p.x,p.y);
      if(Math.abs(q.along)<=bridge.length/2+6 &&
         Math.abs(q.perp)>bridge.width/2-12)return false;
    }
    return true;
  }
  function columnSlots(reg,march,state,members,bridge){
    const fileGap=bridge?15:ROAD_FILE_GAP;
    const rankGap=bridge?19:ROAD_RANK_GAP;
    const infantry=members.filter(u=>u.type==='infantry');
    const fileCount=Math.min(4,Math.max(1,infantry.length));
    const offsets=new Map();
    infantry.forEach((u,i)=>offsets.set(u.id,{back:Math.floor(i/fileCount)*rankGap,
      side:(i%fileCount-(fileCount-1)/2)*fileGap}));
    // Command staff is part of the same march, not a separate leading unit.
    const officer=members.find(u=>u.id===reg.officerId);
    const drummer=members.find(u=>u.id===reg.drummerId);
    if(officer)offsets.set(officer.id,{back:-18,side:fileGap*.5});
    if(drummer)offsets.set(drummer.id,{back:-18,side:-fileGap*.5});
    for(const u of members)if(!offsets.has(u.id))
      offsets.set(u.id,{back:(Math.ceil(infantry.length/fileCount)-1)*rankGap,side:0});
    state.laneOffsets=offsets;
    const info=reg.crossingTrafficV068;
    const direction=bridge?-(info?.initialSide??state.bridgeSide):0;
    const local=bridge?crossingLocalV068(bridge,march.anchorX,march.anchorY):null;
    for(const u of members){
      const slot=offsets.get(u.id);
      let p;
      if(bridge && Number.isFinite(direction) && direction){
        const along=local.along-direction*slot.back;
        // Keep all bridge ranks on the same centreline, even after the bridge
        // reservation ends. Never rotate the whole rectangle mid-crossing.
        p=crossingPointV068(bridge,along,slot.side);
      }else{
        const center=trailPoint(state,march,slot.back);
        p={x:center.x-Math.sin(center.heading)*slot.side,
           y:center.y+Math.cos(center.heading)*slot.side};
      }
      if(!isSafe(u,p,bridge)){stats.unsafeSlots++;continue;}
      u.targetX=p.x;u.targetY=p.y;
      u.formationFacing=bridge?crossingHeadingV068(bridge,state.bridgeSide):trailPoint(state,march,slot.back).heading;
      u.arrivedAtTarget=false;
      u.marchingV064=true;
      stats.assignedSlots++;
      const error=distance(u,p);
      stats.maxPhysicalError=Math.max(stats.maxPhysicalError,error);
      stats.physicalSlotSamples++;stats.physicalErrorTotal+=error;
    }
    reg.movementPhaseV063=bridge?'bridge-crossing':'road-marching';
    if(!bridge)march.locomotionV064='road-march';
  }
  function updateRegiment(reg){
    if(!reg||reg.destroyed||groupKindV06(reg)!=='infantry')return;
    const march=reg.marchV063;
    if(!march?.v064||!reg.path)return;
    const members=live(reg);
    if(!members.length)return;
    let state=stateByReg.get(reg);
    if(!state){state={phase:'forming',startedAt:elapsed,points:[],lastRoadAt:-Infinity,
      bridgeId:null,bridgeSide:null,laneOffsets:new Map()};stateByReg.set(reg,state);}
    const bridge=activeBridge(reg,march,state,members);
    const onRoad=roadAnchor(march);
    if(onRoad)state.lastRoadAt=elapsed;
    const nearRoad=onRoad || (elapsed-state.lastRoadAt<1.25);
    if(!nearRoad&&!bridge){
      if(state.phase!=='field'){state.phase='field';stats.phaseTransitions++;}
      state.points.length=0;
      return;
    }
    if(state.phase==='field'){state.phase='forming';state.startedAt=elapsed;state.points.length=0;stats.phaseTransitions++;}
    if(march.phase==='combat-halt'||reg.engagementV069)return;
    record(state,march);
    columnSlots(reg,march,state,members,bridge);
    const errors=members.map(u=>distance(u,{x:u.targetX,y:u.targetY})).sort((a,b)=>a-b);
    const p80=errors[Math.floor((errors.length-1)*.8)]||0;
    state.slotP80=p80;
    state.lastUpdatedAt=elapsed;
    if(state.phase==='forming'&&(p80<23 || elapsed-state.startedAt>6)){
      state.phase='marching';stats.phaseTransitions++;
    }
    stats.activeFrames++;
    if(bridge)stats.bridgeFrames++;else stats.roadFrames++;
    if(state.phase==='forming')stats.formationFrames++;
  }
  // Authority order: navigation/traffic first, then one authoritative physical
  // target set for the whole four-file regiment. Older wrappers still provide
  // safe path choice and water-recovery when a soldier cannot enter a lane.
  const previousUpdate=updateGroupPathsV06;
  updateGroupPathsV06=function updateRegimentMarchV251(){
    previousUpdate();
    for(const reg of regiments)updateRegiment(reg);
  };
  // Pace the shared battalion anchor, never sprint an individual ahead.
  const previousSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function speedRegimentMarchV251(reg,march,road){
    const base=previousSpeed(reg,march,road);
    if(!(base>0)||!reg||!march)return base;
    const state=stateByReg.get(reg);
    if(!state||state.phase==='field'||!Number.isFinite(state.slotP80) ||
       elapsed-state.lastUpdatedAt>0.35)return base;
    // Never punish normal march acceleration with an assembly speed cap:
    // old 8-unit limits made an otherwise valid 46-60 unit road/field move
    // look frozen for the first second. The follower solver handles joining
    // the ranks while advancing. Only a genuinely stranded bridge tail can
    // slow the *shared* anchor, not ordinary turning or line-to-column change.
    const bridge=!!state.bridgeId;
    const lag=state.slotP80;
    const cap=bridge && lag>115?Math.min(base,17)
      :bridge && lag>78?Math.min(base,30):base;
    if(cap<base)stats.paceFrames++;
    return cap;
  };
  global.__REGIMENT_MARCH_V251__=Object.freeze({
    version:'regiment-column-v2.0',oneSlotAuthority:true,
    fourFileColumn:true,sharedRoadBridgeTrack:true,
    state:reg=>{const s=stateByReg.get(reg);return s?{
      phase:s.phase,bridgeId:s.bridgeId,slotP80:s.slotP80,
      trackLength:s.points.length,files:4
    }:null;},
    stats:()=>({...stats,meanPhysicalSlotError:stats.physicalSlotSamples?
      stats.physicalErrorTotal/stats.physicalSlotSamples:0})
  });
  nrts.subsystems.register('regiment-march-v2',global.__REGIMENT_MARCH_V251__,{
    phase:'road-bridge-unified',legacyBridge:false,
    responsibility:'single authoritative physical four-file formation throughout road and bridge marches'
  });
})(window);
