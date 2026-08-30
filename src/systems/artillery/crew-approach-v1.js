'use strict';
// ---------- Architecture v2.1: artillery crew approach ----------
(function installArtilleryCrewApproachV1(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before artillery crew approach.');
  if(typeof createArtilleryBatteryV06!=='function'||typeof syncBatteryCrewV061!=='function')throw new Error('Artillery legacy/compound systems must load first.');

  const cfg=global.NRTS_CONFIG?.artillery?.crewApproach || {};
  const speedFactor=cfg.speedFactor ?? .90;
  const arrivalDistance=cfg.arrivalDistance ?? 8;
  const stagingBack=cfg.stagingBack ?? 19;
  const stagingLateral=cfg.stagingLateral ?? 18;

  function stagingPoint(cannon,index){
    const facing=Number.isFinite(cannon.facing)?cannon.facing:0;
    const ox=-stagingBack,oy=index===0?-stagingLateral:stagingLateral;
    const cos=Math.cos(facing),sin=Math.sin(facing);
    return{x:cannon.x+ox*cos-oy*sin,y:cannon.y+ox*sin+oy*cos};
  }

  const previousCanOperate=canArtilleryOperateV06;
  canArtilleryOperateV06=function canArtilleryOperateCrewApproachV1(cannon){
    if(!previousCanOperate(cannon))return false;
    const reg=cannon?.regimentId?getRegiment(cannon.regimentId):null;
    return !reg?.crewApproachV1?.active;
  };

  const previousCreateBattery=createArtilleryBatteryV06;
  createArtilleryBatteryV06=function createArtilleryBatteryCrewApproachV1(side,cannon,crewCandidates,name=null){
    const eligible=(crewCandidates||[]).filter(u=>!u.dead&&u.side===side&&u.type==='infantry'&&!u.routing&&!u.regimentId).slice(0,2);
    const starts=eligible.map(u=>({id:u.id,x:u.x,y:u.y,targetX:u.targetX,targetY:u.targetY,facing:u.facing}));
    const reg=previousCreateBattery(side,cannon,crewCandidates,name);
    if(!reg)return reg;
    const crew=artilleryCrewV06(reg).slice(0,2);
    if(crew.length<2)return reg;

    reg.crewApproachV1={active:true,startedAt:elapsed,arrived:new Set(),lastDistance:Infinity};
    cannon.crewReadyV1=false;
    for(const member of crew){
      const start=starts.find(s=>s.id===member.id);
      if(start){member.x=start.x;member.y=start.y;member.targetX=start.targetX;member.targetY=start.targetY;member.facing=start.facing;}
      member.arrivedAtTarget=false;
      member.artilleryApproachV1=true;
    }
    return reg;
  };

  const previousSyncBattery=syncBatteryCrewV061;
  syncBatteryCrewV061=function syncBatteryCrewApproachV1(reg,dt=0){
    if(!reg||reg.destroyed||groupKindV06(reg)!=='artillery')return previousSyncBattery(reg,dt);
    const state=reg.crewApproachV1;
    if(!state?.active)return previousSyncBattery(reg,dt);
    const cannon=artilleryForGroupV06(reg),crew=artilleryCrewV06(reg).slice(0,2);
    if(!cannon||crew.length<2){state.active=false;return previousSyncBattery(reg,dt);}

    let ready=0,totalDistance=0;
    crew.forEach((member,index)=>{
      const target=stagingPoint(cannon,index);
      const d=Math.hypot(member.x-target.x,member.y-target.y);totalDistance+=d;
      member.targetX=target.x;member.targetY=target.y;
      member.facing=Math.atan2(target.y-member.y,target.x-member.x);
      member.formationFacing=member.facing;
      member.artilleryApproachV1=true;
      if(d<=arrivalDistance){member.x=target.x;member.y=target.y;member.arrivedAtTarget=true;ready++;return;}
      if(dt>0)moveToward(member,target.x,target.y,dt,TYPES.infantry.speed*speedFactor);
      member.arrivedAtTarget=false;
    });
    state.lastDistance=totalDistance;
    if(ready<crew.length)return;

    state.active=false;state.completedAt=elapsed;
    cannon.crewReadyV1=true;
    crew.forEach(member=>{member.artilleryApproachV1=false;});
    previousSyncBattery(reg,dt);
  };

  const previousSyncAll=syncAllBatteryCrewV061;
  syncAllBatteryCrewV061=function syncAllBatteryCrewApproachV1(dt=0){
    // Do not call the old bulk sync first: it would snap joining crews to the gun.
    for(const reg of regiments){
      if(!reg.destroyed&&groupKindV06(reg)==='artillery')syncBatteryCrewV061(reg,dt);
    }
  };

  const api=Object.freeze({
    version:'artillery-crew-approach-v1',
    arrivalDistance,
    walkBeforeAttach:true,
    state(id){
      const reg=getRegiment(id);if(!reg||groupKindV06(reg)!=='artillery')return null;
      const s=reg.crewApproachV1;
      return s?{active:s.active,startedAt:s.startedAt,completedAt:s.completedAt??null,lastDistance:s.lastDistance}:null;
    }
  });
  global.__ARTILLERY_CREW_APPROACH_V1__=api;
  nrts.subsystems.register('artillery-crew-approach',api,{
    phase:'architecture-v2.1',legacyBridge:false,
    responsibility:'reserve crew immediately but make both musketiers physically walk to staging positions before cannon operation/compound attachment'
  });
})(window);
