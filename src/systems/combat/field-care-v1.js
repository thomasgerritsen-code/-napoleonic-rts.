'use strict';
// Walking wounded keep their identity and regiment. Treatment needs a safe hospital.
(function installFieldCare(root){
  if(!root.NRTS_CONFIG?.medics)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installFieldCare(root),{once:true});return;}
  let patients=new Set(),lastHit=new WeakMap(),clock=0;
  const stats={injured:0,treated:0,healedHP:0};
  const military=u=>u?.kind==='unit'&&['infantry','cavalry','officer','drummer'].includes(u.type);
  const speed=u=>u?.injuryLevel===2?.62:u?.injuryLevel===1?.82:1;
  function grade(u){
    const level=u.dead?0:u.hp/u.maxHp<.3?2:u.hp/u.maxHp<.65?1:0;
    if(level&&!u.injuryLevel)stats.injured++;
    if(level){u.injuryLevel=level;patients.add(u);}else{
      delete u.injuryLevel;
      if(!u.dead&&u.bandagedAt&&u.hp<u.maxHp)patients.add(u);else{delete u.careUntil;patients.delete(u);}
    }
    return level;
  }
  const baseDamage=applyDamage;
  applyDamage=function damageWithWalkingWounds(u,...args){
    const hp=u?.hp,result=baseDamage(u,...args);
    if(military(u)&&u.hp<hp){lastHit.set(u,elapsed);grade(u);}
    return result;
  };
  const baseMove=moveToward;
  moveToward=function moveWalkingWounded(u,x,y,dt,...args){return baseMove(u,x,y,dt*speed(u),...args);};
  const baseFire=fire;
  fire=function fireWithInjury(u,e){const before=u.reload,result=baseFire(u,e);if(u.reload>before)u.reload*=u.injuryLevel===2?1.35:u.injuryLevel===1?1.15:1;return result;};
  const baseSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function paceWalkingWounded(reg,...args){
    const value=baseSpeed(reg,...args);if(!reg||reg.destroyed)return value;
    const m=regimentMembers(reg).filter(u=>!u.dead&&!u.routing);if(!m.length)return value;
    return value*(.7+.3*m.reduce((n,u)=>n+speed(u),0)/m.length);
  };
  function danger(u){
    const grid=combatBuckets[opposite(u.side)],r=220;
    for(let y=Math.floor((u.y-r)/COMBAT_CELL);y<=Math.floor((u.y+r)/COMBAT_CELL);y++)
      for(let x=Math.floor((u.x-r)/COMBAT_CELL);x<=Math.floor((u.x+r)/COMBAT_CELL);x++)
        for(const e of grid.get(`${x},${y}`)||[])if(!e.dead&&!e.routing&&e.type!=='worker'&&Math.hypot(e.x-u.x,e.y-u.y)<r)return true;
    return false;
  }
  function care(dt){
    for(const u of patients)if(u.dead||!military(u)){patients.delete(u);delete u.injuryLevel;delete u.careUntil;}
    const occupied=new Set();
    for(const h of root.__MEDICS_V1__.hospitals()){
      const waiting=[...patients].filter(u=>u.side===h.side&&!u.routing&&!occupied.has(u)&&
        elapsed-(lastHit.get(u)??elapsed)>=3&&Math.hypot(u.x-h.x,u.y-h.y)<115&&
        Math.hypot(u.targetX-u.x,u.targetY-u.y)<5&&!danger(u))
        .sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);
      let beds=0;
      for(const u of waiting){
        const dx=u.x-h.x,dy=u.y-h.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
        const edge=Math.min((h.w/2)/Math.max(.0001,Math.abs(ux)),(h.h/2)/Math.max(.0001,Math.abs(uy)))+12;
        if(root.__STUCK_RECOVERY_V2__.segmentBlocked(u,{x:h.x+ux*edge,y:h.y+uy*edge}))continue;
        if(beds++>=2)break;occupied.add(u);
        if(!u.bandagedAt)stats.treated++;u.bandagedAt=elapsed;u.careUntil=elapsed+.65;
        const hp=u.hp;u.hp=Math.min(u.maxHp,u.hp+u.maxHp*.025*dt);stats.healedHP+=u.hp-hp;grade(u);
      }
    }
  }
  const baseBuildings=updateBuildings;
  updateBuildings=function updateFieldCare(dt){const result=baseBuildings(dt);clock+=dt;if(clock>=.5){const step=Math.min(1,clock);clock=0;care(step);}return result;};
  const baseDraw=drawUnit;
  drawUnit=function drawWalkingWound(u){
    const result=baseDraw(u);if(!u.dead&&u.injuryLevel&&isWorldVisible(u.x,u.y,25)){
      ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);ctx.fillStyle='#ede4d1';ctx.fillRect(-2,-6,4,3);ctx.fillStyle='#963e38';ctx.fillRect(-.5,-6,1,3);ctx.restore();
    }return result;
  };
  root.NRTS.events.on('game:reset',()=>{patients=new Set();lastHit=new WeakMap();clock=0;for(const k of Object.keys(stats))stats[k]=0;});
  root.__FIELD_CARE_V1__=Object.freeze({speed,stats:()=>({...stats,waiting:patients.size})});
})(window);
