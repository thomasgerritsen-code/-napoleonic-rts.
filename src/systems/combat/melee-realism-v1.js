'use strict';
// Only real close-range attacks create contacts/reactions. No pairwise army scan.
(function installMeleeRealism(root){
  if(!root.NRTS_CONFIG?.troops)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installMeleeRealism(root),{once:true});return;}
  let memory=new WeakMap(),strike=null;
  const stats={impacts:0,knockdowns:0,parries:0,blows:0,blockedSteps:0,lastPower:0,lastSpeed:0};
  const clamp=n=>Math.max(0,Math.min(1,n));
  const alive=u=>u&&!u.dead&&!u.routing&&u.kind==='unit';
  const radius=u=>TYPES[u.type]?.radius||7;
  const down=u=>root.__CHARGE_STUMBLE_V1__.down(u);
  const stamina=u=>clamp((u.staminaV1??100)/100);
  function state(u){let s=memory.get(u);if(!s){s={timer:0,run:0,peak:0,peakUntil:0,strikes:0,used:false};memory.set(u,s);}return s;}
  function random(a,b,n){let h=Math.imul(a^Math.imul(b,2654435761)^n,2246822519);h=Math.imul(h^(h>>>15),3266489917);return((h^(h>>>16))>>>0)/4294967296;}
  const facing=(u,e)=>Math.atan2(e.y-u.y,e.x-u.x);
  const reaction=u=>alive(u)&&!down(u)&&u.meleeActionUntil>elapsed&&['recoil','parry','brace'].includes(u.meleeAction);
  function mark(u,kind,e,seconds){
    u.meleeAction=kind;u.meleeActionAt=elapsed;u.meleeActionUntil=elapsed+seconds;
    u.meleeActionFacing=facing(u,e);
  }
  function nearby(u,reach,side=u.side){
    const out=[],grid=combatBuckets[side];
    for(let y=Math.floor((u.y-reach)/COMBAT_CELL);y<=Math.floor((u.y+reach)/COMBAT_CELL);y++)
      for(let x=Math.floor((u.x-reach)/COMBAT_CELL);x<=Math.floor((u.x+reach)/COMBAT_CELL);x++)
        for(const e of grid.get(`${x},${y}`)||[])if(e!==u&&alive(e)&&Math.hypot(e.x-u.x,e.y-u.y)<reach)out.push(e);
    return out;
  }
  function crossing(u){
    const r=u.regimentId?getRegiment(u.regimentId):null;
    return r?.crossingTrafficV068?.forcedColumn||u.waterCrossingIdV067||crossingAtV067(u.x,u.y)||waterAtV067(u.x,u.y);
  }
  function strength(u,e,s){
    const reg=e.regimentId?getRegiment(e.regimentId):null;
    const density=Math.min(6,nearby(e,42).filter(f=>f.type!=='worker').length);
    return clamp(s.peak/135)*(.4+.6*stamina(u))/(1+density*.22)*(reg?.formation==='square'?.25:1)*(e.type==='cavalry'?.72:1);
  }
  function impulse(u,e,power){
    if(!alive(e)||crossing(u)||crossing(e))return;
    const s=state(e);if(elapsed<(s.pushedUntil||0))return;
    const angle=facing(u,e),speed=(12+power*43);
    s.push={x:Math.cos(angle)*speed,y:Math.sin(angle)*speed,until:elapsed+.3};s.pushedUntil=elapsed+.9;
    if(e.slotFollowerV071)e.slotFollowerV071.vx=e.slotFollowerV071.vy=0;
    mark(e,'recoil',u,.42);
    if(power>.5&&random(u.id,e.id,state(u).strikes)<.38&&root.__CHARGE_STUMBLE_V1__.fall(e))stats.knockdowns++;
  }
  function pushStep(u,s,dt){
    const p=s.push;if(!p)return;
    if(u.dead||u.routing||elapsed>=p.until||crossing(u)){s.push=null;return;}
    const decay=clamp((p.until-elapsed)/.3),target={x:u.x+p.x*dt*decay,y:u.y+p.y*dt*decay};
    const pad=radius(u)+1;
    const blocked=target.x<pad||target.y<pad||target.x>WORLD.width-pad||target.y>WORLD.height-pad||
      waterAtV067(target.x,target.y)||segmentCrossesBlockedWaterV067(u.x,u.y,target.x,target.y)||
      root.__STUCK_RECOVERY_V2__.segmentBlocked(u,target)||
      [...nearby(u,32),...nearby(u,32,opposite(u.side))].some(e=>
        Math.hypot(target.x-e.x,target.y-e.y)<radius(u)+radius(e)+1&&Math.hypot(target.x-e.x,target.y-e.y)<Math.hypot(u.x-e.x,u.y-e.y)-.01);
    if(blocked){s.push=null;stats.blockedSteps++;return;}
    u.x=target.x;u.y=target.y;
  }
  const baseNearest=nearestEnemyEntity;
  nearestEnemyEntity=function nearestBayonetBodyContact(u,range){
    if(u&&(u.type==='infantry'||u.type==='officer')&&u.attackMode==='bayonet'&&range===16){
      const e=baseNearest(u,22);
      const reach=e?.kind==='unit'?Math.max(16,radius(u)+radius(e)+3.5):16;
      return e&&Math.hypot(e.x-u.x,e.y-u.y)<=reach?e:null;
    }
    return baseNearest(u,range);
  };
  const baseMove=moveToward;
  moveToward=function moveWithImpact(u,...args){const s=memory.get(u);if(s?.push&&s.push.until>elapsed&&!u.routing)return false;return baseMove(u,...args);};
  const baseUnit=updateUnit;
  updateUnit=function updateWithMeleeReactions(u,dt){
    if(!alive(u)||(u.type!=='infantry'&&u.type!=='cavalry'&&u.type!=='officer')||!(dt>0)){
      if(u){memory.delete(u);for(const key of ['meleeAction','meleeActionAt','meleeActionUntil','meleeActionFacing','meleeVariant'])delete u[key];}
      return baseUnit(u,dt);
    }
    const s=state(u),timer=u.chargeTimer||0;
    if(timer>0&&(s.timer<=0||timer>s.timer+.2)){s.run=0;s.used=false;s.peak=0;s.peakUntil=0;}
    s.timer=timer;
    if(u.meleeActionUntil<=elapsed){for(const key of ['meleeAction','meleeActionAt','meleeActionUntil','meleeActionFacing','meleeVariant'])delete u[key];}
    const x=u.x,y=u.y,result=baseUnit(u,dt);
    const speed=timer>0&&!down(u)?Math.hypot(u.x-x,u.y-y)/dt:0;
    if(timer>0&&!down(u)&&speed>35){s.run+=speed*dt;if(speed>s.peak||elapsed>s.peakUntil){s.peak=speed;s.peakUntil=elapsed+.8;}}
    pushStep(u,s,dt);
    return result;
  };
  const baseDamage=dealCombatDamage;
  dealCombatDamage=function damageWithMeleeReaction(source,e,damage,shock=8){
    const c=strike;
    if(c&&e===c.enemy){
      if(c.parry){damage*=.4;shock*=.45;}
      else if(c.impact){damage*=.7+c.power*.55;shock*=.7+c.power*.5;}
    }
    return baseDamage(source,e,damage,shock);
  };
  const baseFire=fire;
  fire=function fireWithMeleeReaction(u,e){
    const s=u&&memory.get(u);
    if(down(u)||(s?.push?.until>elapsed&&!u.routing)||
      (reaction(u)&&u.meleeAction==='parry'&&elapsed-u.meleeActionAt<.18))return;
    const close=alive(u)&&alive(e)&&u.side!==e.side&&
      (u.type==='cavalry'||((u.type==='infantry'||u.type==='officer')&&u.attackMode==='bayonet'))&&
      Math.hypot(e.x-u.x,e.y-u.y)<=Math.max(22,radius(u)+radius(e)+5);
    if(!close)return baseFire(u,e);
    const a=state(u);a.strikes++;
    const impact=u.type==='cavalry'&&u.chargeTimer>0&&!a.used&&a.run>45&&a.peakUntil>elapsed&&a.peak>50&&!crossing(u)&&!crossing(e);
    const power=impact?strength(u,e,a):0;
    const guards=Math.cos(facing(e,u)-(e.facing||0))>.3&&!down(e)&&stamina(e)>.25&&!reaction(e);
    const parry=!impact&&guards&&random(u.id,e.id,a.strikes)<.22;
    const before=strike;strike={unit:u,enemy:e,impact,power,parry};const hp=e.hp;
    let result;
    try{result=baseFire(u,e);}finally{strike=before;}
    if(e.hp>=hp)return result;
    stats.blows++;mark(u,'strike',e,.54);u.meleeVariant=a.strikes%2;
    if(impact){
      a.used=true;stats.impacts++;stats.lastPower=power;stats.lastSpeed=a.peak;u.chargeMomentumV1=0;u.chargeTimer=0;
      root.__CAVALRY_CONTACT_V1__.brake(u);impulse(u,e,power);
      const reg=e.regimentId?getRegiment(e.regimentId):null;
      if(reg?.formation==='square')mark(u,'brace',e,.42);
    }else if(alive(e)&&!down(e)){
      mark(e,parry?'parry':'recoil',u,parry?.38:.3);
      if(parry){stats.parries++;root.__CAVALRY_CONTACT_V1__.seekOpening(u,(u.id%2?1:-1)*.3);}
    }
    return result;
  };
  const baseDraw=drawUnit;
  drawUnit=function drawMeleeReaction(u){
    if(!reaction(u))return baseDraw(u);
    const age=elapsed-u.meleeActionAt,life=u.meleeActionUntil-u.meleeActionAt;
    const d=-Math.sin(Math.PI*clamp(age/life))*(u.meleeAction==='parry'?1.5:3),a=u.meleeActionFacing;
    ctx.save();ctx.translate(Math.cos(a)*d,Math.sin(a)*d);
    try{return baseDraw(u);}finally{ctx.restore();}
  };
  root.NRTS.events.on('game:reset',()=>{memory=new WeakMap();strike=null;for(const k of Object.keys(stats))stats[k]=0;});
  root.__MELEE_REALISM_V1__=Object.freeze({reacting:reaction,stats:()=>({...stats})});
})(window);
