'use strict';
// Schiettoren (open map only, NRTS_CONFIG.towers): a tower peasants build for
// defence. Once finished its garrison fires a small volley at the nearest
// enemy in reach every few seconds, it sees far over the field, and the enemy
// can shoot and storm it down like any other building. The British commander
// puts up one or two of his own towards the French.
(function installWatchtowerV1(root) {
  const cfg = root.NRTS_CONFIG?.towers;
  if (!cfg || root.__WATCHTOWER_V1__ || typeof BUILDINGS === 'undefined') return;
  BUILDINGS.tower = { w: 56, h: 56, hp: cfg.hp, label: 'Schiettoren', cost: { ...cfg.cost } };
  const stats = { volleys: 0, shots: 0, aiBuilt: 0, upgradesStarted: 0, upgrades: 0 };
  const towers = side => buildings.filter(b => !b.dead && b.type === 'tower' && (!side || b.side === side));
  const levelOf = b => cfg.levels[b?.towerLevel || 1] || cfg.levels[1];
  const costText = cost => `${cost.wood} 🪵 · ${cost.iron} ⛏️`;

  // The garrison strengthens its completed tower while continuing to fire.
  // Scalar progress fields travel through the existing authoritative snapshots.
  function upgradeTower(b = selectedBuilding) {
    if (!b || !buildings.includes(b) || b.dead || b.hp <= 0 || b.side !== 'france' || b.type !== 'tower' || !b.complete || b.towerUpgradeTo) return false;
    const to = (b.towerLevel || 1) + 1, next = cfg.levels[to];
    if (!next || gameOver || !canAfford(b.side, next.cost)) return false;
    pay(b.side, next.cost);
    b.towerUpgradeTo = to; b.towerUpgradeProgress = 0;
    stats.upgradesStarted++;
    statusEl.textContent = `${next.label} wordt gebouwd (${next.seconds} s).`;
    actionSignature = ''; updateHud(true);
    return true;
  }
  function upgradeWork(b, dt) {
    const next = cfg.levels[b.towerUpgradeTo];
    if (!next) return;
    b.towerUpgradeProgress = Math.min(1, (b.towerUpgradeProgress || 0) + dt / next.seconds);
    if (b.towerUpgradeProgress < 1 - 1e-9) return;
    // Keep the damage percentage: upgrading is not a free full repair.
    b.hp = Math.min(next.hp, Math.max(0, b.hp / b.maxHp * next.hp));
    b.maxHp = next.hp; b.towerLevel = b.towerUpgradeTo;
    b.towerUpgradeTo = 0; b.towerUpgradeProgress = 0; stats.upgrades++;
    if (b.side === 'france') statusEl.textContent = `${next.label} gereed · niveau ${b.towerLevel}/3.`;
  }
  function ensureUpgradeButton() {
    const b = selectedBuilding;
    let button = actionsEl.querySelector('[data-action="tower-upgrade"]');
    if (!b || b.dead || b.side !== 'france' || b.type !== 'tower' || !b.complete) { button?.remove(); return; }
    if (!button) {
      button = makeDynamicButton('tower-upgrade', '');
      // Snapshots force a HUD refresh. Keep this node alive while a player is
      // pressing it; update its text/state instead of replacing it every packet.
      delete button.dataset.dynamic;
      actionsEl.appendChild(button);
    }
    const level = b.towerLevel || 1, next = cfg.levels[level + 1];
    const html = b.towerUpgradeTo
      ? `Versterken…<br><small>Niveau ${b.towerUpgradeTo}/3 · ${Math.floor(b.towerUpgradeProgress * 100)}%</small>`
      : next ? `Upgrade → niveau ${level + 1}/3<br><small>${costText(next.cost)} · ${next.seconds} s</small>`
        : 'Zwaar versterkte toren<br><small>Niveau 3/3 · maximaal</small>';
    if (button.innerHTML !== html) button.innerHTML = html;
    button.disabled = !!b.towerUpgradeTo || !next || !canAfford('france', next.cost);
    button.title = next ? `${next.label}: ${next.hp} HP, bereik ${next.range}, ${next.shots} schoten van ${next.damage} schade. Kosten: ${costText(next.cost)}. De toren blijft schieten tijdens het versterken.` : 'Hoogste niveau bereikt.';
  }

  // ---- building it ----
  function ensureButton() {
    if (typeof actionsEl === 'undefined' || actionsEl.querySelector('[data-action="build-tower"]')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.action = 'build-tower';
    b.innerHTML = `Schiettoren<br><small>${cfg.cost.wood} 🪵</small>`;
    b.title = 'Verdedigingstoren: schutters vuren op vijanden binnen bereik en zien ver over het veld';
    const farm = actionsEl.querySelector('[data-action="build-farm"]');
    farm ? farm.after(b) : actionsEl.appendChild(b);
  }
  ensureButton();
  if (typeof renderDynamicActions === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderDynamicActionsWithTower(...args) { const r = base.apply(this, args); ensureButton(); ensureUpgradeButton(); return r; };
  }
  actionsEl?.addEventListener('click', e => {
    const upgrade = e.target.closest('button[data-action="tower-upgrade"]');
    if (upgrade && !upgrade.disabled) { upgradeTower(); return; }
    const btn = e.target.closest('button[data-action="build-tower"]');
    if (!btn || btn.disabled) return;
    startBuild('tower');
    if (buildMode === 'tower') statusEl.textContent = `Plaats een schiettoren (${cfg.cost.wood} hout): hij vuurt op vijanden binnen bereik.`;
  });

  // ---- firing ----
  function targetFor(b) {
    let best = null, bestD = levelOf(b).range;
    for (const u of units) {
      if (u.dead || u.side === b.side) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d > bestD) continue;
      if (b.side === 'france' && typeof isVisibleToFrance === 'function' && !isVisibleToFrance(u)) continue;
      best = u; bestD = d;
    }
    return best;
  }
  function volley(b, enemy) {
    const level = levelOf(b);
    for (let i = 0; i < level.shots; i++) {
      // From the loopholes on the side facing the enemy.
      const a = Math.atan2(enemy.y - b.y, enemy.x - b.x) + (i - (level.shots - 1) / 2) * 0.5;
      const x = b.x + Math.cos(a) * b.w * 0.4, y = b.y + Math.sin(a) * b.h * 0.4;
      projectiles.push({ x, y, target: enemy, side: b.side, damage: level.damage, speed: 410, artillery: false, dead: false });
      if (typeof spawnSmoke === 'function') spawnSmoke(x, y, 3);
      stats.shots++;
    }
    b.firedAt = elapsed; b.towerFacing = Math.atan2(enemy.y - b.y, enemy.x - b.x); stats.volleys++;
  }
  const baseUpdateBuildings = updateBuildings;
  updateBuildings = function updateBuildingsWithTowers(dt) {
    baseUpdateBuildings(dt);
    for (const b of buildings) {
      if (b.dead || b.type !== 'tower' || !b.complete) continue;
      upgradeWork(b, dt);
      b.towerReload = (b.towerReload ?? 0) - dt;
      if (b.towerReload > 0) continue;
      const enemy = targetFor(b);
      if (!enemy) { b.towerReload = 0.4; continue; }
      volley(b, enemy);
      b.towerReload = levelOf(b).reload * (0.9 + Math.random() * 0.2);
    }
    aiTowers();
  };

  // ---- sight: the garrison sees far from up there ----
  if (typeof visionRadius === 'function') {
    const base = visionRadius;
    visionRadius = function visionRadiusWithTowers(e) { return e?.kind === 'building' && e.type === 'tower' ? levelOf(e).vision : base(e); };
  }

  // ---- the British build theirs towards the French ----
  if (typeof findBuildLocation === 'function') {
    const base = findBuildLocation;
    findBuildLocation = function findBuildLocationWithTowers(side, type, index = 0) {
      if (type !== 'tower') return base(side, type, index);
      const tc = livingBuildings(side).find(b => b.type === 'towncenter'); if (!tc) return null;
      // On arcs in front of the town centre, towards the enemy, further out each round.
      const fan = [0, 0.5, -0.5, 1.0, -1.0, 0.25, -0.25, 0.75, -0.75], a = (sideDir(side) > 0 ? 0 : Math.PI) + fan[index % fan.length];
      const r = 250 + 60 * Math.floor(index / fan.length) + (index % 2) * 30;
      const x = tc.x + Math.cos(a) * r, y = tc.y + Math.sin(a) * r;
      // Off roads, the river and village yards: the nearest free spot round it.
      for (let ring = 0; ring <= 8; ring++) for (let k = 0; k < (ring ? 16 : 1); k++) {
        const px = x + Math.cos(k / 16 * Math.PI * 2) * ring * 24, py = y + Math.sin(k / 16 * Math.PI * 2) * ring * 24;
        if (validBuildingSpot('tower', px, py)) return { x: px, y: py };
      }
      return { x, y };
    };
  }
  // Checked from the building update (every few seconds) rather than by
  // wrapping aiDevelop, which later AI layers replace outright.
  let aiCheckAt = 0;
  function aiTowers() {
    if (gameOver || elapsed < cfg.aiAfter || elapsed < aiCheckAt) return;
    aiCheckAt = elapsed + 5;
    const own = towers('britain');
    if (own.length >= cfg.aiMax || own.some(b => !b.complete) || economies.britain.wood < cfg.cost.wood + 120) return;
    if (typeof aiBuild === 'function' && aiBuild('tower')) stats.aiBuilt++;
    else stats.aiBlocked = typeof AI_PRODUCTION_STATE !== 'undefined' ? AI_PRODUCTION_STATE.lastBlocked : 'no-aiBuild';
  }

  const api = Object.freeze({
    version: '1.1', config: cfg, towers, levelOf, upgradeTower,
    stats: () => ({ ...stats, french: towers('france').length, british: towers('britain').length, finished: towers().filter(b => b.complete).length })
  });
  root.__WATCHTOWER_V1__ = api;
  root.NRTS?.subsystems?.register?.('watchtower-v1', api, { phase: 'combat', legacyBridge: false,
    responsibility: 'buildable musketry tower: garrison volleys at the nearest enemy, long sight, British towers towards the French' });
})(window);
