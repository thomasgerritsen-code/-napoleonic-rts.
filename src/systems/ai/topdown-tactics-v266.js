'use strict';
// v266: incremental utility-based tactical planning for the 2D game.
// Reuses the original AI commander, its formation orders and proven pathfinder.
(function installTopdownTacticsV266(root){
  if(!root.NRTS||typeof aiAttack!=='function'||typeof aiFlank!=='function')return;
  const originalAttack=aiAttack,originalFlank=aiFlank,originalChoose=aiChooseState;
  const stats={attacks:0,reserveChoices:0,flankChoices:0,pressureRetreats:0,protectedCrossings:0};
  const only2d=()=>!root.__BATTLEFIELD_3D_V1__?.enabled?.();
  const clock=()=>Number(elapsed)||0;
  const clamp=x=>Math.max(0,Math.min(1,x));
  let pressureSince=-Infinity,lastFlankAt=-Infinity;
  function members(reg){return regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);}
  function condition(reg){
    const units=members(reg);
    if(!units.length)return 0;
    return units.reduce((sum,u)=>sum+.58*clamp(u.hp/Math.max(1,u.maxHp))+
      .42*clamp((u.morale??100)/100),0)/units.length;
  }
  function hasCrossing(reg){
    const crossing=reg?.crossingTrafficV068;
    if(crossing?.forcedColumn&&crossing.state!=='clearing')return true;
    const state=root.__ROAD_COLUMN_V257__?.state?.(reg);
    return state?.phase==='bridge';
  }
  function flankPressure(target,origin,enemies,offset=220){
    const dx=target.x-origin.x,dy=target.y-origin.y,d=Math.hypot(dx,dy)||1;
    const normal={x:-dy/d,y:dx/d};
    function score(side){
      const px=target.x+normal.x*side*offset,py=target.y+normal.y*side*offset;
      return enemies.reduce((s,u)=>{
        const distance=Math.hypot(u.x-px,u.y-py);
        if(distance>320)return s;
        const weight=u.type==='artillery'?1.6:u.type==='cavalry'?1.3:1;
        return s+weight*Math.max(.05,1-distance/320)*clamp((u.morale??100)/100);
      },0);
    }
    return{left:score(-1),right:score(1)};
  }
  function weakerSide(scores){return scores.left<=scores.right?-1:1;}
  function bestReserve(regs){
    return regs.filter(r=>!hasCrossing(r)).sort((a,b)=>condition(a)-condition(b))[0]||null;
  }
  aiAttack=function aiAttack2dUtilityV266(regs,tc,target){
    if(!only2d()||!Array.isArray(regs)||regs.length<3)return originalAttack.apply(this,arguments);
    stats.attacks++;
    // The most exhausted usable regiment becomes reserve instead of
    // automatically selecting the last one in an unstable array.
    const reserve=bestReserve(regs);
    if(!reserve)return originalAttack.apply(this,arguments);
    const ordered=regs.filter(r=>r!==reserve).concat(reserve);
    stats.reserveChoices++;
    return originalAttack.call(this,ordered,tc,target);
  };
  aiFlank=function aiFlank2dUtilityV266(regs,tc,target){
    if(!only2d()||!target||!regs?.length)return originalFlank.apply(this,arguments);
    const origin=tc||(regs[0]?centroid(members(regs[0])):target);
    const foes=livingUnits('france').filter(u=>!u.dead&&!u.routing&&u.type!=='worker');
    const side=weakerSide(flankPressure(target,origin,foes));
    if(clock()-lastFlankAt>12&&!regs.some(hasCrossing)){
      AI_COMMANDER_V1.flankSide=side;
      lastFlankAt=clock();
      stats.flankChoices++;
    }
    return originalFlank.apply(this,arguments);
  };
  aiChooseState=function aiChooseState2dUtilityV266(regs){
    const base=originalChoose.apply(this,arguments);
    if(!only2d()||v05PeaceMode||gameOver||!['ATTACK','ADVANCE','FLANK'].includes(base))
      return base;
    if(!regs?.length||regs.some(hasCrossing)){stats.protectedCrossings++;return base;}
    // Utility trigger: regroup when multiple British regiments are suppressed
    // locally by superior French strength. Let the existing commander perform
    // the retreat / regroup safely through its normal order and route APIs.
    const threatened=regs.reduce((count,r)=>{
      const here=members(r),p=here.length?centroid(here):null;
      if(!p)return count;
      const enemy=livingUnits('france').filter(u=>!u.dead&&!u.routing&&u.type!=='worker'&&
        Math.hypot(u.x-p.x,u.y-p.y)<270);
      const localEnemy=enemy.reduce((s,u)=>s+clamp((u.morale??100)/100),0);
      const own=here.reduce((s,u)=>s+clamp((u.morale??100)/100),0);
      return count+(localEnemy>own*1.6 && condition(r)<.61?1:0);
    },0);
    if(threatened>=Math.min(2,regs.length)&&clock()-pressureSince>18){
      pressureSince=clock();stats.pressureRetreats++;return 'REGROUP';
    }
    return base;
  };
  const api=Object.freeze({
    version:'266.0',projection:'Canvas2D',ordersVia:'existing-aiOrderReg',
    condition,flankPressure,weakerSide,
    stats:()=>({...stats,activeOnlyIn2D:only2d(),pressureSince,lastFlankAt})
  });
  root.__TOPDOWN_TACTICS_V266__=api;
  root.NRTS.subsystems.register('topdown-tactics-v266',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'utility-ranked reserve/flank selections and tactical regroup via existing commander; never writes unit positions'
  });
})(window);
