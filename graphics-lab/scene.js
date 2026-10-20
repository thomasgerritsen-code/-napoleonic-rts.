// Napoleonic RTS Graphics Lab — isolated visual proof-of-concept (v319).
// No game simulation, no shared globals or changes to the playable game.
const W=1440,H=900,host=document.getElementById('scene-host'),viewport=document.getElementById('viewport');
const detailed=document.getElementById('detail-canvas'),oldCanvas=document.getElementById('old-canvas');
const detailCtx=detailed.getContext('2d'),oldCtx=oldCanvas.getContext('2d');
const ui={engine:document.getElementById('engine'),fps:document.getElementById('fps'),
 sprites:document.getElementById('sprites'),resolution:document.getElementById('resolution'),
 status:document.getElementById('status'),quality:document.getElementById('quality'),
 mode:document.getElementById('mode'),count:document.getElementById('count')};
const files=['battlefield.svg','oak.svg','barracks-france.svg','barracks-britain.svg','infantry-france.svg','infantry-britain.svg'];
const imgs={},treePositions=[[115,135,.92],[200,670,.85],[372,92,.78],[480,160,.73],[540,773,.95],
 [941,103,.86],[1110,122,.76],[1323,128,.95],[1255,750,.85],[1380,655,.84],
 [1088,830,.72],[250,810,.8],[1254,285,.78],[465,665,.75],[890,823,.67]];
const buildings=[{kind:'barracks-france.svg',x:300,y:235,size:235},
                 {kind:'barracks-britain.svg',x:1125,y:622,size:235}];
const state={mode:'new',count:32,quality:'balanced',zoom:1,camX:745,camY:452,
 fps:0,frames:0,frameClock:0,engine:'Canvas 2D (opstart)',selected:null,
 pixi:null,world:null,soldiers:[],pixiTrees:[],last:performance.now(),time:0,paused:false};
