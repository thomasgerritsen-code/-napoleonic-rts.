'use strict';
// Regiment Visual Hierarchy V1: presentation-only LOD layered over the detailed character renderer.
(function installRegimentVisualHierarchy(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before regiment visual hierarchy.');
  const detailedDrawUnit=drawUnit;
  const MASS_ZOOM=0.55;
  const SILHOUETTE_ZOOM=0.90;

  function lodForZoom(zoom){
    const z=Number.isFinite(zoom)?zoom:1;
    if(z<MASS_ZOOM)return'mass';
    if(z<SILHOUETTE_ZOOM)return'silhouette';
    return'detail';
  }

  function visible(u){
    return typeof isWorldVisible!=='function'||isWorldVisible(u.x,u.y,34);
  }

  function sidePalette(u){
    return u.routing
      ?{main:'#77736f',light:'#a29d94',dark:'#3e3c39'}
      :u.side==='france'
        ?{main:'#254c8d',light:'#87a9dd',dark:'#172b4c'}
        :{main:'#a93430',light:'#e0a29d',dark:'#5a1d1a'};
  }

  function selectionRing(u,radius){
    if(!selectedUnits.has(u))return;
    ctx.strokeStyle=COLORS.selected;
    ctx.lineWidth=2/camera.zoom;
    ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();
  }

  function drawMass(u){
    const p=sidePalette(u);
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
    selectionRing(u,10);
    ctx.fillStyle=p.dark;
    ctx.beginPath();ctx.ellipse(-0.8,0,7.6,5.1,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.main;
    ctx.beginPath();ctx.ellipse(0,0,6.6,4.25,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.light;
    ctx.fillRect(3.4,-1.15,4.1,2.3);
    ctx.restore();
  }

  function drawSilhouette(u){
    const p=sidePalette(u);
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
    selectionRing(u,12);
    if(u.type==='cavalry'){
      ctx.fillStyle='#4a382e';ctx.beginPath();ctx.ellipse(-1,0,11,4.8,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=p.main;ctx.beginPath();ctx.ellipse(0,0,4.4,3.4,0,0,Math.PI*2);ctx.fill();
    }else if(u.type==='artillery'){
      ctx.strokeStyle='#3e3328';ctx.lineWidth=3/camera.zoom;
      ctx.beginPath();ctx.moveTo(-8,2);ctx.lineTo(9,-1);ctx.stroke();
      ctx.fillStyle=p.main;ctx.beginPath();ctx.arc(-2,0,3.4,0,Math.PI*2);ctx.fill();
    }else{
      ctx.fillStyle=p.dark;ctx.beginPath();ctx.ellipse(-.5,0,6.8,5.5,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=p.main;ctx.beginPath();ctx.ellipse(0,0,5.8,4.7,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#25282a';ctx.beginPath();ctx.ellipse(3.1,0,2.4,2.9,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=p.light;ctx.lineWidth=1.15/camera.zoom;
      ctx.beginPath();ctx.moveTo(-2.8,-3.1);ctx.lineTo(2.8,3.1);ctx.stroke();
    }
    ctx.strokeStyle=p.light;ctx.lineWidth=1.35/camera.zoom;
    ctx.beginPath();ctx.moveTo(4.5,0);ctx.lineTo(9,0);ctx.stroke();
    ctx.restore();
  }

  drawUnit=function drawUnitRegimentVisualHierarchyV1(u){
    if(!u||u.dead||!visible(u))return;
    const lod=lodForZoom(camera.zoom);
    if(lod==='detail')return detailedDrawUnit(u);
    if(lod==='silhouette')return drawSilhouette(u);
    return drawMass(u);
  };

  const api=Object.freeze({
    version:'regiment-visual-hierarchy-v1',
    lodForZoom,
    thresholds:Object.freeze({massBelow:MASS_ZOOM,silhouetteBelow:SILHOUETTE_ZOOM}),
    presentationOnly:true,
    viewportCulled:true,
    lowZoomMoraleBars:false,
    lowZoomRegimentRings:false
  });
  if(!nrts.subsystems.has('regiment-visual-hierarchy')){
    nrts.subsystems.register('regiment-visual-hierarchy',api,{phase:'2d-presentation',legacyBridge:false,responsibility:'zoom-aware regiment readability and low-cost unit LOD'});
  }
  global.__REGIMENT_VISUAL_HIERARCHY_V1__=api;
})(window);
