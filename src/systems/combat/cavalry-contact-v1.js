'use strict';
// Close combat owns a rider's small approach steps; the regiment still owns
// the route, membership, morale and the movement resumed after contact.
(function installCavalryContact(root){
  if(!root.NRTS_CONFIG?.troops)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installCavalryContact(root),{once:true});return;}
  let contacts=new WeakMap(),active=null;
  const stats={acquired:0,released:0,strikes:0,blockedSteps:0};
  const radius=u=>Number(TYPES[u.type]?.radius)||7;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const valid=(u,e)=>!!(e&&!e.dead&&!e.routing&&e.kind==='unit'&&e.side!==u.side&&e.type!=='worker');
  const strikeRange=(u,e)=>Math.max(TYPES.cavalry.range,radius(u)+radius(e)+3.5);
  const bridge=reg=>reg?.crossingTrafficV068?.forcedColumn&&['queued','waiting','approach','crossing','clearing'].includes(reg.crossingTrafficV068.state);
  function clear(u){
    const s=contacts.get(u);if(!s)return;
    if(u.slotFollowerV071)Object.assign(u.slotFollowerV071,{vx:s.vx,vy:s.vy,lastTargetX:u.targetX,lastTargetY:u.targetY});
    contacts.delete(u);delete u.cavalryTargetId;stats.released++;
  }
  function visibleApproach(u,e){
    return !segmentCrossesBlockedWaterV067(u.x,u.y,e.x,e.y)&&
      !root.__STUCK_RECOVERY_V2__.segmentBlocked(u,e)&&
      (typeof lineOfSight!=='function'||lineOfSight(u,e));
  }
  function nearby(u,side,reach){
    const out=[],grid=combatBuckets[side];
    for(let y=Math.floor((u.y-reach)/COMBAT_CELL);y<=Math.floor((u.y+reach)/COMBAT_CELL);y++)
      for(let x=Math.floor((u.x-reach)/COMBAT_CELL);x<=Math.floor((u.x+reach)/COMBAT_CELL);x++)
        for(const e of grid.get(`${x},${y}`)||[])if(!e.dead&&distance(u,e)<=reach)out.push(e);
    return out;
  }
  function acquire(u,reg){
    const goal={x:u.targetX??u.x,y:u.targetY??u.y};
    const friends=nearby(u,u.side,150),load=new Map();
    for(const f of friends){const s=contacts.get(f);if(s&&valid(f,s.enemy))load.set(s.enemy.id,(load.get(s.enemy.id)||0)+1);}
    let enemy=null,best=Infinity;
    for(const e of nearby(u,opposite(u.side),120)){
      if(!valid(u,e))continue;
      const d=distance(u,e),toward=(goal.x-u.x)*(e.x-u.x)+(goal.y-u.y)*(e.y-u.y)>0;
      const allowed=reg?.movementPhaseV063==='halted'?d<=strikeRange(u,e)+1:
        d<=40||u.chargeTimer>0||(toward&&distance(goal,e)<240);
      if(!allowed||!visibleApproach(u,e))continue;
      const cost=d+(load.get(e.id)||0)*24;
      if(cost<best){enemy=e;best=cost;}
    }
    if(!enemy)return null;
    const occupied=load.get(enemy.id)||0;
    const angle=Math.atan2(u.y-enemy.y,u.x-enemy.x)+(occupied?((u.id%2?1:-1)*Math.min(1.6,occupied*1.35)):0);
    const s={enemy,angle,vx:0,vy:0,at:elapsed,goal:null};
    contacts.set(u,s);u.cavalryTargetId=enemy.id;u.localAvoidanceV2=null;stats.acquired++;
    return s;
  }
  function step(u,s,dt,speed){
    const dx=s.goal.x-u.x,dy=s.goal.y-u.y,d=Math.hypot(dx,dy);
    const troop=root.__TROOPS_V1__?.kinds[u.troop];
    const wet=root.__WEATHER_V1__?.state().wetness||0;
    const mud=1-(root.NRTS_CONFIG.weather?.mudSlow||0)*wet;
    const cap=Math.min(170,speed*(troop?.speed||1)*terrainSpeedMultiplierV06(u)*mud);
    const desired=Math.min(cap,Math.sqrt(2*220*Math.max(0,d-.2)));
    const vx=d>.2?dx/d*desired:0,vy=d>.2?dy/d*desired:0;
    const dvx=vx-s.vx,dvy=vy-s.vy,scale=Math.min(1,240*dt*mud*(troop?.speed||1)/(Math.hypot(dvx,dvy)||1));
    s.vx+=dvx*scale;s.vy+=dvy*scale;
    let mx=s.vx*dt,my=s.vy*dt;
    if(Math.hypot(mx,my)>d){const ratio=d/(Math.hypot(mx,my)||1);mx*=ratio;my*=ratio;s.vx=mx/dt;s.vy=my/dt;}
    const p={x:u.x+mx,y:u.y+my};
    if(waterAtV067(p.x,p.y)||segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y)||root.__STUCK_RECOVERY_V2__.segmentBlocked(u,p)){
      s.vx=s.vy=0;stats.blockedSteps++;return false;
    }
    u.x=Math.max(8,Math.min(WORLD.width-8,p.x));u.y=Math.max(8,Math.min(WORLD.height-8,p.y));
    u.arrivedAtTarget=d<.5;return u.arrivedAtTarget;
  }
  const baseMove=moveToward;
  moveToward=function moveMountedContact(u,x,y,dt,speed=TYPES[u.type].speed){
    if(active?.unit===u)return step(u,active.state,dt,speed);
    return baseMove(u,x,y,dt,speed);
  };
  const baseNearest=nearestEnemyEntity;
  nearestEnemyEntity=function nearestMountedContact(u,range){
    const s=u?.type==='cavalry'&&contacts.get(u);
    if(s&&range===TYPES.cavalry.range&&valid(u,s.enemy))return distance(u,s.enemy)<=strikeRange(u,s.enemy)?s.enemy:null;
    return baseNearest(u,range);
  };
  const baseUnit=updateUnit;
  updateUnit=function updateMountedContact(u,dt){
    if(!u||u.type!=='cavalry'||u.dead||u.routing||!(dt>0)){if(u)clear(u);return baseUnit(u,dt);}
    const reg=u.regimentId?getRegiment(u.regimentId):null;
    if(bridge(reg)||elapsed<(u.cavalryDisengageUntil||0)||elapsed<(reg?.manualDisengageUntilV070||0)){
      clear(u);return baseUnit(u,dt);
    }
    let s=contacts.get(u);
    if(s&&(!valid(u,s.enemy)||distance(u,s.enemy)>145||!visibleApproach(u,s.enemy))){clear(u);s=null;}
    if(!s)s=acquire(u,reg);
    if(!s)return baseUnit(u,dt);
    const spacing=radius(u)+radius(s.enemy)+2;
    s.goal={x:s.enemy.x+Math.cos(s.angle)*spacing,y:s.enemy.y+Math.sin(s.angle)*spacing};
    const original={x:u.targetX,y:u.targetY,facing:u.facing,px:u.x,py:u.y};
    const dx=s.goal.x-u.x,dy=s.goal.y-u.y,d=Math.hypot(dx,dy);
    // Keep the real timers, damage, troop bonuses, weather and trench hooks.
    // Only the movement call made inside that update uses the contact solver.
    const stretch=d>.2?Math.max(1,3/d):0;
    u.targetX=u.x+dx*stretch;u.targetY=u.y+dy*stretch;
    const before=active;active={unit:u,state:s};
    try{return baseUnit(u,dt);}
    finally{
      active=before;
      if(u.dead||u.routing)clear(u);
      else{
        u.targetX=original.x;u.targetY=original.y;
        s.vx=(u.x-original.px)/dt;s.vy=(u.y-original.py)/dt;
        const heading=Math.atan2(s.enemy.y-u.y,s.enemy.x-u.x),turn=normalizeFacing(heading-original.facing);
        u.facing=normalizeFacing(original.facing+Math.max(-4*dt,Math.min(4*dt,turn)));
      }
    }
  };
  const baseSpeed=desiredGroupSpeedV064;
  function engaged(reg){
    return !!reg&&!reg.destroyed&&groupKindV06(reg)==='cavalry'&&regimentMembers(reg).some(u=>{
      const s=contacts.get(u);return s&&valid(u,s.enemy)&&distance(u,s.enemy)<45;
    });
  }
  desiredGroupSpeedV064=function speedMountedContact(reg,march,road){
    const speed=baseSpeed(reg,march,road);
    if(!reg||reg.destroyed||groupKindV06(reg)!=='cavalry'||bridge(reg))return speed;
    // Do not drag the mounted commander and the march slots through a melee.
    if(engaged(reg))return 0;
    return speed;
  };
  function disengage(group=selectedUnits){
    for(const u of group)if(u.type==='cavalry'&&contacts.has(u)){clear(u);u.cavalryDisengageUntil=elapsed+2.5;}
  }
  for(const name of ['issueMoveWithFacingV06','haltSelectedRegiments']){
    const base=root[name];
    const wrapped=function(...args){disengage();return base.apply(this,args);};
    Object.assign(wrapped,base);root[name]=wrapped;
  }
  // The final input bridge also sends ordinary ground clicks straight to
  // these two functions, without going through the facing-order helper.
  const baseLoose=commandLooseFormation;
  commandLooseFormation=function orderLooseMountedContact(group,...args){disengage(group);return baseLoose(group,...args);};
  const baseOrder=orderGroupPathV06;
  orderGroupPathV06=function orderMountedContact(reg,x,y,...args){
    if(reg&&Math.hypot(x-(reg.finalTarget?.x??reg.targetX),y-(reg.finalTarget?.y??reg.targetY))>45)disengage(regimentMembers(reg));
    return baseOrder(reg,x,y,...args);
  };
  const baseFire=fire;
  fire=function fireMountedContact(u,e){const result=baseFire(u,e);if(u?.type==='cavalry'){u.meleeStrikeAt=elapsed;stats.strikes++;}return result;};
  root.NRTS.events.on('game:reset',()=>{contacts=new WeakMap();active=null;});
  root.__CAVALRY_CONTACT_V1__=Object.freeze({strikeRange,engaged,state:u=>{const s=contacts.get(u);return s?{enemyId:s.enemy.id,since:s.at,vx:s.vx,vy:s.vy}:null;},stats:()=>({...stats})});
})(window);
