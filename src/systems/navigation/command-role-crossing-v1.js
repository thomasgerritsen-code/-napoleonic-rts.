'use strict';
// ---------- v1.2.2: command-role crossing continuity ----------
// Officers and drummers are visually distinct formation members and must not be
// left behind while the rest of a battalion clears a bridge or ford. Queue
// ownership remains authoritative: command roles never advance ahead of a
// waiting battalion onto a single-lane crossing.
(function installCommandRoleCrossingV1(global){
  const nrts=global.NRTS;
  if(!nrts||typeof forceBridgeColumnTargetsV068!=='function')return;
  const stats={roleCorrections:0,drummerCorrections:0,officerCorrections:0,queueHolds:0};

  function roleMember(reg,u){
    if(!reg||!u)return false;
    return u.id===reg.officerId||u.id===reg.drummerId||u.type==='officer'||u.type==='drummer';
  }
  function legal(u,p){
    return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
      !waterAtV067(p.x,p.y)&&!segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y);
  }
  function committedTarget(u,c,info,march){
    const direction=-info.initialSide;
    const local=crossingLocalArchitectureV2(c,u.x,u.y);
    const anchor=crossingLocalArchitectureV2(c,march.anchorX,march.anchorY);
    const progress=local.along*direction;
    const anchorProgress=anchor.along*direction;
    const radius=Number(TYPES[u.type]?.radius)||7;
    const half=Math.max(7,c.width*.5-radius-8);
    const centered=Math.max(-half*.18,Math.min(half*.18,local.perp));
    const farExit=c.length*.5+58;
    if(progress>farExit&&!waterAtV067(u.x,u.y))return null;

    // Officers and drummers already have an assigned slot in the four-file
    // column. The old helper advanced them by 34 px on EVERY frame, independent
    // of the regiment anchor, so a scout could be 500 px ahead of the soldiers.
    // Let the regular slot follower own all legal moves. Intervene only for
    // an unsafe target, a member stuck well behind, or an off-lane position.
    const natural={x:u.targetX,y:u.targetY};
    const unsafeTarget=!legal(u,natural);
    const nearDeck=progress>=-c.length/2-32&&progress<=farExit;
    const offLane=nearDeck&&Math.abs(local.perp)>half;
    const straggler=anchorProgress>-c.length/2-65&&progress<anchorProgress-55;
    if(!unsafeTarget&&!offLane&&!straggler)return null;
    // No role can start advancing across the bridge before its battalion has
    // approached the near portal. Nor can it be directed more than one small
    // rank ahead of the anchor, even during a corrective recovery.
    if(anchorProgress<-c.length/2-65)return null;
    const allowedFront=Math.min(farExit,anchorProgress+42);
    for(const step of [34,24,16,9]){
      const nextProgress=Math.min(allowedFront,progress+step);
      if(nextProgress<=progress+1.2)continue;
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

    // The bridge/ford queue owns admission. A waiting battalion must keep every
    // member, including drummer/officer, behind the hold point. The normal
    // bridge-column targets produced above already do that correctly.
    if(info.state==='waiting'||info.state==='queued'){
      stats.queueHolds++;
      return;
    }

    const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
    if(!c)return;
    const facing=crossingHeadingV068(c,info.initialSide);
    for(const u of regimentMembers(reg)){
      if(!u||u.dead||!roleMember(reg,u))continue;
      u.bridgeLastCrossingV1={crossingId:c.id,initialSide:info.initialSide,lastSeenAt:elapsed};
      const p=committedTarget(u,c,info,march);
      if(!p)continue;
      u.targetX=p.x;u.targetY=p.y;u.arrivedAtTarget=false;
      u.formationFacing=facing;u.facing=facing;
      u.commandRoleCrossingV1={crossingId:c.id,state:info.state,correctedAt:elapsed};
      stats.roleCorrections++;
      if(u.type==='drummer'||u.id===reg.drummerId)stats.drummerCorrections++;
      if(u.type==='officer'||u.id===reg.officerId)stats.officerCorrections++;
    }
  };

  const api=Object.freeze({version:'command-role-crossing-v1.2',stats:()=>({...stats})});
  global.__COMMAND_ROLE_CROSSING_V1__=api;
  nrts.subsystems.register('command-role-crossing',api,{phase:'v1.2.2',legacyBridge:false,responsibility:'keep drummer and officer committed to the active legal bridge/ford corridor after queue admission, without violating crossing capacity'});
})(window);
