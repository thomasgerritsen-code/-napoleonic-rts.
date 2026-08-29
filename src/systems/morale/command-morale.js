'use strict';
(function installMoraleCommandV2(global){
  const nrts=global.NRTS;if(!nrts)throw new Error('NRTS required');
  const queued=[];
  const statusFor=m=>m>75?'STEADY':m>50?'SHAKEN':m>25?'WAVERING':'ROUTING';
  function officerFor(reg){return regimentMembers(reg).find(u=>u.id===reg.officerId&&!u.dead&&!u.routing)||null;}
  function commandBonus(reg){const c=centroid(regimentMembers(reg));let best=Infinity;for(const o of livingUnits(reg.side).filter(u=>u.type==='officer'&&!u.routing)){best=Math.min(best,Math.hypot(o.x-c.x,o.y-c.y));}return best<=260?1:best<=430?.5:0;}
  const oldRefresh=refreshRegiment;
  refreshRegiment=function(reg){oldRefresh(reg);if(!reg||reg.destroyed)return;reg.disciplineStatusV2=statusFor(reg.morale);reg.commandBonusV2=commandBonus(reg);const members=regimentMembers(reg);const c=centroid(members);const routed=livingUnits(reg.side).filter(u=>u.routing&&Math.hypot(u.x-c.x,u.y-c.y)<150).length;if(routed)members.forEach(u=>u.morale=Math.max(0,u.morale-routed*.025));};
  const oldIssue=issueMove;
  issueMove=function(x,y){const regs=selectedRegiments();if(!regs.length)return oldIssue(x,y);const tc=livingBuildings('france').find(b=>b.type==='towncenter');const c=centroid(regs.flatMap(regimentMembers));const distance=tc?Math.hypot(c.x-tc.x,c.y-tc.y):0;const bonus=Math.max(...regs.map(commandBonus));const delay=Math.max(.35,.75+distance/1100-bonus*.35);queued.push({executeAt:elapsed+delay,x,y,ids:regs.map(r=>r.id),formation:currentFormation});statusEl.textContent=`Order onderweg (${delay.toFixed(1)} s)`;};
  const oldUpdate=update;
  update=function(dt){oldUpdate(dt);for(let i=queued.length-1;i>=0;i--){const q=queued[i];if(elapsed<q.executeAt)continue;for(const id of q.ids){const reg=getRegiment(id);if(reg&&!reg.destroyed)arrangeRegiment(reg,q.x,q.y,reg.formation||q.formation);}queued.splice(i,1);}};
  const api=Object.freeze({statusFor,commandBonus,pending:()=>queued.map(q=>({...q})),commandRadius:260});
  nrts.subsystems.register('morale-command',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'discipline states, local officer command radius and delayed battalion orders'});
  global.__MORALE_COMMAND_V2__=api;
})(window);
