'use strict';
(function installOfficerAssignment(root) {
  if (!root.NRTS_CONFIG?.troops) return;
  if (document.readyState !== 'complete') { addEventListener('load',()=>installOfficerAssignment(root),{once:true}); return; }
  function selection() {
    const regs=selectedRegiments().filter(r=>!r.destroyed&&r.side==='france');
    const officers=[...selectedUnits].filter(u=>!u.dead&&!u.routing&&!u.regimentId&&u.side==='france'&&u.type==='officer');
    const reg=regs.length===1?regs[0]:null,officer=officers.length===1?officers[0]:null;
    const kind=reg?groupKindV06(reg):null;
    return{reg,officer,show:regs.length===1&&officers.length>0,ok:!!(reg&&officer&&officerCanLead(officer,kind)),kind};
  }
  function assign() {
    if (root.__COMMAND_GATEWAY_V1__) return root.__COMMAND_GATEWAY_V1__.run('assign-officer', {}, applyAssignment);
    return applyAssignment();
  }
  function applyAssignment() {
    const s=selection();
    if(!s.ok){statusEl.textContent=s.kind==='cavalry'?'Cavalerie heeft één vrije officier te paard nodig.':'Infanterie heeft één vrije officier te voet nodig.';return false;}
    const {reg,officer}=s,old=units.find(u=>u.id===reg.officerId);
    const target={x:old?.targetX??reg.targetX,y:old?.targetY??reg.targetY};
    reg.memberIds=reg.memberIds.filter(id=>id!==reg.officerId);
    if(old){old.regimentId=null;old.task=null;old.targetX=old.x;old.targetY=old.y;old.localAvoidanceV2=null;}
    reg.officerId=officer.id;reg.memberIds.push(officer.id);reg.officerLost=false;
    officer.regimentId=reg.id;officer.task=null;officer.resourceTarget=null;
    officer.targetX=target.x;officer.targetY=target.y;officer.localAvoidanceV2=null;
    refreshRegiment(reg);selectWholeRegiment(reg);actionSignature='';updateHud(true);
    statusEl.textContent=`${s.kind==='cavalry'?'Officier te paard':'Officier te voet'} toegewezen aan ${reg.name}.`;
    return true;
  }
  const base=renderDynamicActions;
  renderDynamicActions=function renderOfficerAssignment(...args){
    base.apply(this,args);const s=selection();
    actionsEl.querySelector('[data-action="assign-officer"]')?.remove();
    if(s.show){const b=makeDynamicButton('assign-officer','Officier aanwijzen',!s.ok);
      b.title=s.ok?'Wijs deze officier toe; de huidige officier wordt vrijgemaakt.':s.kind==='cavalry'?'Selecteer één vrije officier te paard uit de stal.':'Selecteer één vrije officier te voet uit de kazerne.';
      actionsEl.appendChild(b);}
  };
  actionsEl.addEventListener('click',e=>{const b=e.target.closest('[data-action="assign-officer"]');if(b&&!b.disabled)assign();});
  // Recruit the right commander even when no randomly mounted British officer is available.
  const baseCavAI=aiTryCavalryRegimentV06;
  aiTryCavalryRegimentV06=function formBritishMountedRegiment(){
    const cav=freeUnits('britain','cavalry'),mounted=freeUnits('britain','officer').find(u=>officerCanLead(u,'cavalry'));
    if(cav.length<4||mounted)return baseCavAI();
    if(buildings.some(b=>!b.dead&&b.side==='britain'&&b.queue?.some(q=>q.troop==='mounted')))return null;
    const stable=buildings.find(b=>!b.dead&&b.complete&&b.side==='britain'&&b.type==='stable'&&b.queue.length<2);
    const cost=root.__TROOPS_V1__.costOf('mounted');
    if(stable&&canAfford('britain',cost)&&populationUsed('britain')+TYPES.officer.pop<=economies.britain.popCap){
      pay('britain',cost);stable.queue.push({type:'officer',troop:'mounted',label:'Officier te paard',time:TRAINING.officer.time*(root.NRTS_CONFIG.troops.kinds.mounted.time||1)});
      aiPlan='Officier te paard trainen voor cavalerie';
    }
    return null;
  };
  root.__OFFICER_ASSIGNMENT_V1__=Object.freeze({assign,selection:()=>{const s=selection();return{regimentId:s.reg?.id,officerId:s.officer?.id,kind:s.kind,ok:s.ok};}});
})(window);
