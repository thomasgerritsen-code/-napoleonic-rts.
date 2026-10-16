'use strict';
// ---------- Cossacks-inspired road marching: four files following the road curve ----------
// The road anchor owns navigation. Every rank follows the anchor's *actual*
// previous road positions, rather than rotating a rigid rectangle on corners.
(function installFourFileRoadTrailV133(global){
  const nrts=global.NRTS;
  if(!nrts||typeof setLocomotionTargetsV064!=='function'||typeof marchColumnOffsetsV063!=='function')return;
  const MAX_TRAIL=360;
  const SAMPLE_SPACING=3;
  const stats={roadFrames:0,curvedFrames:0,rankTargets:0,unsafeTargetsRejected:0,fieldReleases:0};
  function record(march){
    const point={x:march.anchorX,y:march.anchorY};
    let trail=march.roadTrailV133;
    if(!trail){trail={points:[point,{...point}],lastHeading:march.marchFacing};march.roadTrailV133=trail;return trail;}
    const points=trail.points;
    const latest=points[0],lastFixed=points[1];
    if(Math.hypot(lastFixed.x-point.x,lastFixed.y-point.y)>=SAMPLE_SPACING)
      points.splice(1,0,{...latest});
    points[0]=point;
    let total=0,keep=points.length;
    for(let i=1;i<points.length;i++){
      total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      if(total>MAX_TRAIL){keep=i+1;break;}
    }
    if(keep<points.length)points.length=keep;
    trail.lastHeading=march.marchFacing;
    return trail;
  }
  function positionAtRank(trail,march,backDistance){
    const pts=trail.points;
    const heading=march.marchFacing;
    if(backDistance<0){
      // Command roles at the front can look ahead by one small rank.
      return{x:march.anchorX-Math.cos(heading)*backDistance,
        y:march.anchorY-Math.sin(heading)*backDistance,heading};
    }
    let remaining=backDistance;
    for(let i=0;i+1<pts.length;i++){
      const a=pts[i],b=pts[i+1],dx=a.x-b.x,dy=a.y-b.y,length=Math.hypot(dx,dy);
      if(length<.001)continue;
      const tangent=Math.atan2(dy,dx);
      if(remaining<=length){
        const t=remaining/length;
        return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:tangent};
      }
      remaining-=length;
    }
    const last=pts[pts.length-1];
    // No recorded road trail yet: rear ranks still start in their normal
    // slots, then progressively join the centreline as the regiment moves.
    const previous=pts[pts.length-2];
    const tangent=previous?Math.atan2(previous.y-last.y,previous.x-last.x):heading;
    return{x:last.x-Math.cos(tangent)*remaining,
      y:last.y-Math.sin(tangent)*remaining,heading:tangent};
  }

  const previousSetLocomotion=setLocomotionTargetsV064;
  setLocomotionTargetsV064=function setLocomotionTargetsRoadTrailV133(reg,march,roadMarch){
    previousSetLocomotion(reg,march,roadMarch);
    if(!reg||reg.destroyed||!march?.v064||groupKindV06(reg)!=='infantry')return;
    const bridge=!!reg.crossingTrafficV068?.forcedColumn;
    if(!roadMarch||bridge){
      for(const u of regimentMembers(reg))u.roadTangentV133=null;
      if(!roadMarch && march.roadTrailV133){
        march.roadTrailV133=null;
        stats.fieldReleases++;
      }
      return;
    }
    const offsets=marchColumnOffsetsV063(reg);
    const trail=record(march);
    // Formation comes first: do not interfere with the initial acceleration
    // or pull soldiers backwards before the anchor has covered a full column.
    // Also return ownership to the tactical system when combat interrupts march.
    const trailLength=trail.points.slice(1).reduce((sum,p,i)=>{
      const before=trail.points[i];
      return sum+Math.hypot(p.x-before.x,p.y-before.y);
    },0);
    const inCombat=!!reg.engagementV069 || march.phase==='combat-halt' ||
      march.locomotionV064==='combat-formation';
    if(trailLength<165 || inCombat){
      for(const u of regimentMembers(reg))u.roadTangentV133=null;
      return;
    }
    const facing=march.marchFacing;
    if(trail.points.length>2&&Math.abs(Math.atan2(
      Math.sin(facing-Math.atan2(trail.points[0].y-trail.points[1].y,trail.points[0].x-trail.points[1].x)),
      Math.cos(facing-trail.points[trail.points.length-1].heading)))>.15)stats.curvedFrames++;
    for(const u of regimentMembers(reg)){
      if(u.dead||u.routing)continue;
      const offset=offsets.get(u.id);
      if(!offset)continue;
      const base=positionAtRank(trail,march,-offset.ox);
      const tx=base.x-Math.sin(base.heading)*offset.oy;
      const ty=base.y+Math.cos(base.heading)*offset.oy;
      if(!Number.isFinite(tx)||!Number.isFinite(ty)||waterAtV067(tx,ty)||
        segmentCrossesBlockedWaterV067(u.x,u.y,tx,ty)){
        u.roadTangentV133=null;
        stats.unsafeTargetsRejected++;
        continue;
      }
      u.targetX=tx;
      u.targetY=ty;
      u.formationFacing=base.heading;
      u.roadTangentV133=base.heading;
      u.arrivedAtTarget=false;
      stats.rankTargets++;
    }
    stats.roadFrames++;
  };
  global.__FOUR_FILE_ROAD_TRAIL_V133__=Object.freeze({
    version:'road-trail-v1',
    fourFileColumn:true,
    rankFollowing:true,
    retainsBridgeAuthority:true,
    stats:()=>({...stats})
  });
  nrts.subsystems.register('road-trail-marching',global.__FOUR_FILE_ROAD_TRAIL_V133__,{
    phase:'v1.3.3',legacyBridge:false,
    responsibility:'follow the travelled road centreline in four files with curved trailing ranks'
  });
})(window);
