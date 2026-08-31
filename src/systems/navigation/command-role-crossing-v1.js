'use strict';
// ---------- v1.2.2: command-role crossing continuity ----------
// Officers and drummers are visually distinct formation members and must not be
// left behind while the rest of a battalion clears a bridge or ford.
(function installCommandRoleCrossingV1(global){
  const nrts=global.NRTS;
  if(!nrts||typeof forceBridgeColumnTargetsV068!=='function')return;
  const stats={roleCorrections:0,drummerCorrections:0,officerCorrections:0};

  function roleMember(reg,u){
    if(!reg||!u)return false;
    return u.id===reg.officerId||u.id===reg.drummerId||u.type==='officer'||u.type==='drummer';
  }
  function legal(u,p){
    return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
      !waterAtV067(p.x,p.y)&&!segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y);
  }
  function committedTarget(u,c,info){
    const direction=-info.initialSide;
    const local=crossingLocalArchitectureV2(c,u.x,u.y);
    const radius=Number(TYPES[u.type]?.radius)||7;
    const half=Math.max(7,c.width*.5-radius-8);
    const centered=Math.max(-half*.18,Math.min(half*.18,local.perp));
    const farExit=c.length*.5+58;
    const progress=local.along*direction;
    if(progress>farExit&&!waterAtV067(u.x,u.y))return null;
    for(const step of [34,24,16,9]){
      const nextProgress=Math.min(farExit,progress+step);
      const along=nextProgress*direction;
      for(const perp of [centered,0]){
        const p=crossingPointArchitectureV2(c,along,perp);
        if(legal(u,p)&&Math.hypot(p.x-u.x,p.y-u.y)>1.2)return p;
      }
    }
    return null;
  }

  const previousForce=forceBridgeColumnTargetsV068;
  forceBridgeColumnTargetsV068=function forceBridgeColumnTargetsCommandRolesV1(reg,march,info){
    previousForce(reg,march,info);
    if(!reg||reg.destroyed||!info?.forcedColumn)return;
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if(!c)return;
    const facing=crossingHeadingV068(c,info.initialSide);
    for(const u of regimentMembers(reg)){
      if(!u||u.dead||!roleMember(reg,u))continue;
      u.bridgeLastCrossingV1={crossingId:c.id,initialSide:info.initialSide,lastSeenAt:elapsed};
      const p=committedTarget(u,c,info);
      if(!p)continue;
      u.targetX=p.x;u.targetY=p.y;u.arrivedAtTarget=false;
      u.formationFacing=facing;u.facing=facing;
      u.commandRoleCrossingV1={crossingId:c.id,correctedAt:elapsed};
      stats.roleCorrections++;
      if(u.type==='drummer'||u.id===reg.drummerId)stats.drummerCorrections++;
      if(u.type==='officer'||u.id===reg.officerId)stats.officerCorrections++;
    }
  };

  const api=Object.freeze({version:'command-role-crossing-v1.0',stats:()=>({...stats})});
  global.__COMMAND_ROLE_CROSSING_V1__=api;
  nrts.subsystems.register('command-role-crossing',api,{phase:'v1.2.2',legacyBridge:false,responsibility:'keep drummer and officer committed to the active legal bridge/ford corridor until they clear the far exit'});
})(window);
