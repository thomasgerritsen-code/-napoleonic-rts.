'use strict';
// v275: readable charge gait/hoof impacts and actual deployed infantry square.
// Charge damage and square defence already come from cavalry-artillery.js.
(function installTopdownCavalryV275(root){
  if(!root.NRTS)return;
  const trails=[],motion=new Map(),MAX_DUST=140;
  const stats={galloping:0,dustEmitted:0,dustDrawn:0,squares:0,squaresProtected:0};
  const enabled=()=>!root.__BATTLEFIELD_3D_V1__?.enabled?.();
  function chargeFor(u){
    return u?.type==='cavalry'&&!u.dead&&!u.routing&&(u.chargeTimer||0)>0;
  }
  function sample(u){
    const prev=motion.get(u.id),now=elapsed;
    if(!prev||now<prev.t||now-prev.t>1){
      motion.set(u.id,{x:u.x,y:u.y,t:now,lastDust:now});return;
    }
    const dt=now-prev.t;
    if(dt<.06)return;
    const dx=u.x-prev.x,dy=u.y-prev.y,distance=Math.hypot(dx,dy);
    if(distance>3&&distance<45&&chargeFor(u)&&now-prev.lastDust>.13){
      const facing=u.facing||0;
      trails.push({x:u.x-Math.cos(facing)*11,y:u.y-Math.sin(facing)*11,
        born:now,seed:u.id});
      if(trails.length>MAX_DUST)trails.shift();
      prev.lastDust=now;stats.dustEmitted++;
    }
    prev.x=u.x;prev.y=u.y;prev.t=now;
  }
  // Unlike an ornamental square marker, a deployed infantry square
  // actually blunts an incoming mounted charge. The reduction is limited to
  // this single synchronous melee hit and only while the 2D view is active.
  // It never changes pathfinding, soldier positions or 3D combat.
  const squareMultiplier=.35;
  function defendedSquare(attacker,enemy){
    if(!enabled()||!chargeFor(attacker)||!enemy||enemy.dead||
        enemy.kind!=='unit'||!enemy.regimentId||enemy.side===attacker.side)return false;
    const reg=getRegiment(enemy.regimentId);
    if(!reg||reg.destroyed||reg.formation!=='square'||
      groupKindV06(reg)!=='infantry'||reg.crossingTrafficV068?.forcedColumn)return false;
    return regimentMembers(reg).filter(u=>u.type==='infantry'&&!u.dead&&!u.routing).length>=8;
  }
  const priorFire=fire;
  fire=function fireSquareCounterchargeV275(attacker,enemy){
    if(!defendedSquare(attacker,enemy))return priorFire.apply(this,arguments);
    // Historical baseline fire and the live v06 combat wrappers read
    // TYPES.cavalry.damage synchronously, so reducing it for this ONE
    // charge reaches the original damage calculation. Always restore it
    // afterwards, including when a wrapper throws.
    const original=TYPES.cavalry.damage;
    TYPES.cavalry.damage=original*squareMultiplier;
    try{
      const result=priorFire.apply(this,arguments);
      stats.squaresProtected++;
      return result;
    }finally{TYPES.cavalry.damage=original;}
  };

  const baseDraw=drawUnit;
  drawUnit=function drawTopdownChargeV275(u){
    if(!u||u.dead||!enabled())return baseDraw(u);
    if(u.type==='cavalry')sample(u);
    const result=baseDraw(u);
    if(chargeFor(u)&&isWorldVisible(u.x,u.y,30)){
      stats.galloping++;
      const momentum=root.__CAVALRY_ARTILLERY_V1__?.momentum?.(u)||0;
      ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
      const flash=Math.max(.15,Math.min(1,.4+momentum*.6));
      ctx.globalAlpha=.35*flash;ctx.strokeStyle='#bfb9a2';ctx.lineWidth=1.25;
      ctx.beginPath();ctx.moveTo(-12,-7);ctx.lineTo(-22-momentum*6,-7);
      ctx.moveTo(-12,7);ctx.lineTo(-22-momentum*6,7);ctx.stroke();
      ctx.restore();
    }
    return result;
  };
  const baseParticles=drawParticles;
  drawParticles=function drawHoofDustV275(){
    baseParticles();
    if(!enabled())return;
    ctx.save();ctx.fillStyle='#b3a48a';
    for(let i=trails.length-1;i>=0;i--){
      const d=trails[i],age=elapsed-d.born;
      if(age>1.55||age<0){trails.splice(i,1);continue;}
      if(!isWorldVisible(d.x,d.y,20))continue;
      ctx.globalAlpha=.18*(1-age/1.55);
      ctx.beginPath();ctx.ellipse(d.x,d.y,3+age*7,1.7+age*5,
        d.seed%7*.15,0,Math.PI*2);ctx.fill();
      stats.dustDrawn++;
    }
    ctx.restore();
  };
  const baseMarkers=drawRegimentMarkers;
  drawRegimentMarkers=function drawSquareDefenceV275(){
    baseMarkers();
    if(!enabled())return;
    ctx.save();ctx.strokeStyle='rgba(221,215,189,.55)';ctx.lineWidth=1.15;
    let count=0;
    for(const reg of regiments){
      if(count>=12)break;
      if(reg.destroyed||reg.formation!=='square'||reg.crossingTrafficV068?.forcedColumn)continue;
      const members=regimentMembers(reg).filter(u=>!u.dead&&u.type==='infantry');
      if(members.length<8)continue;
      const c=centroid(members);
      if(!isWorldVisible(c.x,c.y,150))continue;
      const minX=Math.min(...members.map(m=>m.x)),maxX=Math.max(...members.map(m=>m.x));
      const minY=Math.min(...members.map(m=>m.y)),maxY=Math.max(...members.map(m=>m.y));
      // Four exposed square faces are highlighted; no new formation
      // movement commands, unit positions or charge multipliers are changed.
      ctx.setLineDash([4,4]);
      ctx.strokeRect(minX-8,minY-8,Math.max(16,maxX-minX+16),Math.max(16,maxY-minY+16));
      ctx.setLineDash([]);
      ctx.font='bold 10px sans-serif';ctx.textAlign='center';
      ctx.fillStyle='rgba(238,231,201,.92)';ctx.fillText('CARRÉ',c.x,c.y-38);
      stats.squares++;count++;
    }
    ctx.restore();
  };
  const oldReset=resetGame;
  resetGame=function resetCavalryDustV275(){
    trails.length=0;motion.clear();return oldReset.apply(this,arguments);
  };
  const api=Object.freeze({
    version:'275.0',projection:'Canvas2D',chargeFor,defendedSquare,
    existingSquareDefence:squareMultiplier,
    squareDefenceOnly2D:true,
    stats:()=>({...stats,dustCount:trails.length,maxDust:MAX_DUST})
  });
  root.__TOPDOWN_CAVALRY_V275__=api;
  root.NRTS.subsystems.register('topdown-cavalry-v275',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'momentum-synced charge art, hoof dust and real 2D-only cavalry damage mitigation by deployed infantry squares'
  });
})(window);
