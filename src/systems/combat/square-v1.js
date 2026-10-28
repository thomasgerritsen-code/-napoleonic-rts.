'use strict';
// Infantry square against horse. Two rules a battalion in square lived by:
// - It holds. While enemy horse are within a few seconds' ride, no order breaks the square: the AI's
//   contact response used to march a square straight at the cavalry in column,
//   and the horsemen then rode through a line.
// - Horses will not go onto a hedge of bayonets. A charger that reaches a steady
//   square shies: it loses the charge and swerves along the face instead of
//   riding into the men. Only a shaken square (low morale) can be ridden into.
// Each rider decides once per approach, by a hash of its id and the square's id,
// so the outcome is deterministic and the simulation stays reproducible.
(function installSquareV1(root){
  if(document.readyState!=='complete'){addEventListener('load',()=>setTimeout(()=>installSquareV1(root)),{once:true});return;}
  if(root.__SQUARE_V1__||typeof moveToward!=='function'||typeof combatBuckets==='undefined')return;
  const HORSE_NEAR=520,REACH=36,stats={held:0,refusals:0,closed:0,parried:0};
  let approaches=new WeakMap();
  const regOf=u=>u?.regimentId?getRegiment(u.regimentId):null;
  const sample=(a,b)=>{let n=Math.imul(a^Math.imul(b,0x9e3779b1)^0x5bd1e995,0x85ebca6b);n=Math.imul(n^(n>>>16),0xc2b2ae35);return((n^(n>>>13))>>>0)/4294967296;};
  // Nearest living enemy of the given kind within range, from the combat buckets.
  function nearestEnemy(x,y,side,range,accept){
    const map=combatBuckets[side==='france'?'britain':'france'];if(!map)return null;
    const cx=Math.floor(x/COMBAT_CELL),cy=Math.floor(y/COMBAT_CELL),r=Math.max(1,Math.ceil(range/COMBAT_CELL));
    let best=null,bestD=range*range;
    for(let ox=-r;ox<=r;ox++)for(let oy=-r;oy<=r;oy++){
      const bucket=map.get(`${cx+ox},${cy+oy}`);if(!bucket)continue;
      for(const e of bucket){if(e.dead||!accept(e))continue;const d=(e.x-x)**2+(e.y-y)**2;if(d<bestD){bestD=d;best=e;}}
    }
    return best;
  }
  const inSquare=e=>!e.routing&&(e.type==='infantry'||e.type==='officer'||e.type==='drummer')&&regOf(e)?.formation==='square';
  // The hedge itself is the musketeers on the faces; officer and drummer stand inside.
  const onFace=e=>e.type==='infantry'&&inSquare(e);
  const horse=e=>e.type==='cavalry'&&!e.routing;
  function steadiness(reg){
    let sum=0,n=0;for(const u of regimentMembers(reg)){if(u.dead||u.routing)continue;sum+=u.morale??100;n++;}
    return n>=4?sum/n/100:0;
  }

  // 1. A square under threat of horse keeps its formation and its ground.
  if(typeof aiOrderReg==='function'){
    const baseOrder=aiOrderReg;
    aiOrderReg=function aiOrderRegHoldSquare(reg,p,formation='line',facing=null){
      if(reg&&!reg.destroyed&&reg.formation==='square'&&formation!=='square'){
        const c=typeof groupCenterV070==='function'?groupCenterV070(reg):null;
        if(c&&nearestEnemy(c.x,c.y,reg.side,HORSE_NEAR,horse)){stats.held++;return;}
      }
      return baseOrder.apply(this,arguments);
    };
  }

  // 2. A charger that reaches a steady square runs aground on it. The charge
  // still crashes into the front rank (melee-realism weakens that blow against a
  // square), but the horse will not press on into the bayonets: once the charge
  // is spent it swerves along the face, and it never passes the line of men into
  // the hollow. The square is taken as a whole (centre, once per step).
  const shapes=new WeakMap(),PUSH=1.5;
  function shape(reg){
    let g=shapes.get(reg);if(g&&g.at===elapsed)return g;
    const men=regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
    const c=men.length?centroid(men):{x:0,y:0};let r=0;for(const u of men)r=Math.max(r,Math.hypot(u.x-c.x,u.y-c.y));
    g={at:elapsed,x:c.x,y:c.y,r};shapes.set(reg,g);return g;
  }
  // The square this horse is at, the man nearest it, and its once-per-approach decision.
  function approach(u){
    const e=nearestEnemy(u.x,u.y,u.side,REACH+120,onFace),reg=e&&regOf(e);
    const g=reg&&shape(reg),d=g?Math.hypot(g.x-u.x,g.y-u.y):Infinity;
    if(!g||d>g.r+REACH){approaches.delete(u);return null;}
    let a=approaches.get(u);
    if(!a||a.reg!==reg){
      a={reg,refuse:sample(u.id,reg.id)<steadiness(reg)*.92};approaches.set(u,a);
      if(a.refuse)stats.refusals++;else stats.closed++;
    }
    return {a,g,d,e};
  }
  const baseMove=moveToward;
  moveToward=function moveTowardSquareRefusal(u,tx,ty,dt,speed=TYPES[u.type].speed){
    if(!u||u.type!=='cavalry'||u.dead||u.routing||u.chargeTimer>0)return baseMove.apply(this,arguments);
    const at=approach(u);if(!at||!at.a.refuse)return baseMove.apply(this,arguments);
    const {g,d}=at,dx=g.x-u.x,dy=g.y-u.y;
    // Riding away or along the face is always possible.
    if((tx-u.x)*dx+(ty-u.y)*dy<=0)return baseMove.apply(this,arguments);
    // It shies and swerves around the square, edging back off the bayonets.
    const side=u.id%2?1:-1,away=d<g.r+REACH*.8?-.7:0;
    const gx=u.x+(-dy/d*side+dx/d*away)*40,gy=u.y+(dx/d*side+dy/d*away)*40;
    return baseMove.call(this,u,gx,gy,dt,speed*.55);
  };

  // Whatever moves such a horse (contact pushes, crowding, a square forming
  // round it), it is eased back out past the line of men, a little each step.
  const baseUnit=updateUnit;
  updateUnit=function updateUnitSquareHedge(u,dt){
    const result=baseUnit.apply(this,arguments);
    if(u?.type!=='cavalry'||u.dead)return result;
    let at=null;
    if(u.routing){const e=nearestEnemy(u.x,u.y,u.side,REACH+120,onFace),reg=e&&regOf(e);
      // A fleeing horse does not run onto the bayonets either.
      if(reg&&steadiness(reg)>.4){const g=shape(reg);at={g,e,d:Math.hypot(g.x-u.x,g.y-u.y)};}}
    else{at=approach(u);if(!at?.a.refuse)at=null;}
    if(at){
      const {g,e,d}=at,line=Math.hypot(e.x-g.x,e.y-g.y)+(TYPES.cavalry.radius||10);
      if(d<line){const k=Math.min(PUSH,line-d)/(d||1);u.x+=(u.x-g.x)*k;u.y+=(u.y-g.y)*k;}
    }
    return result;
  };

  // A horse held off at the bayonets cannot reach the men with the sabre. Its
  // first blow is the charge crashing into the face; that breaks the charge, and
  // after it the horse strikes nothing in a steady square.
  const baseFire=fire;
  fire=function fireSquareHedge(u,e){
    const a=u?.type==='cavalry'&&e&&inSquare(e)?approaches.get(u):null;
    if(!a?.refuse||a.reg!==regOf(e))return baseFire.apply(this,arguments);
    if(a.crashed){stats.parried++;return;}
    // The square takes the crash: men may fall, but its morale gives only a
    // little - shoulder to shoulder, facing out, they shrug off a horse that
    // pulls up at the bayonets.
    const men=regimentMembers(a.reg),morale=men.map(m=>m.morale);
    a.crashed=true;const result=baseFire.apply(this,arguments);
    men.forEach((m,i)=>{if(!m.dead&&Number.isFinite(morale[i])&&m.morale<morale[i]-3)m.morale=morale[i]-3;});
    u.chargeTimer=0;u.chargeMomentumV1=0;return result;
  };

  root.NRTS?.events?.on?.('game:reset',()=>{approaches=new WeakMap();stats.held=stats.refusals=stats.closed=stats.parried=0;});
  root.__SQUARE_V1__=Object.freeze({version:'1.1',reach:REACH,horseNear:HORSE_NEAR,steadiness,stats:()=>({...stats})});
})(window);
