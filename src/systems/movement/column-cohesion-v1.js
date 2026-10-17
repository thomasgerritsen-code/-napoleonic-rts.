'use strict';
// Physical four-file cohesion for road/bridge marching. A regiment may not
// race its formation anchor past the actual rearmost living soldier.
(function installColumnCohesionV250(global){
  const nrts=global.NRTS;
  if(!nrts||typeof desiredGroupSpeedV064!=='function')return;
  const stats={pacedRoadFrames:0,pacedBridgeFrames:0,maxExtraLag:0,blockedEarlyReleases:0};
  const previousSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function desiredGroupSpeedColumnCohesionV250(reg,march,roadMarch){
    const base=previousSpeed(reg,march,roadMarch);
    if(!(base>0)||!reg||reg.destroyed||!march?.v064||
       groupKindV06(reg)!=='infantry'||reg.engagementV069 ||
       march.phase==='combat-halt')return base;
    const info=reg.crossingTrafficV068;
    const bridge=info?.forcedColumn && info.state!=='waiting' &&
      info.state!=='queued' && info.state!=='clearing';
    const road=!bridge && (roadMarch||march.locomotionV064==='road-march');
    // The v254 physical follower owns road-column convergence and moves
    // members toward their slots each frame. Reapplying the legacy p90 road
    // throttle here artificially brakes the whole battalion on departure.
    if(road && global.__MARCH_LAB_LIVE_V253__?.owns(reg))return base;
    if(!bridge&&!road)return base;
    const members=regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);
    const infantry=members.filter(u=>u.type==='infantry');
    if(!infantry.length)return base;
    if(bridge){
      const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
      if(!c)return base;
      const dir=-info.initialSide;
      const anchor=crossingLocalV068(c,march.anchorX,march.anchorY).along*dir;
      const tail=Math.min(...members.map(u=>crossingLocalV068(c,u.x,u.y).along*dir));
      const nominalTail=(Math.ceil(infantry.length/4)-1)*19+32;
      const extra=Math.max(0,anchor-tail-nominalTail);
      stats.maxExtraLag=Math.max(stats.maxExtraLag,extra);
      // Extra separation beyond the intended rank spacing means the rear
      // files are missing; slow the column's front, not individual soldiers.
      if(extra>70){stats.pacedBridgeFrames++;return Math.min(base,7);}
      if(extra>34){stats.pacedBridgeFrames++;return Math.min(base,19);}
      return base;
    }
    // Ordinary road marching also remains a cohesive unit: targets alone are
    // insufficient when a follower is physically stranded far behind.
    const errors=members.map(u=>Math.hypot(u.x-u.targetX,u.y-u.targetY)).sort((a,b)=>a-b);
    const p90=errors[Math.min(errors.length-1,Math.floor((errors.length-1)*.90))]||0;
    if(p90>90){stats.pacedRoadFrames++;return Math.min(base,9);}
    if(p90>47){stats.pacedRoadFrames++;return Math.min(base,23);}
    return base;
  };
  global.__COLUMN_COHESION_V250__=Object.freeze({
    version:'column-cohesion-v1',
    actualSoldierLag:true,
    keepsFourFiles:true,
    stats:()=>({...stats})
  });
  nrts.subsystems.register('column-cohesion',global.__COLUMN_COHESION_V250__,{
    phase:'v1.3.4',legacyBridge:false,
    responsibility:'pace infantry anchors to real lagging soldiers on roads and bridges'
  });
})(window);
