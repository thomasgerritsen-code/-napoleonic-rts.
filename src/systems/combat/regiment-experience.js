'use strict';
// Regiment honours are earned by combat, never by a client command. Keep the
// casualty ledger outside entity snapshots and release it when a group falls.
(function installRegimentExperience(root) {
  const cfg = root.NRTS_CONFIG?.regimentExperience;
  if (!cfg || root.__REGIMENT_EXPERIENCE__) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installRegimentExperience(root), {once:true}); return; }
  let losses = new WeakMap(), awarded = new WeakSet();
  const stats = {victories:0, promotions:0};
  function rankIndex(reg) {
    const victories = Math.max(0, reg?.victories || 0);
    let i = 0;
    while (i + 1 < cfg.ranks.length && victories >= cfg.ranks[i + 1].victories) i++;
    return i;
  }
  const rankOf = reg => cfg.ranks[rankIndex(reg)];
  function attackMultiplier(id) {
    const reg = id ? getRegiment(id) : null;
    return reg && !reg.destroyed ? rankOf(reg).damage : 1;
  }
  function summary(reg) {
    const rank = rankOf(reg), next = cfg.ranks[rankIndex(reg) + 1], wins = reg.victories || 0;
    return `${rank.label} · ${wins} regimenten verslagen${next ? ` · ${next.label} bij ${next.victories}` : ' · hoogste rang'} · schade +${Math.round((rank.damage - 1) * 100)}% · moraalverlies −${Math.round((1 - rank.shock) * 100)}%`;
  }
  const baseDamage = applyDamage;
  applyDamage = function applyDamageWithCombatHonours(victim, damage, shock) {
    const defender = victim && !victim.dead && victim.kind === 'unit' && victim.type !== 'worker' && victim.regimentId ? getRegiment(victim.regimentId) : null;
    const source = combatDamageSource;
    const result = baseDamage.apply(this, arguments);
    if (!defender || defender.destroyed || !victim.dead || !source?.regimentId || source.side === defender.side) return result;
    const attacker = getRegiment(source.regimentId);
    if (!attacker || attacker.destroyed || attacker === defender || attacker.side !== source.side) return result;
    let record = losses.get(defender);
    if (!record) { record = {by:new Map(), counted:new WeakSet()}; losses.set(defender, record); }
    // A wounded man restored by medics cannot be counted twice for the same group.
    if (!record.counted.has(victim)) { record.counted.add(victim); record.by.set(attacker, (record.by.get(attacker) || 0) + 1); }
    return result;
  };
  const baseShock = moraleShock;
  moraleShock = function moraleShockWithExperience(victim, amount) {
    const reg = victim?.regimentId ? getRegiment(victim.regimentId) : null;
    return baseShock(victim, amount * (reg && !reg.destroyed ? rankOf(reg).shock : 1));
  };
  function defeated(reg) {
    if (awarded.has(reg)) return;
    awarded.add(reg);
    const record = losses.get(reg); losses.delete(reg);
    let winner = null, most = 0;
    for (const [candidate, count] of record?.by || []) {
      if (candidate.destroyed || candidate.side === reg.side || !regimentMembers(candidate).length) continue;
      // Equal contributions use the older regiment ID, independent of iteration order.
      if (count > most || (count === most && candidate.id < winner.id)) { winner = candidate; most = count; }
    }
    if (!winner) return;
    const before = rankIndex(winner);
    winner.victories = (winner.victories || 0) + 1;
    winner.rank = rankIndex(winner);
    stats.victories++;
    if (winner.rank > before) {
      stats.promotions++;
      if (winner.side === 'france') statusEl.textContent = `${winner.name} promoveert tot ${rankOf(winner).label}!`;
    }
  }
  const baseRefresh = refreshRegiment;
  refreshRegiment = function refreshRegimentWithExperience(reg) {
    const alive = reg && !reg.destroyed;
    const result = baseRefresh.apply(this, arguments);
    if (alive && reg.destroyed) defeated(reg);
    return result;
  };
  root.NRTS?.events?.on?.('game:reset', () => {losses = new WeakMap(); awarded = new WeakSet(); stats.victories = stats.promotions = 0;});
  const api = Object.freeze({rankOf, rankIndex, summary, attackMultiplier, config:cfg, stats:() => ({...stats})});
  root.__REGIMENT_EXPERIENCE__ = api;
  root.NRTS?.subsystems?.register?.('regiment-experience', api, {phase:'combat', legacyBridge:false,
    responsibility:'one combat victory per defeated regiment, bounded ranks and authoritative combat bonuses'});
})(window);
