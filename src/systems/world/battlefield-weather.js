'use strict';
(function installBattlefieldWeatherV1(global){
  const nrts=global.NRTS;if(!nrts)throw new Error('NRTS required');
  const scars=[];const weather={kind:'clear',windX:4,windY:-1,timeOfDay:'morning'};
  function updateWeather(){weather.timeOfDay=elapsed<180?'morning':elapsed<420?'midday':'evening';weather.kind=elapsed<210?'clear':elapsed<330?'rain':elapsed<450?'mist':'clear';}
  const oldDamage=applyDamage;applyDamage=function(victim,damage,shock=8){const wasAlive=victim&&!victim.dead;const r=oldDamage(victim,damage,shock);if(wasAlive&&victim?.kind==='unit'&&victim.dead)scars.push({x:victim.x,y:victim.y,side:victim.side,created:elapsed});return r;};
  const oldParticles=updateParticles;updateParticles=function(dt){updateWeather();for(const p of particles){p.vx=(p.vx||0)+weather.windX*dt*.18;p.vy=(p.vy||0)+weather.windY*dt*.18;}return oldParticles(dt);};
  const oldVision=visionRadius;visionRadius=function(e){return oldVision(e)*(weather.kind==='mist'?.68:weather.kind==='rain'?.9:1);};
  const oldSpeed=desiredGroupSpeedV064;desiredGroupSpeedV064=function(reg,...args){return oldSpeed(reg,...args)*(weather.kind==='rain'?.9:1);};
  const oldDraw=draw;draw=function(){oldDraw();ctx.save();for(const s of scars.slice(-220)){const p=worldToScreen(s.x,s.y);ctx.globalAlpha=.16;ctx.fillStyle='#2b241f';ctx.beginPath();ctx.ellipse(p.x,p.y,5*camera.zoom,2.5*camera.zoom,0,0,Math.PI*2);ctx.fill();}if(weather.kind==='mist'){ctx.globalAlpha=.08;ctx.fillStyle='#d7d9d2';ctx.fillRect(0,0,innerWidth,innerHeight);}else if(weather.kind==='rain'){ctx.globalAlpha=.18;ctx.strokeStyle='#d7e1e8';ctx.lineWidth=1;for(let x=0;x<innerWidth;x+=55){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-14,innerHeight);ctx.stroke();}}if(weather.timeOfDay==='evening'){ctx.globalAlpha=.08;ctx.fillStyle='#5b463e';ctx.fillRect(0,0,innerWidth,innerHeight);}ctx.restore();};
  const api=Object.freeze({state:()=>({...weather}),scars:()=>scars.slice(),setWeather:k=>{if(['clear','rain','mist'].includes(k))weather.kind=k;}});nrts.subsystems.register('battlefield-weather',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'battlefield aftermath, weather, wind, visibility and time-of-day atmosphere'});global.__BATTLEFIELD_WEATHER_V1__=api;
})(window);
