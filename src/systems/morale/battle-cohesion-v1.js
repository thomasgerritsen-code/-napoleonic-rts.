'use strict';
// Recoverable battlefield disorder. Navigation and slot followers still move every man.
(function installBattleCohesion(root){
  if(!root.NRTS_CONFIG?.troops)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installBattleCohesion(root),{once:true});return;}
  let states=new WeakMap(),offsets=new WeakMap(),active=new Set(),internal=0,ai=0;
  const stats={wavers:0,breaks:0,withdrawals:0,rallies:0,reformed:0,interrupted:0,blocked:0};
  const labels={steady:'',wavering:'AARZELT',broken:'LINIE GEBROKEN',withdrawing:'TREKT TERUG',regrouping:'VERZAMELT',threatened:'ONDER DRUK',reforming:'FORMEERT',ready:'GEREED'};
  const living=reg=>regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
  const phaseActive=s=>s&&['broken','withdrawing','regrouping','threatened','reforming'].includes(s.phase);
  const crossing=(reg,m)=>reg.crossingTrafficV068?.forcedColumn||m.some(u=>crossingAtV067(u.x,u.y)||waterAtV067(u.x,u.y));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function state(reg){let s=states.get(reg);if(!s){s={phase:'steady',cohesion:100,pressure:0,lastAt:elapsed,lastHit:-99,manualUntil:0};states.set(reg,s);}return s;}
  function setPhase(reg,s,phase){
    if(s.phase!==phase){s.phase=phase;s.since=elapsed;reg.cohesionSince=elapsed;}
    reg.cohesionPhase=phase;reg.cohesion=Math.round(s.cohesion);
  }
  function enemies(reg,center,reach){
    const grid=combatBuckets[opposite(reg.side)],out=[];
    for(let y=Math.floor((center.y-reach)/COMBAT_CELL);y<=Math.floor((center.y+reach)/COMBAT_CELL);y++)
      for(let x=Math.floor((center.x-reach)/COMBAT_CELL);x<=Math.floor((center.x+reach)/COMBAT_CELL);x++)
        for(const u of grid.get(`${x},${y}`)||[])if(!u.dead&&!u.routing&&u.type!=='worker'&&distance(u,center)<reach)out.push(u);
    return out;
  }
  function clearContact(reg){
    reg.engagementV069=null;reg.engagementLockV070=null;reg.manualDisengageUntilV070=elapsed+2;
  }
  function order(reg,goal,formation,facing){
    internal++;
    try{return orderGroupPathV06(reg,goal.x,goal.y,formation,facing);}finally{internal--;}
  }
  function safeGoal(reg,m,center,heading){
    for(const turn of [0,.45,-.45,.85,-.85]){
      const a=heading+turn,p={x:center.x-Math.cos(a)*220,y:center.y-Math.sin(a)*220};
      if(p.x<100||p.y<100||p.x>WORLD.width-100||p.y>WORLD.height-100||waterAtV067(p.x,p.y)||
        segmentCrossesBlockedWaterV067(center.x,center.y,p.x,p.y)||root.__STUCK_RECOVERY_V2__.segmentBlocked(center,p))continue;
      if(m.some(u=>root.__STUCK_RECOVERY_V2__.segmentBlocked(u,p)))continue;
      return p;
    }
    stats.blocked++;return null;
  }
  function withdraw(reg,s,m,threats){
    if(crossing(reg,m))return false;
    const c=centroid(m),enemy=threats.sort((a,b)=>distance(a,c)-distance(b,c))[0];
    const heading=enemy?Math.atan2(enemy.y-c.y,enemy.x-c.x):(reg.engagementV069?.heading??reg.facing??0);
    const goal=safeGoal(reg,m,c,heading);if(!goal)return false;
    s.goal=goal;s.originalFormation=reg.formation;s.heading=heading;s.startedAt=elapsed;s.rallyAt=null;
    s.cohesion=Math.min(s.cohesion,34);setPhase(reg,s,'broken');stats.breaks++;stats.withdrawals++;active.add(reg);
    delete reg.orderlyFallbackV289;delete reg.regroupV290;
    clearContact(reg);order(reg,goal,'column',heading);
    return true;
  }
  function recoverable(reg,m){return m.length>Math.max(3,(reg.initialStrength||reg.memberIds.length)/3)&&m.some(u=>u.id===reg.officerId);}
  function tick(reg){
    if(!reg||reg.destroyed||!['infantry','cavalry'].includes(groupKindV06(reg)))return;
    const s=state(reg),dt=Math.min(.5,Math.max(0,elapsed-s.lastAt));if(dt<.24)return;
    s.lastAt=elapsed;s.pressure=Math.max(0,s.pressure-dt*1.8);
    const m=living(reg);if(!m.length)return;
    const c=centroid(m),officer=m.find(u=>u.id===reg.officerId);
    const morale=m.reduce((n,u)=>n+(u.morale||0),0)/m.length+(officer?5:-20)+(groupKindV06(reg)==='infantry'?(m.some(u=>u.id===reg.drummerId)?5:-8):0);
    const threats=enemies(reg,c,260),near=threats.length>0;
    if(crossing(reg,m))return;
    if(phaseActive(s)){
      clearContact(reg);active.add(reg);
      if(s.phase==='broken'&&elapsed-s.since>1.1)setPhase(reg,s,'withdrawing');
      const inSlots=m.filter(u=>distance(u,{x:u.targetX,y:u.targetY})<38).length>=Math.ceil(m.length*.8);
      const arrived=distance(c,s.goal)<75&&inSlots;
      if(near||elapsed-s.lastHit<1.5){
        if(s.phase==='regrouping'||s.phase==='reforming')setPhase(reg,s,'threatened');
        s.rallyAt=null;return;
      }
      if(!arrived)return;
      if(!officer||distance(officer,c)>95){setPhase(reg,s,'threatened');s.rallyAt=null;return;}
      if(s.phase==='reforming'){
        if(elapsed-s.since>1&&inSlots){s.cohesion=100;setPhase(reg,s,'ready');stats.reformed++;restoreReg(reg);active.delete(reg);reg.manualDisengageUntilV070=elapsed+1;}
        return;
      }
      if(s.phase!=='regrouping'){setPhase(reg,s,'regrouping');s.rallyAt=elapsed;stats.rallies++;}
      const support=m.some(u=>u.id===reg.drummerId)?1.6:1.15;
      for(const u of m)u.morale=Math.min(100,u.morale+support*dt);
      s.cohesion=Math.min(90,s.cohesion+dt*8);reg.cohesion=Math.round(s.cohesion);
      if(elapsed-s.rallyAt>=6&&morale>=62&&s.cohesion>=80){setPhase(reg,s,'reforming');order(reg,s.goal,s.originalFormation,s.heading);}
      return;
    }
    if(s.phase==='ready'&&elapsed-s.since<5)return;
    const broken=(s.pressure>32&&morale<74)||(s.pressure>2&&morale<50);
    const wavering=(near&&morale<58)||(s.pressure>10&&morale<76);
    if(broken&&elapsed>s.manualUntil&&recoverable(reg,m)&&withdraw(reg,s,m,threats))return;
    if(wavering){
      if(s.phase!=='wavering'){stats.wavers++;s.hesitateUntil=elapsed+1.2;}
      s.cohesion=Math.max(38,Math.min(s.cohesion,100-s.pressure*1.3-(100-morale)*.35));
      setPhase(reg,s,'wavering');active.add(reg);
    }else{
      s.cohesion=Math.min(100,s.cohesion+dt*(near?1:5));
      if(s.cohesion>=80&&elapsed-s.lastHit>3){setPhase(reg,s,'steady');restoreReg(reg);active.delete(reg);}
      reg.cohesion=Math.round(s.cohesion);
    }
  }
  const baseDamage=applyDamage;
  applyDamage=function damageWithCohesion(victim,...args){
    const hp=victim?.hp,result=baseDamage(victim,...args);
    const reg=victim?.regimentId?getRegiment(victim.regimentId):null;
    if(reg&&hp>victim.hp&&(groupKindV06(reg)==='infantry'||groupKindV06(reg)==='cavalry')){
      const s=state(reg);s.pressure=Math.min(90,s.pressure+Math.min(hp,hp-victim.hp)/Math.max(1,victim.maxHp)*9+(victim.dead?9:0));s.lastHit=elapsed;
    }
    return result;
  };
  const baseRefresh=refreshRegiment;
  refreshRegiment=function refreshWithCohesion(reg){tick(reg);return baseRefresh(reg);};
  const baseNearest=nearestEnemyEntity;
  nearestEnemyEntity=function nearestDuringWithdrawal(u,range){
    const reg=u?.regimentId?getRegiment(u.regimentId):null;
    // Keep the 180-unit morale threat query; stop acquisition for attacks so
    // the old individual firing halt cannot pin a withdrawing regiment in place.
    if(reg&&phaseActive(states.get(reg))&&range!==180)return null;
    return baseNearest(u,range);
  };
  const baseFire=fire;
  fire=function fireDuringWithdrawal(u,...args){
    const reg=u?.regimentId?getRegiment(u.regimentId):null;
    if(reg&&phaseActive(states.get(reg)))return;
    return baseFire(u,...args);
  };
  const baseDissolve=dissolveGroupV06;
  dissolveGroupV06=function dissolveAfterCohesion(reg,reason,route){
    const s=states.get(reg);
    if(reason.startsWith('moraal gebroken')&&phaseActive(s)&&elapsed-s.startedAt<10&&recoverable(reg,living(reg)))return;
    restoreReg(reg);active.delete(reg);return baseDissolve(reg,reason,route);
  };
  function interrupt(reg){
    const s=states.get(reg);if(!phaseActive(s))return;
    s.goal=null;s.manualUntil=elapsed+6;s.pressure*=.6;setPhase(reg,s,'wavering');stats.interrupted++;
  }
  const baseOrder=orderGroupPathV06;
  orderGroupPathV06=function orderWithCohesion(reg,x,y,...args){
    const s=states.get(reg);
    if(!internal&&phaseActive(s)){
      if(ai)return false;
      if(distance({x,y},s.goal)>40)interrupt(reg);
    }
    return baseOrder(reg,x,y,...args);
  };
  for(const name of ['aiMilitaryOrder','aiCommanderMilitaryOrderV1','aiOrderReg'])if(typeof root[name]==='function'){
    const base=root[name];root[name]=function(...args){ai++;try{return base.apply(this,args);}finally{ai--;}};
  }
  const baseHalt=haltSelectedRegiments;
  haltSelectedRegiments=function haltWithCohesion(...args){selectedRegiments().forEach(interrupt);return baseHalt(...args);};
  const baseSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function speedWithCohesion(reg,...args){
    const speed=baseSpeed(reg,...args),s=states.get(reg);
    if(s?.phase==='wavering')return speed*(elapsed<s.hesitateUntil?.45:.8);
    return speed;
  };
  function restoreReg(reg){
    for(const u of regimentMembers(reg)){
      const p=offsets.get(u);if(!p)continue;
      if(Math.abs(u.targetX-p.x)<.01&&Math.abs(u.targetY-p.y)<.01){u.targetX=p.baseX;u.targetY=p.baseY;}
      offsets.delete(u);
    }
  }
  function restore(){
    for(const reg of active)restoreReg(reg);
  }
  const basePaths=updateGroupPathsV06;
  updateGroupPathsV06=function pathsWithDisorder(){
    restore();basePaths();
    for(const reg of active){
      const s=states.get(reg),m=living(reg);if(reg.destroyed||!s){active.delete(reg);continue;}
      if(crossing(reg,m))continue;
      const spread=Math.min(26,(100-s.cohesion)*.4),rise=Math.min(1,(elapsed-(s.startedAt??s.since))/1.2);
      for(const u of m){
        if(u.id===reg.officerId||u.id===reg.drummerId||!Number.isFinite(u.targetX))continue;
        const baseX=u.targetX,baseY=u.targetY;
        const dx=(((Math.imul(u.id,1103515245)>>>8)%101)/50-1)*spread*rise;
        const dy=(((Math.imul(u.id,1664525)>>>8)%101)/50-1)*spread*.7*rise;
        const p={x:baseX+dx,y:baseY+dy};
        if(p.x<20||p.y<20||p.x>WORLD.width-20||p.y>WORLD.height-20||waterAtV067(p.x,p.y)||segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y)||root.__STUCK_RECOVERY_V2__.segmentBlocked(u,p))continue;
        u.targetX=p.x;u.targetY=p.y;offsets.set(u,{...p,baseX,baseY});
      }
    }
  };
  root.NRTS.events.on('game:reset',()=>{states=new WeakMap();offsets=new WeakMap();active=new Set();internal=ai=0;for(const k of Object.keys(stats))stats[k]=0;});
  root.__BATTLE_COHESION_V1__=Object.freeze({label:reg=>labels[reg?.cohesionPhase]||'',state:reg=>{const s=states.get(reg);return s?{phase:s.phase,cohesion:s.cohesion,pressure:s.pressure,goal:s.goal?{...s.goal}:null,rallyAt:s.rallyAt??null}:null;},stats:()=>({...stats})});
})(window);
