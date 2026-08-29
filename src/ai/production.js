'use strict';
// ---------- AI production / economy ----------
// Behaviour preserved from v0.7.1; isolated so production can evolve independently
// from tactical attack planning.

function aiBuild(type) {
  const workers = livingUnits('britain').filter(u => u.type === 'worker' && !u.dead);
  if (!workers.length) return false;
  const builders = workers.slice(0, Math.min(2, workers.length));
  let index = livingBuildings('britain').filter(b => b.type === type).length;
  for (let tries = 0; tries < 5; tries++) {
    const p = findBuildLocation('britain', type, index + tries);
    if (p && validBuildingSpot(type, p.x, p.y)) {
      const b = constructBuilding('britain', type, p.x, p.y, builders);
      if (b) {
        aiPlan = `${BUILDINGS[type].label} bouwen`;
        return true;
      }
    }
  }
  return false;
}

function aiQueue(type, buildingType) {
  const b = livingBuildings('britain').find(x => x.type === buildingType && x.complete && x.queue.length < 2);
  if (!b) return false;
  const ok = queueUnitForBuilding('britain', b, type);
  if (ok) aiPlan = `${TYPES[type].label} trainen`;
  return ok;
}

function aiTryFormRegiment() {
  const infantry = freeUnits('britain', 'infantry');
  const officer = freeUnits('britain', 'officer')[0];
  const drummer = freeUnits('britain', 'drummer')[0];
  if (infantry.length < 12 || !officer || !drummer) return null;
  const reg = createRegiment('britain', [...infantry.slice(0, 18), officer, drummer]);
  if (reg) {
    aiPlan = `${reg.name} gevormd`;
    return reg;
  }
  return null;
}

function aiDevelop() {
  if (gameOver) return;
  recalcPopCap('britain');
  autoAssignAIWorkers();

  const e = economies.britain;
  const workers = livingUnits('britain').filter(u => u.type === 'worker').length;
  const barracks = livingBuildings('britain').filter(b => b.type === 'barracks');
  const completeBarracks = barracks.filter(b => b.complete);
  const houses = livingBuildings('britain').filter(b => b.type === 'house');
  const regs = activeRegiments('britain');

  if (workers < 8 && aiQueue('worker', 'towncenter')) return;

  if (!barracks.length && e.wood >= 300) {
    if (aiBuild('barracks')) return;
  }

  if (populationUsed('britain') >= e.popCap - 5 && e.wood >= 120) {
    if (aiBuild('house')) return;
  }

  if (regs.length >= 1 && completeBarracks.length < 2 && e.wood >= 450) {
    if (aiBuild('barracks')) return;
  }

  if (!completeBarracks.length) {
    aiPlan = barracks.length ? 'Barracks afbouwen' : 'hout sparen voor Barracks';
    return;
  }

  if (freeUnits('britain', 'infantry').length < 12) {
    if (aiQueue('infantry', 'barracks')) return;
  }
  if (!freeUnits('britain', 'officer').length) {
    if (aiQueue('officer', 'barracks')) return;
  }
  if (!freeUnits('britain', 'drummer').length) {
    if (aiQueue('drummer', 'barracks')) return;
  }

  const formed = aiTryFormRegiment();
  if (formed) return;

  if (regs.length < 3 && freeUnits('britain', 'infantry').length < 12) aiQueue('infantry', 'barracks');
  else aiPlan = regs.length ? 'leger versterken' : 'regiment voorbereiden';

  if (houses.length < 1 && e.wood > 300 && e.popCap < 50) aiBuild('house');
}
