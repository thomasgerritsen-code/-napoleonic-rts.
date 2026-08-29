'use strict';
// ---------- v0.7.1 debug hooks ----------
if (typeof V071_ACTIVE !== 'undefined' && V071_ACTIVE && window.__RTS_DEBUG__) {
  window.__RTS_DEBUG__.motionStatsV071 = () => ({
    ...V071_STATS,
    fixedStepHz:60,
    renderInterpolation:true,
    renderAlpha:V071_RENDER_ALPHA
  });
  window.__RTS_DEBUG__.motionSystemV071 = id => {
    const reg=getRegiment(id)||regiments.find(r=>r.id===id);
    if (!reg) return null;
    const members=regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
    const c=members.length?centroid(members):null;
    const anchor=groupAnchorV068(reg);
    let maxSlotError=0;
    let meanSlotError=0;
    let meanFollowerSpeed=0;
    let followerCount=0;
    for(const u of members){
      const error=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
      maxSlotError=Math.max(maxSlotError,error);
      meanSlotError+=error;
      if(u.slotFollowerV071){
        meanFollowerSpeed+=Math.hypot(u.slotFollowerV071.vx,u.slotFollowerV071.vy);
        followerCount++;
      }
    }
    return {
      version:'0.7.1',
      solver:V071_STATS.solver,
      centroid:c?{x:c.x,y:c.y}:null,
      anchor:anchor?{x:anchor.x,y:anchor.y}:null,
      centroidAnchorError:c&&anchor?Math.hypot(c.x-anchor.x,c.y-anchor.y):null,
      maxSlotError,
      meanSlotError:members.length?meanSlotError/members.length:0,
      meanFollowerSpeed:followerCount?meanFollowerSpeed/followerCount:0,
      phase:reg.movementPhaseV063,
      locomotion:reg.marchV063?.locomotionV064||null,
      road:anchor?roadNetworkAtV066(anchor.x,anchor.y)?.road?.name||null:null,
      engagement:reg.engagementV069?{...reg.engagementV069}:null,
      members:members.map(u=>({
        id:u.id,type:u.type,x:u.x,y:u.y,targetX:u.targetX,targetY:u.targetY,facing:u.facing,
        vx:u.slotFollowerV071?.vx||0,vy:u.slotFollowerV071?.vy||0
      }))
    };
  };
}
