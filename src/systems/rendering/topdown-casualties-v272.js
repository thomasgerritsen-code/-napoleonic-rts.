'use strict';
// v272: readable casualty poses and hit-stagger; no combat/damage changes.
(function installTopdownCasualtiesV272(root){
  if(!root.NRTS)return;
  const LIMIT=130;
  const stats={fallsDrawn:0,hitFlinches:0,variants:new Set()};
  const in2D=()=>true;
  function variant(event){
    const seed=(Math.imul(Number(event.id||1),2654435761)>>>0);
    return seed%3;
  }
  function drawFallen(events,now){
    if(!in2D())return;
    const first=Math.max(0,events.length-LIMIT);
    ctx.save();
    for(let i=events.length-1;i>=first;i--){
      const e=events[i],age=now-e.born;
      if(age<0||age>=e.life||!isWorldVisible(e.x,e.y,25))continue;
      const t=Math.min(1,age/(.35+(variant(e)*.055)));
      const fall=1-Math.pow(1-t,2);
      const kind=variant(e);
      stats.variants.add(kind);
      const opacity=Math.min(.83,Math.max(0,(e.life-age)*.43));
      ctx.save();ctx.globalAlpha=opacity;
      ctx.translate(e.x,e.y);
      const tip=(kind===1?-1:1);
      ctx.rotate((e.facing||0)+tip*fall*(kind===2?1.20:.83));
      // Shadow, flattened coat, pale head and detached, fallen musket.
      ctx.fillStyle='rgba(22,22,17,.24)';
      ctx.beginPath();ctx.ellipse(-1+fall*4,2,9+fall*3,4+fall*2,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=e.type==='cavalry'?'#594432':e.side==='france'?'#34558c':'#9e3b34';
      ctx.beginPath();
      ctx.ellipse(-1,fall*tip*3,5.4+fall*4,5.2-fall*.8,tip*fall*.65,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d3b08a';ctx.beginPath();ctx.arc(4+fall*2,tip*fall*5,2.6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#272828';ctx.beginPath();ctx.ellipse(5+fall*4,tip*fall*6.7,2.35,3.1,.45,0,Math.PI*2);ctx.fill();
      if(e.type==='infantry'||e.type==='officer'){
        ctx.strokeStyle='#524333';ctx.lineWidth=1.3;
        ctx.beginPath();ctx.moveTo(-4,-9+kind*2);ctx.lineTo(11+fall*5,-8-kind*3);ctx.stroke();
        ctx.strokeStyle='#b4afa1';ctx.lineWidth=.7;ctx.beginPath();
        ctx.moveTo(9+fall*5,-8-kind*3);ctx.lineTo(14+fall*5,-8-kind*3);ctx.stroke();
      }
      ctx.restore();stats.fallsDrawn++;
    }
    ctx.restore();
  }
  const baseDrawUnit=drawUnit;
  drawUnit=function drawHitReactionV272(u){
    const result=baseDrawUnit(u);
    if(!in2D()||!u||u.dead||!isWorldVisible(u.x,u.y,24))return result;
    const anim=root.__COMBAT_ANIMATIONS_V1__?.animationFor(u);
    if(anim?.kind!=='hit-reaction')return result;
    const hit=Math.sin(anim.t*Math.PI);
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
    ctx.globalAlpha=.38*hit;
    ctx.strokeStyle='#b7865f';ctx.lineWidth=1.4;
    ctx.beginPath();ctx.moveTo(-5,-5);ctx.lineTo(-9-hit*4,-9);
    ctx.moveTo(-5,5);ctx.lineTo(-9-hit*4,9);ctx.stroke();
    ctx.restore();stats.hitFlinches++;
    return result;
  };
  const api=Object.freeze({
    version:'272.0',visualOnly:true,projection:'Canvas2D',
    drawFallen,variant,
    stats:()=>({fallsDrawn:stats.fallsDrawn,hitFlinches:stats.hitFlinches,variants:[...stats.variants],cap:LIMIT})
  });
  root.__TOPDOWN_CASUALTIES_V272__=api;
  root.NRTS.subsystems.register('topdown-casualties-v272',api,{
    phase:'2d-only',legacyBridge:false,responsibility:'three distinct readable, bounded casualty silhouettes and visual hit flinches'
  });
})(window);
