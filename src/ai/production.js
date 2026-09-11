'use strict';
// ---------- AI production / economy v1.2.5 ----------
// Config-driven replenishment. Tactical intent remains owned by ai/tactics.js.

const AI_PRODUCTION_CFG = window.NRTS_CONFIG?.ai || Object.freeze({
  minWorkers:10,
  desiredInfantryRegiments:4,
  productionQueueLimit:2
});

const AI_PRODUCTION_STATE = {
  ticks:0,
  queued:0,
  formed:0,
  built:0,
  lastAction:'idle',
  lastBlocked:null,
  lastReadiness:0
};

function aiSetProductionAction(action,blocked=null){
  AI_PRODUCTION_STATE.lastAction=action;
  AI_PRODUCTION_STATE.lastBlocked=blocked;
  return true;
}

function aiBuild(type) {
  const workers = livingUnits('britain').filter(u => u.type === 'worker' && !u.dead);
  if (!workers.length) {
    aiSetProductionAction('build-blocked','no-workers');
    return false;
  }
  const builders = workers.slice(0, Math.min(2, workers.length));
  let index = livingBuildings('britain').filter(b => b.type === type).length;
  for (let tries = 0; tries < 7; tries++) {
    const p = findBuildLocation('britain', type, index + tries);
    if (p && validBuildingSpot(type, p.x, p.y)) {
      const b = constructBuilding('britain', type, p.x, p.y, builders);
      if (b) {
        AI_PRODUCTION_STATE.built++;
        aiPlan = `${BUILDINGS[type].label} bouwen`;
        aiSetProductionAction(`build:${type}`);
        return true;
      }
    }
  }
  aiSetProductionAction(`build-blocked:${type}`,'no-valid-spot');
  return false;
}

function aiTrainingBuildings(buildingType){
  const queueLimit=Math.max(1,Number(AI_PRODUCTION_CFG.productionQueueLimit)||2);
  return livingBuildings('britain')
    .filter(b=>b.type===buildingType && b.complete && Array.isArray(b.queue) && b.queue.length<queueLimit)
    .sort((a,b)=>a.queue.length-b.queue.length || (a.production||0)-(b.production||0) || a.id-b.id);
}

function aiQueue(type, buildingType) {
  const candidates=aiTrainingBuildings(buildingType);
  if (!candidates.length) {
    aiSetProductionAction(`queue-blocked:${type}`,`no-${buildingType}-capacity`);
    return false;
  }
  for(const b of candidates){
    const ok = queueUnitForBuilding('britain', b, type);
    if (ok) {
      AI_PRODUCTION_STATE.queued++;
      aiPlan = `${TYPES[type].label} trainen`;
      aiSetProductionAction(`queue:${type}`);
      return true;
    }
  }
  aiSetProductionAction(`queue-blocked:${type}`,'resources-or-population');
  return false;
}

function aiRegimentReadiness(reg){
  const members=regimentMembers(reg);
  const infantry=members.filter(u=>u.type==='infantry').length;
  const officer=members.some(u=>u.type==='officer');
  const drummer=members.some(u=>u.type==='drummer');
  const infantryFactor=Math.min(1,infantry/12);
  const commandFactor=(officer?1:.82)*(drummer?1:.93);
  return infantryFactor*commandFactor;
}

function aiArmyReadiness(regs=activeRegiments('britain')){
  return regs.reduce((sum,reg)=>sum+aiRegimentReadiness(reg),0);
}

function aiTryFormRegiment() {
  const infantry = freeUnits('britain', 'infantry');
  const officer = freeUnits('britain', 'officer')[0];
  const drummer = freeUnits('britain', 'drummer')[0];
  if (infantry.length < 12 || !officer || !drummer) return null;
  const reg = createRegiment('britain', [...infantry.slice(0, 18), officer, drummer]);
  if (reg) {
    AI_PRODUCTION_STATE.formed++;
    aiPlan = `${reg.name} gevormd`;
    aiSetProductionAction('form:regiment');
    return reg;
  }
  return null;
}

function aiEnsurePopulationHeadroom(e){
  const used=populationUsed('britain');
  const headroom=e.popCap-used;
  const desiredHeadroom=Math.max(8,Math.ceil((AI_PRODUCTION_CFG.productionQueueLimit||2)*4));
  if(headroom>=desiredHeadroom) return false;
  if(e.wood < (BUILDINGS.house.cost?.wood||120)) {
    aiSetProductionAction('population-blocked','wood');
    return false;
  }
  return aiBuild('house');
}

