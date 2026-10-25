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
      const layout=[];
      const add=(type,dx,dy,mounted=false)=>layout.push({type,dx:dir*dx,dy:dir*dy,mounted});
      for(let i=0;i<cfg.workers;i++)add('worker',105+i%3*24,-70+Math.floor(i/3)*28);
      for(let i=0;i<cfg.infantry;i++)add('infantry',160+i%6*20,110+Math.floor(i/6)*20);
      add('officer',210,70);add('drummer',180,70);
      for(let i=0;i<cfg.cavalry;i++)add('cavalry',110+i*28,230);
      add('officer',220,200,true);
      const anchor=root.__UNIT_PLACEMENT__.formation(home,layout);
      if(!anchor)throw Error('Geen vrije startplek voor '+side);
      for(const slot of layout){
        const u=createUnit(side,slot.type,anchor.x+slot.dx,anchor.y+slot.dy);
        if(slot.mounted)root.__TROOPS_V1__.applyTroop(u,'mounted');
      }
      recalcPopCap(side);
    }
    // Online humans both start idle. Singleplayer's opponent chooses its work.
    if (!root.__NRTS_SERVER__ && !root.__NRTS_HUMAN_BRITAIN__) autoAssignAIWorkers();
    root.__VISION_EPOCH__ = (root.__VISION_EPOCH__ || 0) + 1;
    root.__LARGE_ARMY_PERFORMANCE_V1__?.prepareFrameIndexes();
    const local=units.filter(u=>u.side==='france');
    if(local.length){const center=centroid(local);camera.x=center.x;camera.y=center.y;clampCamera();}
    actionSignature = ''; updateHud(true);
  }
  const base = resetGame;
  resetGame = function resetGameWithBalancedStart(...args) { const result = base.apply(this,args); applyStart(); return result; };
  applyStart();
  root.__BALANCED_START__ = Object.freeze({config:cfg});
  root.NRTS?.subsystems?.register?.('balanced-start', root.__BALANCED_START__, {phase:'scenario',legacyBridge:false,
    responsibility:'equal starting supplies and infantry/cavalry-ready armies on the playable map'});
})(window);
