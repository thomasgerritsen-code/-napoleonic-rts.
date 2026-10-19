'use strict';
// v288: a nearby loss unnerves witnesses; leadership limits panic.
// Only the existing damage/morale authority is extended; never touches paths.
(function installCasualtyMoraleV288(root) {
  if (root.__CASUALTY_MORALE_V288__) return;
  if (typeof applyDamage !== 'function') return;

  const RADIUS = 190;
  const stats = { deaths: 0, affected: 0, leaderDeaths: 0, totalShock: 0 };
  const originalApplyDamage = applyDamage;

  function supportingRoles(unit) {
    const reg = unit.regimentId ? getRegiment(unit.regimentId) : null;
    if (!reg || reg.destroyed) return { officer: false, drummer: false };
    const members = regimentMembers(reg);
    return {
      officer: members.some(other => other.id === reg.officerId && !other.dead &&
        !other.routing && Math.hypot(other.x - unit.x, other.y - unit.y) <= 210),
      drummer: members.some(other => other.id === reg.drummerId && !other.dead &&
        !other.routing && Math.hypot(other.x - unit.x, other.y - unit.y) <= 170)
    };
  }

  function witnessShock(witness, fallen) {
    if (!witness || !fallen || witness.dead || witness.routing ||
        witness.type === 'worker' || witness.side !== fallen.side ||
        witness.id === fallen.id) return 0;
    const dist = Math.hypot(witness.x - fallen.x, witness.y - fallen.y);
    if (dist >= RADIUS) return 0;
    const base = fallen.type === 'officer' ? 11 :
      fallen.type === 'drummer' ? 8 : 6;
    const falloff = 1 - dist / RADIUS;
    const support = supportingRoles(witness);
    const discipline = (support.officer ? .68 : 1) * (support.drummer ? .86 : 1);
    return Math.min(11, base * falloff * discipline);
  }

  applyDamage = function applyDamageWithCasualtyMoraleV288(victim, damage, shock) {
    const alive = !!(victim && victim.kind === 'unit' && !victim.dead);
    originalApplyDamage.apply(this, arguments);
    if (!alive || !victim.dead || victim.type === 'worker') return;
    stats.deaths++;
    if (victim.type === 'officer') stats.leaderDeaths++;
    // A single death generates one local shock event. Simultaneous volleys
    // can compound naturally, while distant units and enemies are untouched.
    for (const witness of units) {
      const shockValue = witnessShock(witness, victim);
      if (shockValue <= 0) continue;
      witness.morale = Math.max(0, witness.morale - shockValue);
      stats.affected++;
      stats.totalShock += shockValue;
    }
  };

  const api = Object.freeze({
    version: '288.0',
    radius: RADIUS,
    witnessShock,
    supportingRoles,
    stats: () => ({ ...stats })
  });
  root.__CASUALTY_MORALE_V288__ = api;
  root.NRTS?.subsystems?.register?.('casualty-morale-v288', api, {
    phase: 'gameplay-combat', legacyBridge: false,
    responsibility: 'deterministic local casualty shock with officer and drummer resilience'
  });
})(window);
