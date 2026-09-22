'use strict';
// ---------- Architecture v2: AI Commander v1 ----------
// Production remains owned by ai/production.js. This file only decides military intent.

const AI_COMMANDER_V1 = {
  state:'DEFEND', previousState:null, stateSince:0, cycle:0, wave:0,
  flankSide:1, retreatUntil:0, target:null, regroupPoint:null,
  threatDistance:null, reserveRegimentId:null
};
const AI_TARGET_RETENTION_MARGIN=90;

function aiClamp01(v){ return Math.max(0,Math.min(1,v)); }
function aiBritishTC(){ return livingBuildings('britain').find(b=>b.type==='towncenter'&&b.complete); }
function aiFrenchTC(){ return livingBuildings('france').find(b=>b.type==='towncenter'&&b.complete); }
function aiCombatUnits(side){ return livingUnits(side).filter(u=>u.type!=='worker'&&!u.routing); }
function aiRegs(){ return activeRegiments('britain').filter(r=>regimentMembers(r).length); }
function aiRegCenter(reg){ const m=regimentMembers(reg); return m.length?centroid(m):{x:0,y:0}; }
function aiRegStrength(reg){
  return regimentMembers(reg).reduce((sum,u)=>{
    const w=u.type==='artillery'?3:u.type==='cavalry'?1.8:u.type==='officer'?1.35:1;
    return sum+w*aiClamp01(u.hp/Math.max(1,u.maxHp))*aiClamp01((u.morale??100)/100);
  },0);
}

function aiSideStrength(side){
  return aiCombatUnits(side).reduce((sum,u)=>{
    const w=u.type==='artillery'?3:u.type==='cavalry'?1.8:u.type==='officer'?1.35:1;
    return sum+w*aiClamp01(u.hp/Math.max(1,u.maxHp))*aiClamp01((u.morale??100)/100);
  },0);
}
function aiMeanMorale(regs){
  let sum=0,n=0; for(const r of regs) for(const u of regimentMembers(r)){ if(u.dead)continue; sum+=u.morale??100;n++; }
  return n?sum/n:100;
}
function aiDirection(a,b){ const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1; return{x:dx/l,y:dy/l,angle:Math.atan2(dy,dx)}; }
function aiOffset(p,d,forward,lateral=0){ return{x:p.x+d.x*forward-d.y*lateral,y:p.y+d.y*forward+d.x*lateral}; }
function aiOrderReg(reg,p,formation='line',facing=null){
  if(!reg||reg.destroyed)return;
  if(typeof orderGroupPathV06==='function') orderGroupPathV06(reg,p.x,p.y,formation,facing);
  else arrangeRegiment(reg,p.x,p.y,formation);
}
function aiTransition(next){
  if(AI_COMMANDER_V1.state===next)return;
  AI_COMMANDER_V1.previousState=AI_COMMANDER_V1.state;
  AI_COMMANDER_V1.state=next; AI_COMMANDER_V1.stateSince=elapsed;
  if(next==='ATTACK')AI_COMMANDER_V1.wave++;
  if(next==='FLANK')AI_COMMANDER_V1.flankSide*=-1;
}
function aiNearestEnemyTo(point){
  let best=null;
  for(const u of aiCombatUnits('france')){
    const d=Math.hypot(u.x-point.x,u.y-point.y);
    if(!best||d<best.distance)best={x:u.x,y:u.y,distance:d,id:u.id,type:u.type};
  }
  return best;
}
function aiStrategicTarget(){
  const base=aiBritishTC()||{x:2640,y:900};
  const enemyRegs=activeRegiments('france').filter(r=>regimentMembers(r).length);
  let best=null,incumbent=null;
  for(const r of enemyRegs){
    const c=aiRegCenter(r),members=regimentMembers(r),d=Math.hypot(c.x-base.x,c.y-base.y);
    const strength=aiRegStrength(r),maxStrength=Math.max(1,members.length);
    const condition=aiClamp01(strength/maxStrength);
    // Prefer threats near the British base, but opportunistically punish weakened formations.
    const score=d*(0.72+condition*0.28)-Math.max(0,1-condition)*260;
    const candidate={...c,d,score,strength,condition,kind:'regiment',id:r.id};
    if(r.id===AI_COMMANDER_V1.target?.id)incumbent=candidate;
    if(!best||score<best.score)best=candidate;
  }
  // Keep a valid near-equal objective so tiny score changes do not redirect the army
  // between neighbouring enemy regiments on consecutive commander ticks.
  if(incumbent&&best&&incumbent.score<=best.score+AI_TARGET_RETENTION_MARGIN)return incumbent;
  if(best)return best;
  const tc=aiFrenchTC(); return tc?{x:tc.x,y:tc.y,kind:'towncenter',id:tc.id,score:0}:{x:650,y:900,kind:'fallback',score:0};
}
function aiBaseThreatened(){
  const tc=aiBritishTC(); if(!tc){AI_COMMANDER_V1.threatDistance=null;return false;}
  const threat=aiNearestEnemyTo(tc); AI_COMMANDER_V1.threatDistance=threat?.distance??null;
  return Boolean(threat&&threat.distance<620);
}
function aiChooseState(regs){
  const own=aiSideStrength('britain'),enemy=aiSideStrength('france'),ratio=own/Math.max(1,enemy);
  const morale=aiMeanMorale(regs),age=elapsed-AI_COMMANDER_V1.stateSince;
  if(aiBaseThreatened()&&AI_COMMANDER_V1.state!=='RETREAT')return'DEFEND';
  if((morale<37||ratio<.48)&&AI_COMMANDER_V1.state!=='RETREAT'){
    AI_COMMANDER_V1.retreatUntil=elapsed+15; return'RETREAT';
  }
  if(AI_COMMANDER_V1.state==='RETREAT')return elapsed<AI_COMMANDER_V1.retreatUntil?'RETREAT':'REGROUP';
  if(AI_COMMANDER_V1.state==='REGROUP')return morale>62&&age>8?(regs.length>=2?'MASS':'DEFEND'):'REGROUP';
  if(elapsed<35||regs.length<2)return'DEFEND';
  if(AI_COMMANDER_V1.state==='DEFEND')return'MASS';
  if(AI_COMMANDER_V1.state==='MASS')return age>9?'ADVANCE':'MASS';
  if(AI_COMMANDER_V1.state==='ADVANCE')return age>12?'ATTACK':'ADVANCE';
  if(AI_COMMANDER_V1.state==='ATTACK'){
    if(age>18&&livingUnits('britain').some(u=>u.type==='cavalry'&&!u.routing))return'FLANK';
    return age>28?'REGROUP':'ATTACK';
  }
  if(AI_COMMANDER_V1.state==='FLANK')return age>13?'ATTACK':'FLANK';
  return'DEFEND';
}

