'use strict';
// v267: direct mobile-friendly wind compass for Canvas2D smoke.
// Pure presentation control: movement, hit chances and ranges are untouched.
(function installTopdownWindControlV267(root){
  const ambient=root.__MAP_AMBIENT_MOTION_V1__;
  if(!root.NRTS||!ambient?.setWindDirection||!ambient?.currentWind)return;
  const directions=['→','↘','↓','↙','←','↖','↑','↗'];
  const button=document.createElement('button');
  button.id='topdown-wind-direction-v267';
  button.type='button';
  button.style.cssText='border-radius:8px;padding:5px 8px;min-width:74px;white-space:nowrap;touch-action:manipulation;';
  button.title='Windrichting van kruitrook: tik om 45° te draaien (alleen 2D)';
  const sound=document.getElementById('topdown-audio-toggle');
  if(sound)sound.insertAdjacentElement('afterend',button);
  else document.getElementById('resetBtn')?.insertAdjacentElement('afterend',button);
  function bearing(){
    const wind=ambient.currentWind();
    return (Math.atan2(wind.y,wind.x)*180/Math.PI+360)%360;
  }
  function refresh(){
    const degrees=bearing(),idx=Math.round(degrees/45)%8;
    button.textContent='Wind '+directions[idx];
    button.setAttribute('aria-label','Windrichting: '+Math.round(degrees)+' graden. Tik om de richting te wijzigen');
    button.dataset.directionDegrees=String(Math.round(degrees));
    return degrees;
  }
  button.addEventListener('click',()=>{
    if(root.__BATTLEFIELD_3D_V1__?.enabled?.())return;
    ambient.setWindDirection(bearing()+45);
    refresh();
  });
  refresh();
  const api=Object.freeze({
    version:'267.0',projection:'Canvas2D',visualOnly:true,buttonId:button.id,
    bearing,refresh,currentWind:ambient.currentWind
  });
  root.__TOPDOWN_WIND_V267__=api;
  root.NRTS.subsystems.register('topdown-wind-v267',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'tap-to-rotate smoke and ambient wind direction without simulation effects'
  });
})(window);
