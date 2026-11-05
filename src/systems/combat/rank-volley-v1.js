'use strict';
// A line fires by its actual depth ranks, independently of the army-wide clock.
(function installRankVolley(root){
  if(!root.NRTS_CONFIG?.troops)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installRankVolley(root),{once:true});return;}
  let groups=new WeakMap(),attempts=new WeakMap(),active=null;
  const stats={shots:0,misfires:0,cycles:0},period=3.6;
  function eligible(u,reg){
    return u&&!u.dead&&!u.routing&&u.type==='infantry'&&u.attackMode!=='bayonet'&&reg&&!reg.destroyed&&
      reg.formation==='line'&&!reg.skirmish&&!reg.crossingTrafficV068?.forcedColumn&&
      !['broken','withdrawing','regrouping','threatened','reforming'].includes(reg.cohesionPhase)&&
      !root.__REGIMENT_ORDERS_V1__?.trenchAt(u.x,u.y)&&Math.hypot(u.targetX-u.x,u.targetY-u.y)<6;
  }
  function schedule(reg){
    let s=groups.get(reg);
    if(!s){s={start:elapsed+.3,at:-99,ranks:new Map(),count:1,cycle:0};groups.set(reg,s);stats.cycles++;}
    if(elapsed-s.at>.15){
      s.at=elapsed;s.ranks.clear();
      const c=Math.cos(reg.facing||0),sn=Math.sin(reg.facing||0);
      const men=regimentMembers(reg).filter(u=>!u.dead&&!u.routing&&u.type==='infantry'&&Math.hypot(u.targetX-u.x,u.targetY-u.y)<12);
      const front=Math.max(...men.map(u=>u.x*c+u.y*sn));let count=1;
      for(const u of men){const rank=Math.max(0,Math.min(2,Math.round((front-u.x*c-u.y*sn)/18)));s.ranks.set(u.id,rank);count=Math.max(count,rank+1);}
      s.count=count;
    }
    return s;
  }
  function plan(u,reg){
    const s=schedule(reg),cycle=Math.max(0,Math.floor((elapsed-s.start)/period));
    if(cycle>s.cycle){stats.cycles+=cycle-s.cycle;s.cycle=cycle;}
    const rank=s.ranks.get(u.id)||0,jitter=(u.id%7)*.014;
    let at=s.start+cycle*period+rank*.58+jitter,key=cycle;
    if(elapsed>at+.2){at+=period;key++;}
    u.volleyRank=rank;u.volleyRanks=s.count;u.volleyFireAt=at;
    return{at,key,reg};
  }
  const baseUnit=updateUnit;
  updateUnit=function updateRankVolley(u,dt){
    const reg=u?.regimentId?getRegiment(u.regimentId):null;
    let p=null;
    if(eligible(u,reg)){
      const troop=root.__TROOPS_V1__?.kinds?.[u.troop],range=TYPES.infantry.range*(troop?.range||1);
      if(nearestEnemyEntity(u,range))p=plan(u,reg);
    }
    if(!p){if(u){delete u.volleyFireAt;delete u.volleyRank;delete u.volleyRanks;}return baseUnit(u,dt);}
    const old=active,clock=volleyClock;active={u,plan:p};volleyClock=0;
    try{return baseUnit(u,dt);}finally{active=old;volleyClock=clock;}
  };
  const baseFire=fire;
  fire=function fireRankVolley(u,e){
    const p=active?.u===u?active.plan:null;
    if(p&&(elapsed<p.at||elapsed>p.at+.2||attempts.get(u)?.key===p.key&&attempts.get(u)?.reg===p.reg))return;
    const count=projectiles.length,misfire=u.misfiredAt,before=u.reload;
    const result=baseFire(u,e);
    if(u.type!=='infantry'||u.attackMode==='bayonet'||u.reload<=before)return result;
    const shot=projectiles.length>count,failed=u.misfiredAt!==misfire;
    if(!shot&&!failed)return result;
    const individuality=.94+(u.id%11)*.012;
    const fatigue=1+Math.max(0,1-(u.staminaV1??100)/100)*.18;
    u.reload*=individuality*fatigue;
    u.musketReload=u.reload;
    if(shot){u.musketShotAt=elapsed;stats.shots++;}else stats.misfires++;
    if(p)attempts.set(u,{key:p.key,reg:p.reg});
    return result;
  };
  root.NRTS.events.on('game:reset',()=>{groups=new WeakMap();attempts=new WeakMap();active=null;for(const k of Object.keys(stats))stats[k]=0;});
  root.__RANK_VOLLEY_V1__=Object.freeze({period,stats:()=>({...stats})});
})(window);