const soldiers=[];
const random=(n)=>{let x=(Math.imul(n+1234,1664525)+1013904223)>>>0;return x/4294967296};
function buildUnits(count){
  const per=Math.floor(count/2),newSoldiers=[];
  for(let i=0;i<per;i++){
    const col=i%8,row=Math.floor(i/8);
    newSoldiers.push({team:'france',x:405+col*21,y:325+row*25,phase:i*.6,id:i});
    newSoldiers.push({team:'britain',x:1030+col*21,y:555+row*25,phase:i*.6,id:i});
  }
  soldiers.splice(0,soldiers.length,...newSoldiers);
}
buildUnits(state.count);
function renderScale(){
 const rect=viewport.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,state.quality==='quality'?1.5:1.0);
 for(const canvas of [detailed,oldCanvas]){
   canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));
   canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
 }
 if(state.pixi){state.pixi.renderer.resize(rect.width,rect.height);}
 if(!state.customZoom)state.zoom=Math.min(1.30,Math.max(.36,Math.min(rect.width/1100,rect.height/650)));
 ui.resolution.textContent=dpr.toFixed(1)+'×';
 repositionPixi();
}
function worldScreen(x,y){
 const bounds=viewport.getBoundingClientRect();
 return{x:(x-state.camX)*state.zoom+bounds.width/2,y:(y-state.camY)*state.zoom+bounds.height/2};
}
function screenWorld(x,y){
 const b=viewport.getBoundingClientRect();
 return{x:(x-b.width/2)/state.zoom+state.camX,y:(y-b.height/2)/state.zoom+state.camY};
}
function repositionPixi(){
 if(!state.world)return;
 const b=viewport.getBoundingClientRect();
 state.world.scale.set(state.zoom);
 state.world.position.set(b.width/2-state.camX*state.zoom,b.height/2-state.camY*state.zoom);
}
function painter(ctx,now,stylized=false){
 if(!ctx)return;
 const dpr=detailed.width/Math.max(1,viewport.clientWidth);
 const local=stylized?oldCanvas:detailed;
 ctx.setTransform(1,0,0,1,0,0);
 ctx.clearRect(0,0,local.width,local.height);
 ctx.setTransform(dpr*state.zoom,0,0,dpr*state.zoom,
    dpr*(local.clientWidth/2-state.camX*state.zoom),dpr*(local.clientHeight/2-state.camY*state.zoom));
 if(stylized){
   ctx.fillStyle='#74845d';ctx.fillRect(0,0,W,H);
   ctx.strokeStyle='#89774f';ctx.lineWidth=130;ctx.lineCap='round';
   ctx.beginPath();ctx.moveTo(-50,385);ctx.bezierCurveTo(250,430,365,340,588,438);
   ctx.bezierCurveTo(840,530,1130,405,1480,417);ctx.stroke();
   ctx.strokeStyle='#b29a70';ctx.lineWidth=90;ctx.stroke();
   ctx.strokeStyle='#4e7d83';ctx.lineWidth=165;
   ctx.beginPath();ctx.moveTo(770,-60);ctx.bezierCurveTo(870,155,625,230,690,392);
   ctx.bezierCurveTo(755,555,888,576,755,726);ctx.bezierCurveTo(700,810,730,935,680,986);ctx.stroke();
   ctx.fillStyle='#a29c87';ctx.fillRect(655,449,225,75);
   for(const b of buildings){ctx.fillStyle=b.kind.includes('france')?'#5c6978':'#956854';
     ctx.fillRect(b.x-82,b.y-59,164,118);ctx.strokeStyle='#394542';ctx.lineWidth=6;
     ctx.strokeRect(b.x-82,b.y-59,164,118);}
   for(const [x,y,scale] of treePositions){ctx.fillStyle='#36573a';ctx.beginPath();ctx.arc(x,y,35*scale,0,7);ctx.fill();}
 }else{
   ctx.drawImage(imgs['battlefield.svg'],0,0,W,H);
   for(const [x,y,s]of treePositions){
     ctx.drawImage(imgs['oak.svg'],x-75*s,y-80*s,150*s,160*s);
   }
   for(const b of buildings){
     ctx.drawImage(imgs[b.kind],b.x-b.size/2,b.y-b.size/2,b.size,b.size);
   }
 }
 for(const u of soldiers){
   const sway=state.paused?0:Math.sin(now*.003+u.phase)*1.5;
   if(stylized){
     ctx.fillStyle=u.team==='france'?'#273d65':'#a14642';
     ctx.beginPath();ctx.arc(u.x,u.y+sway,7,0,7);ctx.fill();
     ctx.strokeStyle='#eee2c4';ctx.lineWidth=1;ctx.stroke();
   }else{
     const key=u.team==='france'?'infantry-france.svg':'infantry-britain.svg',size=29;
     ctx.drawImage(imgs[key],u.x-size/2,u.y+sway-size/2,size,size*1.35);
   }
 }
 if(state.selected){
   const team=state.selected==='france',x=team?400:1020,y=team?312:545;
   ctx.strokeStyle=stylized?'#eac876':'#f0d488';ctx.lineWidth=2.5;ctx.setLineDash([8,7]);
   ctx.strokeRect(x-23,y-23,212,Math.max(65,Math.ceil(state.count/16)*27+33));ctx.setLineDash([]);
 }
 ctx.setTransform(1,0,0,1,0,0);
}
function syncSoldiersPixi(Sprite,Graphics,Texture){
 const world=state.world;if(!world)return;
 for(const p of state.soldiers)p.destroy();
 state.soldiers=[];
 const frame=state.pixiTextures;
 for(const u of soldiers){
   const sp=new Sprite(frame[u.team==='france'?'infantry-france.svg':'infantry-britain.svg']);
   sp.anchor.set(.5);sp.position.set(u.x,u.y);
   sp.width=29;sp.height=39;
   world.addChild(sp);
   state.soldiers.push(sp);
 }
 state.selectionOutline?.destroy();
 state.selectionOutline=null;
 if(state.selected){
   const x=state.selected==='france'?377:997,y=state.selected==='france'?289:522;
   const rect=new Graphics().rect(x,y,214,Math.max(65,Math.ceil(state.count/16)*27+33))
      .stroke({width:2,color:0xf4d98e,alpha:.93});
   world.addChild(rect);state.selectionOutline=rect;
 }
}
async function startPixi(){
 try{
   // Pinned, publicly distributed PixiJS ESM build, isolated to this lab.
   const {Application,Assets,Sprite,Container,Graphics}=await import('https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs');
   const app=new Application();
   await app.init({preference:'webgl',resizeTo:viewport,background:0x667456,
     antialias:true,autoDensity:true,resolution:Math.min(devicePixelRatio||1,1.5)});
   const base=await Promise.all(files.map(f=>Assets.load('./assets/'+f)));
   const tex=Object.fromEntries(files.map((f,i)=>[f,base[i]]));
   const world=new Container();
   app.stage.addChild(world);
   const ground=new Sprite(tex['battlefield.svg']);ground.width=W;ground.height=H;world.addChild(ground);
   for(const [x,y,s]of treePositions){
     const sp=new Sprite(tex['oak.svg']);sp.anchor.set(.5);sp.width=150*s;sp.height=160*s;sp.position.set(x,y);
     world.addChild(sp);
   }
   for(const b of buildings){
     const sp=new Sprite(tex[b.kind]);sp.anchor.set(.5);sp.width=b.size;sp.height=b.size;sp.position.set(b.x,b.y);
     world.addChild(sp);
   }
   state.pixi=app;state.world=world;state.pixiTextures=tex;
   unitGraphics.Sprite=Sprite;unitGraphics.Graphics=Graphics;
   syncSoldiersPixi(Sprite,Graphics);
   host.appendChild(app.canvas);
   app.canvas.className='pixi-layer';
   detailed.style.display='none';
   state.engine='PixiJS 8 · WebGL GPU';
   ui.status.textContent='PixiJS actief — GPU-sprites geladen.';
   renderScale();
 }catch(e){
   state.engine='Canvas 2D · fallback';
   ui.status.textContent='GPU-module niet geladen; dezelfde sprites werken via Canvas 2D.';
   console.warn('Graphics Lab PixiJS fallback:',e);
 }
 updateStatus();
}
function updateStatus(){
 ui.engine.textContent=state.engine;
 ui.sprites.textContent=(soldiers.length+treePositions.length+buildings.length+1)+'';
 ui.mode.textContent=state.mode==='new'?'Nieuw: getextureerde sprites':'Voorheen: schematische vormen';
 document.getElementById('toggle').textContent=state.mode==='new'?'Toon oude tekenstijl':'Toon nieuwe sprites';
 detailed.style.visibility=state.mode==='new'?'visible':'hidden';
 oldCanvas.style.visibility=state.mode==='old'?'visible':'hidden';
 if(state.pixi)state.pixi.canvas.style.visibility=state.mode==='new'?'visible':'hidden';
}
function drawFrame(now){
 if(!state.paused)state.time+=(Math.min(now-state.last,60))/1000;
 state.last=now;
 state.frames++;
 if(now-state.frameClock>=750){
   state.fps=Math.round(state.frames*1000/Math.max(1,now-state.frameClock));
   ui.fps.textContent=state.fps+' FPS';
   state.frames=0;state.frameClock=now;
 }
 if(state.mode==='old'){painter(oldCtx,now,true);}
 else if(!state.pixi&&Object.keys(imgs).length===files.length)painter(detailCtx,now,false);
 if(state.pixi){
   for(let i=0;i<state.soldiers.length;i++){
     const u=soldiers[i],p=state.soldiers[i];
     if(p&&u)p.y=u.y+(state.paused?0:Math.sin(now*.003+u.phase)*1.5);
   }
 }
 requestAnimationFrame(drawFrame);
}
const pointers=new Map();
let pinch=null,wasGesture=false;
const gesture=document.getElementById('gesture');
gesture.addEventListener('pointerdown',e=>{
 e.preventDefault();gesture.setPointerCapture(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false});
 if(pointers.size===2){
   const [a,b]=[...pointers.values()];
   const rect=viewport.getBoundingClientRect();
   const center={x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top};
   pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.zoom,anchor:screenWorld(center.x,center.y)};
   wasGesture=true;
 }
});
gesture.addEventListener('pointermove',e=>{
 const p=pointers.get(e.pointerId);if(!p)return;
 const dx=e.clientX-p.x,dy=e.clientY-p.y;
 p.x=e.clientX;p.y=e.clientY;
 if(Math.hypot(p.x-p.sx,p.y-p.sy)>8)p.moved=true;
 if(pointers.size===2&&pinch){
   const [a,b]=[...pointers.values()];
   state.zoom=Math.min(2.4,Math.max(.27,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(10,pinch.distance)));
   const rect=viewport.getBoundingClientRect(),x=(a.x+b.x)/2-rect.left,y=(a.y+b.y)/2-rect.top;
   state.camX=pinch.anchor.x-(x-rect.width/2)/state.zoom;
   state.camY=pinch.anchor.y-(y-rect.height/2)/state.zoom;
   state.customZoom=true;repositionPixi();
 }else if(pointers.size===1&&!pinch){
   state.camX-=dx/state.zoom;state.camY-=dy/state.zoom;repositionPixi();
 }
});
function endPointer(e){
 const p=pointers.get(e.pointerId);if(!p)return;
 pointers.delete(e.pointerId);
 if(!pointers.size){
   if(!p.moved&&!wasGesture){
     const rect=viewport.getBoundingClientRect();
     const w=screenWorld(e.clientX-rect.left,e.clientY-rect.top);
     state.selected=w.x<715?'france':'britain';
     updateSelection();
   }
   pinch=null;wasGesture=false;
 }else if(pointers.size<2){pinch=null;wasGesture=true;}
}
const unitGraphics={Graphics:null,Sprite:null};
function updateSelection(){
 if(state.pixi&&unitGraphics.Graphics&&unitGraphics.Sprite){
   syncSoldiersPixi(unitGraphics.Sprite,unitGraphics.Graphics);
 }
 document.getElementById('selection').textContent=state.selected?
   (state.selected==='france'?'🇫🇷 Frans regiment geselecteerd':'🇬🇧 Brits regiment geselecteerd'):
   'Tik een regiment om het te selecteren';
}
gesture.addEventListener('pointerup',endPointer);
gesture.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinch=null;wasGesture=true;if(!pointers.size)wasGesture=false;});
gesture.addEventListener('wheel',e=>{
 e.preventDefault();
 const rect=viewport.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 const a=screenWorld(x,y);
 state.zoom=Math.min(2.4,Math.max(.27,state.zoom*Math.exp(-e.deltaY*.001)));
 state.camX=a.x-(x-rect.width/2)/state.zoom;
 state.camY=a.y-(y-rect.height/2)/state.zoom;
 state.customZoom=true;repositionPixi();
},{passive:false});
document.getElementById('toggle').addEventListener('click',()=>{
 state.mode=state.mode==='new'?'old':'new';updateStatus();
});
document.getElementById('center').addEventListener('click',()=>{
 state.camX=745;state.camY=452;state.customZoom=false;renderScale();
});
document.getElementById('pause').addEventListener('click',e=>{
 state.paused=!state.paused;e.currentTarget.textContent=state.paused?'▶ Animatie starten':'⏸ Animatie pauzeren';
});
ui.count.addEventListener('change',()=>{
 state.count=Number(ui.count.value);buildUnits(state.count);
 if(state.pixi&&unitGraphics.Graphics&&unitGraphics.Sprite)syncSoldiersPixi(unitGraphics.Sprite,unitGraphics.Graphics);
 updateStatus();
});
ui.quality.addEventListener('change',()=>{state.quality=ui.quality.value;renderScale()});
addEventListener('resize',renderScale);
window.__GRAPHICS_LAB_V319__={
 version:'319.0',state,assets:files.slice(),getStats:()=>({
   engine:state.engine,fps:state.fps,sprites:soldiers.length+treePositions.length+buildings.length+1,
   zoom:state.zoom,mode:state.mode,quality:state.quality,loaded:Object.keys(imgs).length
 })};
async function preload(){
 await Promise.all(files.map(name=>new Promise((resolve,reject)=>{
   const im=new Image();im.onload=()=>{imgs[name]=im;resolve();};im.onerror=reject;
   im.src='./assets/'+name;
 })));
 state.engine='Canvas 2D · getextureerd';ui.status.textContent='Sprites geladen · PixiJS wordt getest.';
 renderScale();updateStatus();
 requestAnimationFrame(drawFrame);
 // The GPU path is optional; ?pixi=off verifies offline Canvas sprite fallback.
 if(new URLSearchParams(location.search).get('pixi')!=='off')await startPixi();
 else{state.engine='Canvas 2D · offline sprites';ui.status.textContent='Offline demo: sprites direct op Canvas 2D.';updateStatus();}
}
preload().catch(err=>{
 ui.status.textContent='Laden van afbeeldingen mislukt.';
 ui.engine.textContent='Assetfout';
 console.error(err);
});