function aiDesiredBarracksCount(){
  const desired=Math.max(1,Number(AI_PRODUCTION_CFG.desiredInfantryRegiments)||4);
  return Math.min(3,1+Math.floor((desired-1)/2));
}

function aiDevelop() {
  if (gameOver) return;
  AI_PRODUCTION_STATE.ticks++;
  recalcPopCap('britain');
  autoAssignAIWorkers();

  const e = economies.britain;
  const workers = livingUnits('britain').filter(u => u.type === 'worker').length;
  const barracks = livingBuildings('britain').filter(b => b.type === 'barracks');
  const completeBarracks = barracks.filter(b => b.complete);
  const regs = activeRegiments('britain');
  const desiredRegiments=Math.max(1,Number(AI_PRODUCTION_CFG.desiredInfantryRegiments)||4);
  const readiness=aiArmyReadiness(regs);
  AI_PRODUCTION_STATE.lastReadiness=readiness;

  const minWorkers=Math.max(4,Number(AI_PRODUCTION_CFG.minWorkers)||10);
  if (workers < minWorkers && aiQueue('worker', 'towncenter')) return;

  if (!barracks.length && e.wood >= (BUILDINGS.barracks.cost?.wood||300)) {
    if (aiBuild('barracks')) return;
  }

  // Build population before queues hard-stop. This intentionally happens before military
  // training so the AI does not enter the old queue/pop-cap deadlock after its first wave.
  if (aiEnsurePopulationHeadroom(e)) return;

  const desiredBarracks=aiDesiredBarracksCount();
  if (completeBarracks.length && barracks.length < desiredBarracks && e.wood >= (BUILDINGS.barracks.cost?.wood||300)) {
    if (aiBuild('barracks')) return;
  }

  if (!completeBarracks.length) {
    aiPlan = barracks.length ? 'Barracks afbouwen' : 'hout sparen voor Barracks';
    aiSetProductionAction('wait:barracks',barracks.length?'construction':'resources');
    return;
  }

  // If losses reduce an existing regiment below fighting strength, readiness falls even though
  // the regiment object still exists. The AI therefore keeps producing replacement formations
  // instead of mistaking damaged remnants for a full army.
  if (readiness < desiredRegiments - .01) {
    const formed=aiTryFormRegiment();
    if(formed) return;

    const freeInfantry=freeUnits('britain','infantry').length;
    const freeOfficers=freeUnits('britain','officer').length;
    const freeDrummers=freeUnits('britain','drummer').length;
    if (freeInfantry < 12) {
      if (aiQueue('infantry','barracks')) return;
    } else if (!freeOfficers) {
      if (aiQueue('officer','barracks')) return;
    } else if (!freeDrummers) {
      if (aiQueue('drummer','barracks')) return;
    }
    aiPlan=`reserves aanvullen · slagkracht ${readiness.toFixed(1)}/${desiredRegiments}`;
    aiSetProductionAction('replenish:waiting');
    return;
  }

  // Once the configured field army is ready, retain a small infantry reserve so the next loss
  // does not restart production from zero. Keep this below regiment-forming strength to avoid
  // uncontrolled army growth.
  const reserveTarget=Math.min(8,Math.max(4,Math.ceil(desiredRegiments*1.5)));
  const freeInfantry=freeUnits('britain','infantry').length;
  if(freeInfantry<reserveTarget){
    if(aiQueue('infantry','barracks')) return;
  }

  aiPlan=`leger gereed · ${readiness.toFixed(1)}/${desiredRegiments} regiment-equivalent`;
  aiSetProductionAction('ready');
}

window.__AI_PRODUCTION_V125__=Object.freeze({
  version:'1.2.5',
  config:AI_PRODUCTION_CFG,
  readiness:()=>aiArmyReadiness(activeRegiments('britain')),
  snapshot:()=>Object.freeze({
    ...AI_PRODUCTION_STATE,
    workers:livingUnits('britain').filter(u=>u.type==='worker').length,
    regiments:activeRegiments('britain').length,
    freeInfantry:freeUnits('britain','infantry').length,
    desiredRegiments:Math.max(1,Number(AI_PRODUCTION_CFG.desiredInfantryRegiments)||4),
    desiredBarracks:aiDesiredBarracksCount(),
    queueLimit:Math.max(1,Number(AI_PRODUCTION_CFG.productionQueueLimit)||2)
  }),
  tick:()=>aiDevelop()
});

if(window.NRTS && !window.NRTS.subsystems.has('ai-production')){
  window.NRTS.subsystems.register('ai-production',window.__AI_PRODUCTION_V125__,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'config-driven economy, queue balancing and loss-aware army replenishment'
  });
}
