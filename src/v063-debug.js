'use strict';
// ---------- v0.6.3 test/debug hooks ----------
if (window.__RTS_DEBUG__) {
  window.__RTS_DEBUG__.getAIReinforcementState = function getAIReinforcementStateV063() {
    const targets = aiForceTargetsV063();
    const counts = {};
    for (const type of ['worker','infantry','officer','drummer','cavalry','artillery']) {
      counts[type] = {
        living: livingTypeCountV063('britain', type),
        queued: queuedTypeCountV063(type, 'britain'),
        target: targets[type] ?? null
      };
    }
    return {
      wave: aiWaveNumberV063,
      lastWaveAt: aiLastWaveAtV063,
      strategy: aiStrategyV06,
      plan: aiPlan,
      counts,
      popUsed: populationUsed('britain'),
      popCap: economies.britain.popCap,
      projectedPop: populationUsed('britain') + queuedPopulationV063('britain')
    };
  };

  window.__RTS_DEBUG__.inflictBritishLosses = function inflictBritishLossesV063() {
    const killed = { infantry: 0, cavalry: 0, artillery: 0 };
    const killSome = (type, fraction, minimum = 1) => {
      const pool = livingUnits('britain').filter(u => u.type === type && !u.routing);
      const count = Math.min(pool.length, Math.max(minimum, Math.floor(pool.length * fraction)));
      for (const u of pool.slice(0, count)) {
        applyDamage(u, u.hp + 1000, 0);
        killed[type]++;
      }
    };
    killSome('infantry', 0.46, 8);
    killSome('cavalry', 0.5, 2);
    killSome('artillery', 0.34, 1);
    regiments.forEach(refreshRegiment);
    aiDecisionClock = 2;
    aiAttackClock = 8;
    updateHud(true);
    return killed;
  };

  window.__RTS_DEBUG__.formationState = function formationStateV063(id) {
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    if (!reg) return null;
    const members = regimentMembers(reg);
    const c = members.length ? centroid(members) : { x: reg.targetX, y: reg.targetY };
    return {
      id: reg.id,
      kind: groupKindV06(reg),
      phase: reg.movementPhaseV063 || (reg.marchV063?.phase ?? 'idle'),
      formation: reg.formation,
      facing: reg.facing || 0,
      finalFacing: Number.isFinite(reg.finalFacing) ? reg.finalFacing : null,
      pathIndex: reg.pathIndex || 0,
      pathLength: reg.path?.length || 0,
      centroid: c,
      anchor: reg.marchV063 ? { x: reg.marchV063.anchorX, y: reg.marchV063.anchorY } : null,
      readiness: formationReadinessV063(reg, 18),
      members: members.map(u => ({ id:u.id, type:u.type, x:u.x, y:u.y, targetX:u.targetX, targetY:u.targetY }))
    };
  };
}
