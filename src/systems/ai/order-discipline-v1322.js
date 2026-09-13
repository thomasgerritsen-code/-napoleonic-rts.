'use strict';
// ---------- v1.3.22: AI order discipline, threat-aware formations and destination deconfliction ----------
(function installAiOrderDisciplineV1322(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS runtime must load before AI order discipline.');
  if(typeof global.aiMilitaryOrder!=='function'||typeof global.orderGroupPathV06!=='function')return;

  const stats={ticks:0,ordersSeen:0,suppressed:0,deconflicted:0,threatFormationChanges:0,crossingProtected:0};
  const ORDER_TTL=5.5;
  const SAME_TARGET_EPS=26;
  const DESTINATION_SEPARATION=92;
  const CAVALRY_SQUARE_RANGE=145;
  const CONTACT_DEPLOY_RANGE=245;
  const acceptedThisTick=[];

  function now(){try{return Number(elapsed)||0;}catch{return 0;}}
  function members(reg){
    try{return global.regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);}catch{return[];}
  }
  function center(reg){
    const list=members(reg);
    if(!list.length)return{x:0,y:0};
    let x=0,y=0;for(const u of list){x+=u.x;y+=u.y;}return{x:x/list.length,y:y/list.length};
  }
  function sideOf(reg){return members(reg)[0]?.side||null;}
  function angleDelta(a,b){
    if(!Number.isFinite(a)||!Number.isFinite(b))return 0;
    let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return Math.abs(d);
  }
  function crossingActive(reg){
    const info=reg?.crossingTrafficV068;
    return Boolean(info?.forcedColumn&&['approach','crossing','clearing'].includes(info.state));
  }
  function nearestEnemy(reg){
    const side=sideOf(reg);if(!side||typeof global.livingUnits!=='function')return null;
    const enemy=side==='britain'?'france':'britain';
    const c=center(reg);let best=null;
    for(const u of global.livingUnits(enemy)){
      if(!u||u.dead||u.type==='worker')continue;
      const distance=Math.hypot(u.x-c.x,u.y-c.y);
      if(!best||distance<best.distance)best={unit:u,distance};
    }
    return best;
  }
  function mostlyInfantry(reg){
    const list=members(reg);if(!list.length)return false;
    const infantry=list.filter(u=>u.type==='infantry'||u.type==='officer'||u.type==='drummer').length;
    return infantry/list.length>.72;
  }
  function tacticalFormation(reg,formation,countChange=true){
    if(crossingActive(reg))return formation;
    const threat=nearestEnemy(reg);if(!threat)return formation;
    if(mostlyInfantry(reg)&&threat.unit?.type==='cavalry'&&threat.distance<CAVALRY_SQUARE_RANGE&&formation!=='square'){
      if(countChange)stats.threatFormationChanges++;return'square';
    }
    if(formation==='column'&&threat.distance<CONTACT_DEPLOY_RANGE){
      if(countChange)stats.threatFormationChanges++;return'line';
    }
    return formation;
  }
  function sameOrder(last,x,y,formation,facing){
    if(!last)return false;
    return Math.hypot(last.x-x,last.y-y)<=SAME_TARGET_EPS&&last.formation===formation&&angleDelta(last.facing,facing)<.14;
  }
  function deconflict(reg,x,y){
    if(crossingActive(reg))return{x,y};
    let nx=x,ny=y;
    for(const slot of acceptedThisTick){
      if(slot.regId===reg.id)continue;
      const dx=nx-slot.x,dy=ny-slot.y,d=Math.hypot(dx,dy);
      if(d>=DESTINATION_SEPARATION)continue;
      const c=center(reg),mx=nx-c.x,my=ny-c.y,ml=Math.hypot(mx,my)||1;
      const sign=(String(reg.id).localeCompare(String(slot.regId))>=0)?1:-1;
      const push=(DESTINATION_SEPARATION-d)+34;
      nx+=(-my/ml)*push*sign;ny+=(mx/ml)*push*sign;
      stats.deconflicted++;
    }
    return{x:nx,y:ny};
  }

  const previousAiMilitaryOrder=global.aiMilitaryOrder;
  global.aiMilitaryOrder=function aiMilitaryOrderDisciplinedV1322(){
    stats.ticks++;acceptedThisTick.length=0;
    const previousOrderGroupPath=global.orderGroupPathV06;
    global.orderGroupPathV06=function aiDisciplinedOrderGroupPathV1322(reg,x,y,formation=reg?.formation,finalFacing=null){
      stats.ordersSeen++;
      if(!reg||reg.destroyed)return previousOrderGroupPath(reg,x,y,formation,finalFacing);
      const state=global.__AI_COMMANDER_V1__?.state?.().state;
      const last=reg.aiOrderDisciplineV1322;
      if(crossingActive(reg)&&last&&state!=='RETREAT'){
        const changed=Math.hypot(last.x-x,last.y-y)>80;
        if(changed){stats.crossingProtected++;stats.suppressed++;return false;}
      }
      const chosenFormation=tacticalFormation(reg,formation);
      const p=deconflict(reg,x,y);
      const age=Math.max(0,now()-(last?.at??-Infinity));
      if(age<ORDER_TTL&&sameOrder(last,p.x,p.y,chosenFormation,finalFacing)){
        stats.suppressed++;acceptedThisTick.push({regId:reg.id,x:last.x,y:last.y});return false;
      }
      reg.aiOrderDisciplineV1322={x:p.x,y:p.y,formation:chosenFormation,facing:finalFacing,at:now()};
      acceptedThisTick.push({regId:reg.id,x:p.x,y:p.y});
      return previousOrderGroupPath(reg,p.x,p.y,chosenFormation,finalFacing);
    };
    try{return previousAiMilitaryOrder();}
    finally{global.orderGroupPathV06=previousOrderGroupPath;acceptedThisTick.length=0;}
  };

  const api=Object.freeze({
    version:'ai-order-discipline-v1322',
    stats:()=>({...stats}),
    previewFormation:(reg,formation)=>tacticalFormation(reg,formation,false),
    config:Object.freeze({orderTtl:ORDER_TTL,targetEpsilon:SAME_TARGET_EPS,destinationSeparation:DESTINATION_SEPARATION,cavalrySquareRange:CAVALRY_SQUARE_RANGE,contactDeployRange:CONTACT_DEPLOY_RANGE})
  });
  global.__AI_ORDER_DISCIPLINE_V1322__=api;
  nrts.subsystems.register('ai-order-discipline',api,{phase:'v1.3.22',legacyBridge:false,responsibility:'stabilize AI orders, preserve active crossings, deploy before contact, react to close cavalry, and keep regiment destinations from stacking'});
})(window);
