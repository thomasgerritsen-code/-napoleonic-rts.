'use strict';
// ---------- Architecture v2.1: final AI development + commander authority ----------
(function installAiAuthorityV2(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before AI authority.');
  const cfg=global.NRTS_CONFIG?.ai || {};
  const legacyDevelop=aiDevelop;
  const legacyMilitary=aiMilitaryOrder;
  const stats={developmentTicks:0,fallbackActions:0,militaryTicks:0,batteryOrders:0};

  function signature(){
    const e=economies.britain;
    return [Math.round(e.food),Math.round(e.wood),populationUsed('britain'),e.popCap,livingBuildings('britain').length,livingUnits('britain').length,livingBuildings('britain').reduce((s,b)=>s+(b.queue?.length||0),0)].join(':');
  }
  function complete(type){return livingBuildings('britain').filter(b=>b.type===type&&b.complete);}
  function any(type){return livingBuildings('britain').filter(b=>b.type===type);}
  function free(type){return freeUnits('britain',type);}

  function fallbackDevelopment(){
    recalcPopCap('britain');
    autoAssignAIWorkers();
    const e=economies.britain;
    const workers=livingUnits('britain').filter(u=>u.type==='worker'&&!u.dead).length;
    const regs=typeof activeGroupsV06==='function'?activeGroupsV06('britain').filter(r=>groupKindV06(r)!=='artillery'):activeRegiments('britain');

    if(workers<(cfg.minWorkers??10)&&aiQueue('worker','towncenter'))return'worker';
    if(populationUsed('britain')>=e.popCap-5&&e.wood>=(BUILDINGS.house.cost?.wood||120)&&aiBuild('house'))return'house';
    if(!any('barracks').length&&e.wood>=(BUILDINGS.barracks.cost?.wood||300)&&aiBuild('barracks'))return'barracks';
    if(any('barracks').some(b=>!b.complete))return null;

    if(complete('barracks').length){
      if(free('infantry').length<12&&aiQueue('infantry','barracks'))return'infantry';
      if(!free('officer').length&&aiQueue('officer','barracks'))return'officer';
      if(!free('drummer').length&&aiQueue('drummer','barracks'))return'drummer';
      if(typeof aiTryFormRegiment==='function'&&aiTryFormRegiment())return'regiment';
    }

    const combatRegs=activeRegiments('britain');
    if(combatRegs.length>=1&&!any('stable').length&&e.wood>=(BUILDINGS.stable?.cost?.wood||360)&&aiBuild('stable'))return'stable';
    if(complete('stable').length&&livingUnits('britain').filter(u=>u.type==='cavalry').length<(cfg.desiredCavalry??8)&&aiQueue('cavalry','stable'))return'cavalry';
    if(typeof aiTryCavalryRegimentV06==='function'&&aiTryCavalryRegimentV06())return'cavalry-regiment';

    if(combatRegs.length>=1&&complete('stable').length&&!any('foundry').length&&e.wood>=(BUILDINGS.foundry?.cost?.wood||420)&&aiBuild('foundry'))return'foundry';
    if(complete('foundry').length&&livingUnits('britain').filter(u=>u.type==='artillery').length<(cfg.desiredArtillery??3)&&aiQueue('artillery','foundry'))return'artillery';
    if(typeof aiAutoCrewArtilleryV06==='function'&&aiAutoCrewArtilleryV06()===false)return null;

    // Keep feeding mature armies instead of entering a permanent idle state after the first wave.
    const desiredRegs=cfg.desiredInfantryRegiments??4;
    if(activeRegiments('britain').filter(r=>groupKindV06(r)==='infantry').length<desiredRegs&&complete('barracks').length){
      if(free('infantry').length<12&&aiQueue('infantry','barracks'))return'reinforcement-infantry';
      if(!free('officer').length&&aiQueue('officer','barracks'))return'reinforcement-officer';
      if(!free('drummer').length&&aiQueue('drummer','barracks'))return'reinforcement-drummer';
      if(typeof aiTryFormRegiment==='function'&&aiTryFormRegiment())return'reinforcement-regiment';
    }
    return null;
  }

  aiDevelop=function aiDevelopAuthorityV2(){
    if(gameOver)return;
    stats.developmentTicks++;
    const before=signature();
    legacyDevelop();
    const after=signature();
    if(after!==before)return;
    const action=fallbackDevelopment();
    if(action){stats.fallbackActions++;aiPlan=`AI ontwikkeling: ${action}`;}
  };

  function strategicTarget(){
    const enemy=activeRegiments('france').filter(r=>regimentMembers(r).length);
    if(enemy.length)return centroid(regimentMembers(enemy[0]));
    const tc=livingBuildings('france').find(b=>b.type==='towncenter');
    return tc?{x:tc.x,y:tc.y}:{x:650,y:900};
  }
  function orderBatteries(target){
    if(typeof activeGroupsV06!=='function')return;
    const batteries=activeGroupsV06('britain').filter(r=>groupKindV06(r)==='artillery'&&artilleryForGroupV06(r));
    const tc=livingBuildings('britain').find(b=>b.type==='towncenter');
    const origin=tc||{x:WORLD.width*.75,y:WORLD.height*.5};
    const dx=target.x-origin.x,dy=target.y-origin.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    batteries.forEach((reg,i)=>{
      if(reg.crewApproachV1?.active)return;
      const lateral=(i-(batteries.length-1)/2)*95;
      const x=target.x-ux*430-uy*lateral,y=target.y-uy*430+ux*lateral;
      orderGroupPathV06(reg,x,y,'line',Math.atan2(dy,dx));stats.batteryOrders++;
    });
  }

  aiMilitaryOrder=function aiMilitaryOrderAuthorityV2(){
    if(gameOver)return;
    stats.militaryTicks++;
    const regs=activeRegiments('britain').filter(r=>regimentMembers(r).length);
    if(global.__AI_COMMANDER_V1__?.tick&&regs.length){
      global.__AI_COMMANDER_V1__.tick();
      orderBatteries(strategicTarget());
      return;
    }
    legacyMilitary();
    orderBatteries(strategicTarget());
  };

  const api=Object.freeze({
    version:'ai-authority-v2',
    continuousDevelopment:true,
    commanderReasserted:true,
    artilleryIntegrated:true,
    stats:()=>({...stats,plan:aiPlan,regiments:activeRegiments('britain').length,units:livingUnits('britain').length})
  });
  global.__AI_AUTHORITY_V2__=api;
  nrts.subsystems.register('ai-authority',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'final post-legacy AI economy, reinforcement and combined-arms commander authority'});
})(window);
