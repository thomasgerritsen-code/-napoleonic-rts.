'use strict';
// v273: render-only, staged Napoleonic field-gun loading cycle.
(function installTopdownGunCrewV273(root){
  if(!root.NRTS||typeof fire!=='function')return;
  const stats={cannonShots:0,stageQueries:0};
  const original=fire;
  fire=function fireGunCrewAnimationV273(unit,enemy){
    const before=unit?.reload;
    const result=original.apply(this,arguments);
    if(unit?.type==='artillery'&&!unit.dead&&unit.reload>before){
      unit.artilleryVisualV273={started:elapsed,reloadDuration:Math.max(1,unit.reload)};
      stats.cannonShots++;
    }
    return result;
  };
  function phaseFor(unit){
    stats.stageQueries++;
    const data=unit?.artilleryVisualV273;
    if(!data||!Number.isFinite(elapsed)||elapsed<data.started)return{stage:'ready',recoil:0,ram:0,crewShift:0};
    const age=elapsed-data.started;
    const duration=Math.max(1,data.reloadDuration);
    if(age<.33)return{stage:'recoil',recoil:Math.sin(Math.min(1,age/.33)*Math.PI)*9,ram:0,crewShift:3};
    const t=Math.min(1,(age-.33)/Math.max(.1,duration-.33));
    if(t<.23)return{stage:'sponge',recoil:0,ram:.4+Math.sin(t/.23*Math.PI)*.6,crewShift:-2};
    if(t<.53)return{stage:'charge',recoil:0,ram:0,crewShift:-3};
    if(t<.86)return{stage:'ram',recoil:0,ram:.6+Math.sin((t-.53)/.33*Math.PI)*.4,crewShift:-2};
    return{stage:'ready',recoil:0,ram:0,crewShift:0};
  }
  const api=Object.freeze({version:'273.0',projection:'Canvas2D',visualOnly:true,phaseFor,
    stages:['recoil','sponge','charge','ram','ready'],
    stats:()=>({...stats})});
  root.__TOPDOWN_GUN_CREW_V273__=api;
  root.NRTS.subsystems.register('topdown-gun-crew-v273',api,{
    phase:'2d-only',legacyBridge:false,responsibility:'cannon firing recoil and staged visual crew sponge/charge/ram synchronized to real reload'
  });
})(window);
