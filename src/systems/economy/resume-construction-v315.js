'use strict';
// v315: a movement order may interrupt an existing construction job. Resuming
// that same unfinished building never creates another building or pays twice.
(function installResumeConstructionV315(root){
  if(root.__RESUME_CONSTRUCTION_V315__)return;

  function unfinishedFriendlyBuilding(b){
    return !!b && b.kind==='building' && b.side==='france' &&
      !b.dead && !b.complete && buildings.includes(b);
  }
  function activeBuilders(b){
    return units.filter(u=>!u.dead && u.type==='worker'&&u.side===b.side &&
      u.task==='build'&&u.buildingTarget===b);
  }
  function availableBuilders(b){
    if(!unfinishedFriendlyBuilding(b))return [];
    return livingUnits(b.side).filter(u=>u.type==='worker' &&
      !(u.task==='build' && u.buildingTarget!==b));
  }
  const originalConstructBuilding=constructBuilding;
  constructBuilding=function constructBuildingRememberBuilders(side,type,x,y,workers){
    const b=originalConstructBuilding(side,type,x,y,workers);
    if(b)for(const u of workers){
      if(u && !u.dead && u.type==='worker' && u.side===b.side &&
         u.task==='build' && u.buildingTarget===b){
        u.lastConstructionId=b.id;
      }
    }
    return b;
  };
  function sendWorkersToBuild(b,workers){
    if(!unfinishedFriendlyBuilding(b))return 0;
    let count=0;
    for(const u of workers){
      if(!u || u.dead || u.type!=='worker' || u.side!==b.side)continue;
      if(u.task==='build' && u.buildingTarget===b)continue;
      u.task='build';
      u.buildingTarget=b;
      u.lastConstructionId=b.id;
      u.resourceTarget=null;
      u.returnResource=null;
      u.farmId=null;
      u.resourceExhaustedStop=false;
      u.preferredResourceType=null;
      u.gatherClock=0;
      // The actual construction routine handles walking up to the building.
      u.targetX=b.x;u.targetY=b.y;
      u.arrivedAtTarget=false;
      count++;
    }
    if(count){
      actionSignature='';
      statusEl.textContent=`${count} boer${count===1?'':'en'} hervat${count===1?'':'ten'} bouw van ${BUILDINGS[b.type]?.label||'gebouw'} · ${Math.floor(b.construction*100)}% gereed.`;
      updateHud(true);
    }
    return count;
  }
  function sendSelectedWorkersToBuild(b){
    const workers=[...selectedUnits].filter(u=>u.type==='worker' && !u.dead && u.side==='france');
    return sendWorkersToBuild(b,workers);
  }
  function resumePreviouslyAssignedBuilders(b){
    if(!unfinishedFriendlyBuilding(b))return 0;
    const available=availableBuilders(b);
    const original=available.filter(u=>u.lastConstructionId===b.id &&
      !(u.task==='build'&&u.buildingTarget===b));
    // Prefer the workers who were interrupted. If they're gone, choose one
    // nearby worker who is not occupied with another building.
    const workers=original.length ? original
      : available.filter(u=>u.task!=='build')
        .sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y)).slice(0,1);
    const resumed=sendWorkersToBuild(b,workers);
    if(!resumed){
      statusEl.textContent=activeBuilders(b).length
        ? 'Er wordt al aan dit gebouw gewerkt.'
        : 'Geen beschikbare boeren om de bouw te hervatten.';
    }
    return resumed;
  }
  // Desktop: browsers may swallow the contextmenu event after another game's
  // right-mouse gesture listener has handled pointer release. Handle a simple
  // right-button release as well; the existing right-drag implementation stops
  // propagation for a genuine facing drag, so those orders remain untouched.
  function resumeAtPointer(event){
    if(buildMode)return false;
    const point=screenToWorld(event.clientX,event.clientY);
    const b=buildingAt(point.x,point.y,'france');
    if(!unfinishedFriendlyBuilding(b))return false;
    if(![...selectedUnits].some(u=>u.type==='worker'&&!u.dead&&u.side==='france'))return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendSelectedWorkersToBuild(b);
    return true;
  }
  canvas.addEventListener('mouseup',event=>{
    if(event.button===2)resumeAtPointer(event);
  },true);
  // Contextmenu remains a fallback for platforms that do not dispatch mouseup.
  canvas.addEventListener('contextmenu',event=>{
    if(buildMode)return;
    const point=screenToWorld(event.clientX,event.clientY);
    const b=buildingAt(point.x,point.y,'france');
    if(!unfinishedFriendlyBuilding(b))return;
    if(![...selectedUnits].some(u=>u.type==='worker'&&!u.dead&&u.side==='france'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendSelectedWorkersToBuild(b);
  },true);

  // Works on desktop and mobile: selecting an unfinished building exposes an
  // explicit, no-cost Resume construction action, even after deselecting workers.
  const previousRenderActions=renderDynamicActions;
  renderDynamicActions=function renderConstructionResumeActions(force=false){
    previousRenderActions(force);
    const old=actionsEl.querySelector('[data-action="resume-construction"]');
    const b=selectedBuilding;
    if(!unfinishedFriendlyBuilding(b)){old?.remove();return;}
    if(old)return;
    const btn=makeDynamicButton('resume-construction',
      'Hervat bouw<br><small>bestaande bouwplaats · geen extra kosten</small>',
      !availableBuilders(b).length);
    btn.title='Stuur de oorspronkelijke boer terug naar dit gebouw; als die niet beschikbaar is, een andere vrije boer.';
    actionsEl.prepend(btn);
  };
  actionsEl.addEventListener('click',event=>{
    const btn=event.target.closest('button[data-action="resume-construction"]');
    if(!btn || btn.disabled || !unfinishedFriendlyBuilding(selectedBuilding))return;
    resumePreviouslyAssignedBuilders(selectedBuilding);
  });
  const api=Object.freeze({
    version:'315.0',resumeSelected:sendSelectedWorkersToBuild,
    resumePrevious:resumePreviouslyAssignedBuilders,
    resumeWorkers:sendWorkersToBuild,
    unfinished:unfinishedFriendlyBuilding,
    activeBuilderCount:b=>unfinishedFriendlyBuilding(b)?activeBuilders(b).length:0
  });
  root.__RESUME_CONSTRUCTION_V315__=api;
  root.NRTS?.subsystems?.register?.('resume-construction-v315',api,{
    phase:'gameplay',legacyBridge:false,
    responsibility:'reassign interrupted workers to an existing uncompleted building without repaying construction costs'
  });
})(window);
