'use strict';
// ---------- v0.7.0 debug hooks: observable motion rather than status-only tests ----------
if (window.__RTS_DEBUG__) {
  const oldFormationState = window.__RTS_DEBUG__.formationState?.bind(window.__RTS_DEBUG__);
  if (oldFormationState) {
    window.__RTS_DEBUG__.formationState = function formationStateV070(id) {
      const base=oldFormationState(id);
      if (!base) return null;
      const reg=getRegiment(id)||regiments.find(r=>r.id===id);
      const members=reg?regimentMembers(reg).filter(u=>!u.dead&&!u.routing):[];
      let maxSlotError=0;
      for(const u of members) maxSlotError=Math.max(maxSlotError,Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y));
      return {
        ...base,
        kinematicV070:!!reg?.kinematicV070 || !!reg?.marchV063?.v064,
        maxSlotErrorV070:maxSlotError,
        engagementLockV070:reg?.engagementLockV070?{...reg.engagementLockV070}:null,
        engagement:reg?.engagementV069?{...reg.engagementV069}:null
      };
    };
  }
  window.__RTS_DEBUG__.motionSystemV070 = id => {
    const reg=getRegiment(id)||regiments.find(r=>r.id===id);
    if (!reg) return null;
    const members=regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
    const c=members.length?centroid(members):null;
    const anchor=groupAnchorV068(reg);
    let maxSlotError=0;
    for(const u of members) maxSlotError=Math.max(maxSlotError,Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y));
    return {
      version:'0.7.0',
      centroid:c?{x:c.x,y:c.y}:null,
      anchor:anchor?{x:anchor.x,y:anchor.y}:null,
      centroidAnchorError:c&&anchor?Math.hypot(c.x-anchor.x,c.y-anchor.y):null,
      maxSlotError,
      phase:reg.movementPhaseV063,
      locomotion:reg.marchV063?.locomotionV064||null,
      road:anchor?roadNetworkAtV066(anchor.x,anchor.y)?.road?.name||null:null,
      engagement:reg.engagementV069?{...reg.engagementV069}:null,
      members:members.map(u=>({id:u.id,type:u.type,x:u.x,y:u.y,targetX:u.targetX,targetY:u.targetY,facing:u.facing}))
    };
  };
  window.__RTS_DEBUG__.motionStatsV070 = () => ({...V070_STATS});
  window.__RTS_DEBUG__.villageSystemV070 = () => ({
    labelsVisible:false,
    junctionStyle:'flared-beaten-earth',
    villages:VILLAGE_SCENERY_V070.map(v=>({
      name:v.name,x:v.x,y:v.y,junctionRoadCount:v.junctionRoadCount,roads:[...v.roads],
      houses:v.houses.map(h=>({x:h.x,y:h.y,w:h.w,h:h.h,angle:h.angle,roadId:h.roadId,roadClearance:h.roadClearance}))
    }))
  });
}