function aiDefend(regs,tc,target){
  if(!tc)return;
  const threat=aiNearestEnemyTo(tc),anchor=threat||target,d=aiDirection(tc,anchor);
  const threatDistance=threat?.distance??900;
  const depth=threatDistance<300?95:threatDistance<450?150:230;
  regs.forEach((r,i)=>aiOrderReg(r,aiOffset(tc,d,-depth,(i-(regs.length-1)/2)*125),'line',d.angle));
  const art=livingUnits('britain').filter(u=>u.type==='artillery'&&!u.routing);
  if(art.length)commandLooseFormation(art,tc.x-d.x*(depth+120),tc.y-d.y*(depth+120),'line');
  aiPlan=`Commandant: verdedigt basis · dreiging ${Math.round(threatDistance)}m`;
}
function aiMass(regs,tc,target){
  if(!tc)return; const d=aiDirection(tc,target),rally=aiOffset(tc,d,300); AI_COMMANDER_V1.regroupPoint=rally;
  regs.forEach((r,i)=>aiOrderReg(r,aiOffset(rally,d,0,(i-(regs.length-1)/2)*115),'column',d.angle));
  const art=livingUnits('britain').filter(u=>u.type==='artillery'&&!u.routing);
  if(art.length){const p=aiOffset(rally,d,-170);commandLooseFormation(art,p.x,p.y,'line');}
  aiPlan=`Commandant: verzamelt aanvalsgolf ${AI_COMMANDER_V1.wave+1}`;
}
function aiAdvance(regs,tc,target){
  const origin=tc||aiRegCenter(regs[0]),d=aiDirection(origin,target),stage=aiOffset(target,d,-520);
  regs.forEach((r,i)=>aiOrderReg(r,aiOffset(stage,d,-i*45,(i-(regs.length-1)/2)*120),'column',d.angle));
  const art=livingUnits('britain').filter(u=>u.type==='artillery'&&!u.routing);
  if(art.length){const p=aiOffset(target,d,-690,130);commandLooseFormation(art,p.x,p.y,'line');}
  aiPlan='Commandant: leger rukt in marsorde op';
}
function aiAttack(regs,tc,target){
  const origin=tc||aiRegCenter(regs[0]),d=aiDirection(origin,target);
  const useReserve=regs.length>=3;
  const lineRegs=useReserve?regs.slice(0,-1):regs;
  const reserve=useReserve?regs[regs.length-1]:null;
  AI_COMMANDER_V1.reserveRegimentId=reserve?.id??null;
  lineRegs.forEach((r,i)=>aiOrderReg(r,aiOffset(target,d,-145,(i-(lineRegs.length-1)/2)*135),'line',d.angle));
  if(reserve){
    const rp=aiOffset(target,d,-360,-AI_COMMANDER_V1.flankSide*155);
    aiOrderReg(reserve,rp,'column',d.angle);
  }
  const cav=livingUnits('britain').filter(u=>u.type==='cavalry'&&!u.routing);
  if(cav.length){const p=aiOffset(target,d,-35,AI_COMMANDER_V1.flankSide*280);commandLooseFormation(cav,p.x,p.y,'column');cav.forEach(u=>u.chargeTimer=Math.max(u.chargeTimer||0,5));}
  const art=livingUnits('britain').filter(u=>u.type==='artillery'&&!u.routing);
  if(art.length){const p=aiOffset(target,d,-390,-AI_COMMANDER_V1.flankSide*80);commandLooseFormation(art,p.x,p.y,'line');}
  aiPlan=`Commandant: aanvalsgolf ${Math.max(1,AI_COMMANDER_V1.wave)} · ${reserve?'reserve gehouden':'volle linie'}`;
}
function aiFlank(regs,tc,target){
  const origin=tc||aiRegCenter(regs[0]),d=aiDirection(origin,target);
  const reserveId=AI_COMMANDER_V1.reserveRegimentId;
  let reserve=reserveId?regs.find(r=>r.id===reserveId):null;
  if(!reserve&&regs.length>=2)reserve=regs[regs.length-1];
  const main=reserve?regs.filter(r=>r!==reserve):regs;
  main.forEach((r,i)=>aiOrderReg(r,aiOffset(target,d,-165,(i-(main.length-1)/2)*130),'line',d.angle));
  if(reserve)aiOrderReg(reserve,aiOffset(target,d,-250,AI_COMMANDER_V1.flankSide*330),'column',d.angle+AI_COMMANDER_V1.flankSide*.55);
  const cav=livingUnits('britain').filter(u=>u.type==='cavalry'&&!u.routing);
  if(cav.length){const p=aiOffset(target,d,35,AI_COMMANDER_V1.flankSide*390);commandLooseFormation(cav,p.x,p.y,'column');cav.forEach(u=>u.chargeTimer=Math.max(u.chargeTimer||0,8));}
  aiPlan=`Commandant: ${AI_COMMANDER_V1.flankSide>0?'rechter':'linker'} flankaanval${reserve?' met reserve':''}`;
}
function aiRetreat(regs,tc,target){
  if(!tc)return; const d=aiDirection(target,tc),safe=aiOffset(tc,d,-120);
  AI_COMMANDER_V1.reserveRegimentId=null;
  regs.forEach((r,i)=>aiOrderReg(r,aiOffset(safe,d,i*35,(i-(regs.length-1)/2)*100),'column',d.angle));
  const mobile=livingUnits('britain').filter(u=>['cavalry','artillery'].includes(u.type)&&!u.routing);
  if(mobile.length)commandLooseFormation(mobile,safe.x,safe.y+150,'column');
  aiPlan='Commandant: gecontroleerde terugtocht';
}
function aiRegroup(regs,tc,target){
  if(!tc)return; const d=aiDirection(tc,target),rally=aiOffset(tc,d,175); AI_COMMANDER_V1.regroupPoint=rally;
  AI_COMMANDER_V1.reserveRegimentId=null;
  regs.forEach((r,i)=>aiOrderReg(r,aiOffset(rally,d,0,(i-(regs.length-1)/2)*115),'line',d.angle));
  aiPlan='Commandant: hergroepeert en laat reserves aansluiten';
}

