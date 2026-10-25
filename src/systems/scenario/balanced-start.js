'use strict';
(function installBalancedStart(root) {
  const cfg = root.NRTS_CONFIG?.balancedStart;
  if (!cfg || root.__BALANCED_START__) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installBalancedStart(root), {once:true}); return; }
  function applyStart() {
    units.length = regiments.length = projectiles.length = particles.length = 0;
    selectedUnits.clear(); selectedBuilding = null;
    for (const side of ['france','britain']) {
      const home = buildings.find(b => !b.dead && b.side === side && b.type === 'towncenter');
      if (!home) continue;
      Object.assign(economies[side], {food:cfg.food, wood:cfg.wood, iron:cfg.iron});
      const dir = side === 'france' ? 1 : -1;
      function add(type, dx, dy, mounted = false) {
        const p = root.__VILLAGE_NAVIGATION_V7__?.nearestOpenPoint({x:home.x + dir * dx, y:home.y + dir * dy}, type) || {x:home.x + dir * dx, y:home.y + dir * dy};
        const u = createUnit(side, type, p.x, p.y);
        if (mounted) root.__TROOPS_V1__.applyTroop(u, 'mounted');
        return u;
      }
      for (let i=0;i<cfg.workers;i++) add('worker', 105 + i%3*24, -70 + Math.floor(i/3)*28);
      for (let i=0;i<cfg.infantry;i++) add('infantry', 160 + i%6*20, 110 + Math.floor(i/6)*20);
      add('officer', 210, 70); add('drummer', 180, 70);
      for (let i=0;i<cfg.cavalry;i++) add('cavalry', 110 + i*28, 230);
      add('officer', 220, 200, true);
      recalcPopCap(side);
    }
    // Online humans both start idle. Singleplayer's opponent chooses its work.
    if (!root.__NRTS_SERVER__ && !root.__NRTS_HUMAN_BRITAIN__) autoAssignAIWorkers();
    root.__VISION_EPOCH__ = (root.__VISION_EPOCH__ || 0) + 1;
    root.__LARGE_ARMY_PERFORMANCE_V1__?.prepareFrameIndexes();
    actionSignature = ''; updateHud(true);
  }
  const base = resetGame;
  resetGame = function resetGameWithBalancedStart(...args) { const result = base.apply(this,args); applyStart(); return result; };
  applyStart();
  root.__BALANCED_START__ = Object.freeze({config:cfg});
  root.NRTS?.subsystems?.register?.('balanced-start', root.__BALANCED_START__, {phase:'scenario',legacyBridge:false,
    responsibility:'equal starting supplies and infantry/cavalry-ready armies on the playable map'});
})(window);
