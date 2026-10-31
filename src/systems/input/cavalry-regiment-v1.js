'use strict';
// Match the foot officer's one-click formation flow, using mounted staff only.
(function installCavalryRegiment(root){
  if(!root.NRTS_CONFIG?.troops)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installCavalryRegiment(root),{once:true});return;}
  const REACH=320,MIN=4,MAX=12;
  const kindOf=u=>root.__TROOPS_V1__.kindOf(u);
  const loose=u=>u&&!u.dead&&!u.routing&&!u.regimentId&&u.side==='france';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function stable(){const b=selectedBuilding;return b&&!b.dead&&b.complete&&b.side==='france'&&b.type==='stable'?b:null;}
  function plan(chosen=[...selectedUnits],building=null){
    const selected=chosen.filter(loose),officers=selected.filter(u=>u.type==='officer');
    const picked=selected.filter(u=>u.type==='cavalry');
    const mounted=officers.filter(u=>officerCanLead(u,'cavalry'));
    if(!building&&!picked.length&&!mounted.length)return null;
    const anchor=building?{x:building.rallyX??building.x,y:building.rallyY??building.y}:mounted[0]||centroid(picked);
    const near=type=>freeUnits('france',type).filter(u=>distance(u,anchor)<=REACH).sort((a,b)=>distance(a,anchor)-distance(b,anchor)||a.id-b.id);
    const around=near('cavalry'),kind=root.__TROOPS_V1__.mainKind(picked.length?picked:around);
    const riders=[...picked.filter(u=>kindOf(u)===kind),...around.filter(u=>kindOf(u)===kind&&!picked.includes(u))].slice(0,MAX);
    // An explicitly selected foot officer must never silently become cavalry staff.
    const officer=officers.length?mounted.length===1?mounted[0]:null:near('officer').find(u=>officerCanLead(u,'cavalry'))||null;
    return{anchor,riders,officer,kind,missing:Math.max(0,MIN-riders.length),ok:riders.length>=MIN&&!!officer};
  }
  function form(p){
    if(!p?.ok){statusEl.textContent='Cavalerie vereist minstens 4 ruiters van hetzelfde type en één vrije officier te paard binnen 320 meter.';return null;}
    const reg=createCavalryRegimentV06('france',[...p.riders,p.officer]);
    if(reg){selectWholeRegiment(reg);actionSignature='';updateHud(true);statusEl.textContent=`${reg.name} gevormd: ${p.riders.length} ruiters en een officier te paard.`;}
    return reg;
  }
  makePlayerCavalryRegimentV06=function makeMountedPlayerRegiment(){return form(plan());};
  function trainMissing(){
    const b=stable();if(!b)return false;
    const p=plan([],b);let count=0;
    if(!p.officer&&!b.queue.some(q=>q.troop==='mounted')&&root.__TROOPS_V1__.trainTroop('mounted',b))count++;
    const queued=b.queue.filter(q=>q.type==='cavalry'&&(q.troop||'')===p.kind).length;
    for(let i=queued;i<p.missing;i++){
      if(p.kind?root.__TROOPS_V1__.trainTroop(p.kind,b):queueUnitForBuilding('france',b,'cavalry'))count++;
    }
    actionSignature='';updateHud(true);statusEl.textContent=count?`${count} eenheden in opleiding. Kies daarna de officier te paard en maak het regiment.`:'Niets toegevoegd: controleer grondstoffen en bevolkingsruimte.';
    return count;
  }
  const baseRender=renderDynamicActions;
  renderDynamicActions=function renderMountedRegiment(...args){
    baseRender.apply(this,args);
    const b=stable(),p=plan(b?[]:[...selectedUnits],b);if(!p)return;
    if(!b&&[...selectedUnits].every(u=>u.type==='cavalry'||officerCanLead(u,'cavalry')))actionsEl.querySelector('[data-action="create-regiment"]')?.remove();
    const action=b?'quick-cavalry-stable':'create-cavalry-regiment';
    let button=actionsEl.querySelector(`[data-action="${action}"]`);
    if(!button){button=makeDynamicButton(action,'');actionsEl.appendChild(button);}
    button.innerHTML=`Paardenregiment maken<br><small>${p.riders.length}/4 ruiters · officier te paard ${p.officer?'✓':'✗'}</small>`;
    button.disabled=!p.ok;
    button.title='Verzamelt minstens 4 nabije vrije ruiters van hetzelfde type en één officier te paard. Geen tamboer nodig.';
    if(b&&!p.ok&&!actionsEl.querySelector('[data-action="train-cavalry-missing"]'))actionsEl.appendChild(makeDynamicButton('train-cavalry-missing','Train ontbrekende cavalerie'));
  };
  actionsEl.addEventListener('click',e=>{
    const button=e.target.closest('button[data-action]');if(!button||button.disabled)return;
    const action=button.dataset.action;if(!['quick-cavalry-stable','train-cavalry-missing'].includes(action))return;
    const execute=()=>action==='quick-cavalry-stable'?form(plan([],stable())):trainMissing();
    if(root.__COMMAND_GATEWAY_V1__)root.__COMMAND_GATEWAY_V1__.run('action',{action},execute,stable());else execute();
  });
  // Refresh counts when riders finish training, leave range or join another group.
  let lastRefresh=-Infinity;
  const baseHud=updateHud;
  updateHud=function updateMountedHud(...args){if(elapsed<lastRefresh||elapsed-lastRefresh>=1){lastRefresh=elapsed;if(stable()||[...selectedUnits].some(u=>loose(u)&&(u.type==='cavalry'||officerCanLead(u,'cavalry'))))actionSignature='';}return baseHud.apply(this,args);};
  root.__CAVALRY_REGIMENT_V1__=Object.freeze({plan,reach:REACH,minimum:MIN});
})(window);
