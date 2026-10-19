'use strict';
// v268: view-only 2D wind vane. There is no button or user-operated setter.
// Animated black-powder smoke follows the autonomous ambient wind direction.
(function installTopdownWindIndicatorV268(root){
  const ambient=root.__MAP_AMBIENT_MOTION_V1__;
  if(!root.NRTS||!ambient?.currentWind)return;
  const directions=['→','↘','↓','↙','←','↖','↑','↗'];
  const indicator=document.createElement('span');
  indicator.id='topdown-wind-direction-v267'; // preserve existing element id
  indicator.className='topdown-wind-indicator';
  indicator.style.cssText='display:inline-flex;align-items:center;border-radius:8px;'+
    'padding:5px 8px;min-width:74px;white-space:nowrap;'+
    'pointer-events:none;user-select:none;opacity:.9;';
  indicator.setAttribute('role','status');
  indicator.setAttribute('aria-live','off');
  indicator.title='Automatische windrichting voor de 2D-kruitrook';
  const sound=document.getElementById('topdown-audio-toggle');
  if(sound)sound.insertAdjacentElement('afterend',indicator);
  else document.getElementById('resetBtn')?.insertAdjacentElement('afterend',indicator);

  function bearing(){
    const wind=ambient.currentWind();
    return (Math.atan2(wind.y,wind.x)*180/Math.PI+360)%360;
  }
  let lastUpdate=-Infinity;
  let lastDegrees=null;
  function refresh(){
    const degrees=bearing(),idx=Math.round(degrees/45)%8;
    const rounded=Math.round(degrees);
    if(rounded!==lastDegrees){
      indicator.textContent='Wind '+directions[idx];
      indicator.setAttribute('aria-label','Automatische windrichting: '+rounded+' graden');
      indicator.dataset.directionDegrees=String(rounded);
      lastDegrees=rounded;
    }
    indicator.hidden=false;
    indicator.style.display='inline-flex';
    return degrees;
  }

  // Update in the existing render loop instead of introducing a background
  // timer, which would drift on iPhones when the browser tab is suspended.
  const baseDrawParticles=drawParticles;
  drawParticles=function drawParticlesWithWindIndicatorV268(){
    if(elapsed<lastUpdate||elapsed-lastUpdate>=.22){
      lastUpdate=elapsed;
      refresh();
    }
    return baseDrawParticles.apply(this,arguments);
  };
  refresh();
  const api=Object.freeze({
    version:'268.0',projection:'Canvas2D',visualOnly:true,automatic:true,
    buttonId:null,indicatorId:indicator.id,
    bearing,refresh,currentWind:ambient.currentWind
  });
  root.__TOPDOWN_WIND_V267__=api; // stable discovery API for older consumers
  root.NRTS.subsystems.register('topdown-wind-v267',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'noninteractive wind-direction indicator for continuously evolving 2D smoke'
  });
})(window);
