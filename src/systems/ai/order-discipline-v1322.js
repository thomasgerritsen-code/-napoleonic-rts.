'use strict';
// ---------- v1.4.2: AI order discipline, formation-aware spacing and stable front slots ----------
(function installAiOrderDisciplineV1322(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS runtime must load before AI order discipline.');
  if(typeof global.aiMilitaryOrder!=='function'||typeof global.orderGroupPathV06!=='function')return;

  const stats={ticks:0,ordersSeen:0,suppressed:0,deconflicted:0,spacingPasses:0,threatFormationChanges:0,crossingProtected:0,slotMemoryPruned:0};
  const ORDER_TTL=5.5;
  const SAME_TARGET_EPS=26;
  const DESTINATION_SEPARATION=92;
  const LINE_BASE_SEPARATION=118;
  const SQUARE_BASE_SEPARATION=132;
  const COLUMN_BASE_SEPARATION=76;
  const MAX_DYNAMIC_SPACING_BONUS=34;
  const MAX_DECONFLICT_PASSES=3;
  const SLOT_MEMORY_TTL=30;
  const CAVALRY_SQUARE_RANGE=145;
  const CONTACT_DEPLOY_RANGE=245;
  const acceptedThisTick=[];
  const slotSideMemory=new Map();

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
  function sameStrategicOrder(last,x,y,formation,facing){
    if(!last)return false;
    const previousX=Number.isFinite(last.requestedX)?last.requestedX:last.x;
    const previousY=Number.isFinite(last.requestedY)?last.requestedY:last.y;
    return Math.hypot(previousX-x,previousY-y)<=SAME_TARGET_EPS&&last.formation===formation&&angleDelta(last.facing,facing)<.14;
  }
  function formationSeparation(reg,formation){
    const count=members(reg).length;
    const bonus=Math.min(MAX_DYNAMIC_SPACING_BONUS,Math.max(0,count-12)*1.35);
    if(formation==='column')return COLUMN_BASE_SEPARATION+bonus*.25;
    if(formation==='square')return SQUARE_BASE_SEPARATION+bonus*.55;
    if(formation==='line')return LINE_BASE_SEPARATION+bonus;
    return DESTINATION_SEPARATION+bonus*.5;
  }
  function stableSlotSign(reg){
    const id=String(reg?.id??'');
    const cached=slotSideMemory.get(id);
    const t=now();
    if(cached&&t-cached.at<=SLOT_MEMORY_TTL){cached.at=t;return cached.sign;}
    let hash=0;for(let i=0;i<id.length;i++)hash=((hash<<5)-hash+id.charCodeAt(i))|0;
    const sign=(hash&1)?1:-1;
    slotSideMemory.set(id,{sign,at:t});
    return sign;
  }
  function pruneSlotMemory(){
    const t=now();
    for(const [id,entry] of slotSideMemory){
      if(!entry||t-entry.at>SLOT_MEMORY_TTL){slotSideMemory.delete(id);stats.slotMemoryPruned++;}
    }
  }
  function deconflict(reg,x,y,formation){
    if(crossingActive(reg))return{x,y};
    let nx=x,ny=y;
    const c=center(reg);
    const minOwn=formationSeparation(reg,formation);
    const stableSign=stableSlotSign(reg);
    for(let pass=0;pass<MAX_DECONFLICT_PASSES;pass++){
      let changed=false;
      for(const slot of acceptedThisTick){
        if(slot.regId===reg.id)continue;
        const required=Math.max(minOwn,slot.separation||DESTINATION_SEPARATION);
        const dx=nx-slot.x,dy=ny-slot.y,d=Math.hypot(dx,dy);
        if(d>=required)continue;
        let mx=nx-c.x,my=ny-c.y,ml=Math.hypot(mx,my);
        if(ml<1){mx=1;my=0;ml=1;}
        const pairSign=String(reg.id).localeCompare(String(slot.regId))>=0?stableSign:-stableSign;
        const push=Math.min(required*.7,(required-d)+24);
        nx+=(-my/ml)*push*pairSign;
        ny+=(mx/ml)*push*pairSign;
        stats.deconflicted++;
        changed=true;
      }
      if(!changed)break;
      stats.spacingPasses++;
    }
    return{x:nx,y:ny};
  }

  const previousAiMilitaryOrder=global.aiMilitaryOrder;
  global.aiMilitaryOrder=function aiMilitaryOrderDisciplinedV142(){
    stats.ticks++;acceptedThisTick.length=0;pruneSlotMemory();
    const previousOrderGroupPath=global.orderGroupPathV06;
    global.orderGroupPathV06=function aiDisciplinedOrderGroupPathV142(reg,x,y,formation=reg?.formation,finalFacing=null){
      stats.ordersSeen++;
      if(!reg||reg.destroyed)return previousOrderGroupPath(reg,x,y,formation,finalFacing);
      const state=global.__AI_COMMANDER_V1__?.state?.().state;
      const last=reg.aiOrderDisciplineV1322;
      if(crossingActive(reg)&&last&&state!=='RETREAT'){
        const previousX=Number.isFinite(last.requestedX)?last.requestedX:last.x;
        const previousY=Number.isFinite(last.requestedY)?last.requestedY:last.y;
        const changed=Math.hypot(previousX-x,previousY-y)>80;
        if(changed){stats.crossingProtected++;stats.suppressed++;return false;}
      }
      const chosenFormation=tacticalFormation(reg,formation);
      const separation=formationSeparation(reg,chosenFormation);
      const age=Math.max(0,now()-(last?.at??-Infinity));
      if(age<ORDER_TTL&&sameStrategicOrder(last,x,y,chosenFormation,finalFacing)){
        stats.suppressed++;
        acceptedThisTick.push({regId:reg.id,x:last.x,y:last.y,separation:last.separation||separation});
        return false;
      }
      const p=deconflict(reg,x,y,chosenFormation);
      if(age<ORDER_TTL&&sameOrder(last,p.x,p.y,chosenFormation,finalFacing)){
        stats.suppressed++;
        acceptedThisTick.push({regId:reg.id,x:last.x,y:last.y,separation:last.separation||separation});
        return false;
      }
      reg.aiOrderDisciplineV1322={x:p.x,y:p.y,requestedX:x,requestedY:y,formation:chosenFormation,facing:finalFacing,at:now(),separation};
      acceptedThisTick.push({regId:reg.id,x:p.x,y:p.y,separation});
      return previousOrderGroupPath(reg,p.x,p.y,chosenFormation,finalFacing);
    };
    try{return previousAiMilitaryOrder();}
    finally{global.orderGroupPathV06=previousOrderGroupPath;acceptedThisTick.length=0;}
  };

  const api=Object.freeze({
    version:'ai-order-discipline-v142',
    stats:()=>({...stats,slotMemory:slotSideMemory.size}),
    previewFormation:(reg,formation)=>tacticalFormation(reg,formation,false),
    formationSeparation:(reg,formation)=>formationSeparation(reg,formation),
    config:Object.freeze({orderTtl:ORDER_TTL,targetEpsilon:SAME_TARGET_EPS,destinationSeparation:DESTINATION_SEPARATION,lineBaseSeparation:LINE_BASE_SEPARATION,squareBaseSeparation:SQUARE_BASE_SEPARATION,columnBaseSeparation:COLUMN_BASE_SEPARATION,maxDeconflictPasses:MAX_DECONFLICT_PASSES,cavalrySquareRange:CAVALRY_SQUARE_RANGE,contactDeployRange:CONTACT_DEPLOY_RANGE})
  });
  global.__AI_ORDER_DISCIPLINE_V1322__=api;
  nrts.subsystems.register('ai-order-discipline',api,{phase:'v1.4.2',legacyBridge:false,responsibility:'stabilize AI orders, preserve active crossings, deploy before contact, react to cavalry, and keep formation-aware regiment destinations from stacking'});
})(window);

// Load the commander-cohesion layer only after the established order-discipline
// wrapper is installed, keeping the existing authority chain deterministic.
(() => {
  const script=document.createElement('script');
  script.src='src/systems/ai/command-cohesion-v140.js?build=141a';
  script.defer=true;
  document.head.appendChild(script);
})();

// Front/reserve cohesion is intentionally a separate light layer. It only runs when
// the commander issues ATTACK/FLANK orders and therefore adds no per-frame scan.
(() => {
  const script=document.createElement('script');
  script.src='src/systems/ai/front-reserve-cohesion-v143.js?build=143a';
  script.defer=true;
  document.head.appendChild(script);
})();
