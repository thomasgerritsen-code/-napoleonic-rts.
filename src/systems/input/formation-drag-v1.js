'use strict';
// ---------- Architecture v2.1: formation drag input authority ----------
(function installFormationDragInputV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before formation drag input.');
  const state={pointerId:null,button:null,sx:0,sy:0,ex:0,ey:0,moved:false,lastFacing:null,orders:0,selections:0};

  canvas.addEventListener('pointerdown',e=>{
    if(state.pointerId!==null)return;
    if(e.button!==0&&e.button!==2)return;
    if(buildMode)return;
    state.pointerId=e.pointerId;state.button=e.button;state.sx=state.ex=e.clientX;state.sy=state.ey=e.clientY;state.moved=false;
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==state.pointerId)return;
    state.ex=e.clientX;state.ey=e.clientY;
    if(Math.hypot(state.ex-state.sx,state.ey-state.sy)>9)state.moved=true;
  },true);
  canvas.addEventListener('pointerup',e=>{
    if(e.pointerId!==state.pointerId)return;
    const button=state.button,moved=state.moved,sx=state.sx,sy=state.sy,ex=e.clientX,ey=e.clientY;
    state.pointerId=null;state.button=null;state.moved=false;
    if(!moved||buildMode)return;
    if(button===0){
      selectBox(sx,sy,ex,ey);state.selections++;return;
    }
    if(button===2){
      const destination=screenToWorld(sx,sy),front=screenToWorld(ex,ey);
      const facing=Math.atan2(front.y-destination.y,front.x-destination.x);
      issueMoveWithFacingV06(destination.x,destination.y,facing);
      state.lastFacing=facing;state.orders++;
      if(statusEl)statusEl.textContent='Bataljon marcheert naar het sleepstartpunt en neemt de gesleepte frontrichting in.';
    }
  },true);
  canvas.addEventListener('pointercancel',e=>{if(e.pointerId===state.pointerId){state.pointerId=null;state.button=null;state.moved=false;}},true);

  const api=Object.freeze({
    version:'formation-drag-v1',
    dragSelect:true,
    dragFacing:true,
    state:()=>({active:state.pointerId!==null,lastFacing:state.lastFacing,orders:state.orders,selections:state.selections})
  });
  global.__FORMATION_DRAG_V1__=api;
  nrts.subsystems.register('formation-drag-input',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'robust pointer-based box selection and destination-plus-facing drag commands'});
})(window);
