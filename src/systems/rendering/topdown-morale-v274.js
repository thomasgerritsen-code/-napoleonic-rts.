'use strict';
// v274: visible disorder and real routing feedback, respecting the existing
// moraleShock, routeUnit and command-morale authorities.
(function installTopdownMoraleV274(root){
  if(!root.NRTS)return;
  const stats={waveringDraws:0,routingDraws:0,regimentsMarked:0};
  const enabled=()=>!root.__BATTLEFIELD_3D_V1__?.enabled?.();
  function stateFor(u){
    if(!u||u.dead||u.type==='worker')return'steady';
    if(u.routing)return'routing';
    return(u.morale??100)<25?'panicking':(u.morale??100)<48?'wavering':'steady';
  }
  const baseDrawUnit=drawUnit;
  drawUnit=function drawMoraleDisorderV274(u){
    const state=stateFor(u);
    if(!enabled()||state==='steady'||!u||!isWorldVisible(u.x,u.y,26))
      return baseDrawUnit(u);
    // Small SCREEN-ONLY jitter. No real position, formation target or
    // movement authority is changed.
    const power=state==='routing'?1.9:state==='panicking'?1.35:.55;
    const wiggle=Math.sin(elapsed*7.7+u.id*2.137)*power;
    ctx.save();ctx.translate(-Math.sin(u.facing||0)*wiggle,Math.cos(u.facing||0)*wiggle);
    const result=baseDrawUnit(u);
    ctx.restore();
    if(state==='routing'){stats.routingDraws++;}
    else stats.waveringDraws++;
    if(camera.zoom>.8&&state!=='wavering'){
      ctx.save();ctx.globalAlpha=.35+.16*Math.sin(elapsed*5+u.id);
      ctx.strokeStyle=state==='routing'?'#ad7263':'#d4a96c';
      ctx.lineWidth=1.1;
      ctx.beginPath();ctx.arc(u.x,u.y,10+Math.sin(elapsed*6+u.id)*1.1,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    return result;
  };
  const baseMarkers=drawRegimentMarkers;
  drawRegimentMarkers=function drawRegimentMoraleV274(){
    baseMarkers();
    if(!enabled())return;
    let count=0;
    ctx.save();ctx.textAlign='center';ctx.font='bold 10px sans-serif';
    for(const reg of regiments){
      if(count>=18)break;
      if(reg.destroyed||!(reg.morale<49))continue;
      const soldiers=regimentMembers(reg).filter(u=>!u.dead);
      if(!soldiers.length)continue;
      const p=centroid(soldiers);
      if(!isWorldVisible(p.x,p.y,110))continue;
      const routed=soldiers.filter(u=>u.routing).length;
      const message=routed>=Math.max(2,soldiers.length*.35)?'VLUCHT':
        reg.morale<26?'PANIEK':'ONRUST';
      ctx.fillStyle=message==='VLUCHT'?'#b86655':message==='PANIEK'?'#d79c67':'#edc77f';
      ctx.globalAlpha=.9;
      ctx.fillText(message,p.x,p.y-48);
      stats.regimentsMarked++;count++;
    }
    ctx.restore();
  };
  const api=Object.freeze({
    version:'274.0',projection:'Canvas2D',visualOnly:true,
    stateFor,usesExistingMorale:true,usesExistingRouting:true,
    stats:()=>({...stats})
  });
  root.__TOPDOWN_MORALE_V274__=api;
  root.NRTS.subsystems.register('topdown-morale-v274',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'visible wavering and panicked regiments via existing damage shock and routing states'
  });
})(window);