function aiCommanderMilitaryOrderV1(){
  if(gameOver)return; AI_COMMANDER_V1.cycle++;
  const regs=aiRegs(); if(!regs.length){aiTransition('DEFEND');aiPlan='Commandant: wacht op gevechtsgereed regiment';return;}
  const tc=aiBritishTC(),target=aiStrategicTarget(); AI_COMMANDER_V1.target=target;
  aiTransition(aiChooseState(regs));
  if(AI_COMMANDER_V1.state==='DEFEND')aiDefend(regs,tc,target);
  else if(AI_COMMANDER_V1.state==='MASS')aiMass(regs,tc,target);
  else if(AI_COMMANDER_V1.state==='ADVANCE')aiAdvance(regs,tc,target);
  else if(AI_COMMANDER_V1.state==='ATTACK')aiAttack(regs,tc,target);
  else if(AI_COMMANDER_V1.state==='FLANK')aiFlank(regs,tc,target);
  else if(AI_COMMANDER_V1.state==='RETREAT')aiRetreat(regs,tc,target);
  else aiRegroup(regs,tc,target);
}

function aiMilitaryOrder(){ return aiCommanderMilitaryOrderV1(); }

window.__AI_COMMANDER_V1__=Object.freeze({
  state:()=>({...AI_COMMANDER_V1,ownStrength:aiSideStrength('britain'),enemyStrength:aiSideStrength('france')}),
  forceState:s=>{if(['DEFEND','MASS','ADVANCE','ATTACK','FLANK','RETREAT','REGROUP'].includes(s))aiTransition(s);},
  tick:()=>aiCommanderMilitaryOrderV1(),
  strategicTarget:()=>({...aiStrategicTarget()}),
  nearestThreat:()=>{const tc=aiBritishTC();return tc?aiNearestEnemyTo(tc):null;}
});
NRTS.subsystems.register('ai-commander',window.__AI_COMMANDER_V1__,{
  phase:'architecture-v2',legacyBridge:false,
  responsibility:'stateful military command; economy and replenishment remain independent'
});
