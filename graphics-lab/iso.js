// Graphics Lab v324 — isometric scene: Blender-rendered soldiers (march, aim, fire, reload),
// buildings, trees and terrain.
// Isolated demo: no game simulation, no shared globals with the playable RTS.
(function(){
'use strict';
const view=document.getElementById('iso-view'),canvas=document.getElementById('iso-canvas'),ctx=canvas.getContext('2d');
const ui={status:document.getElementById('iso-status'),halt:document.getElementById('iso-halt'),
 pause:document.getElementById('iso-pause'),center:document.getElementById('iso-center'),count:document.getElementById('iso-count'),
 fire:document.getElementById('iso-fire')};
// Sprite contract from scripts/render-iso-infantry.py: 41.3 px per metre, cell
// size and feet pivot come from the atlas meta; camera elevation 30° squashes
// the ground by sin(30°)=0.5.
const SPRITE_PX_PER_M=128/3.1,SQUASH=0.5,S=20;
const DIRS=['e','se','s','sw','w','nw','n','ne'];
const MARCH={frames:6,strideM:1.5},IDLE={frames:2,frameMs:500},SPEED=1.3;
const ROAD_R=14,GROUND=48,TILE=2;
const state={zoom:1,customZoom:false,camX:0,camY:0,time:0,last:performance.now(),paused:false,halted:false,
 travelled:0,perSide:32,atlases:{},ground:null,terrain:null,props:[],firing:false,controller:null,smoke:[],volleys:0,fps:0,frames:0,frameClock:performance.now(),drawn:0,directionsSeen:new Set()};

// Ground coordinates (metres) -> unzoomed screen pixels.
const project=(gx,gy)=>({x:gx*S,y:-gy*SQUASH*S});
const hash=(a,b)=>{let h=Math.imul(a*374761393+b*668265263,1274126177)>>>0;h^=h>>>13;return (Math.imul(h,1103515245)>>>0)/4294967296;};

// Octagon road whose edges follow the 8 sprite directions.
const octagon=[];
for(let k=0;k<8;k++){const a=(22.5+45*k)*Math.PI/180;octagon.push({x:Math.cos(a)*ROAD_R,y:Math.sin(a)*ROAD_R});}
const edges=octagon.map((p,i)=>{const q=octagon[(i+1)%8];return{p,q,len:Math.hypot(q.x-p.x,q.y-p.y)};});
const perimeter=edges.reduce((s,e)=>s+e.len,0);
function along(s){
 s=((s%perimeter)+perimeter)%perimeter;
 for(const e of edges){
   if(s<=e.len){const t=s/e.len;return{x:e.p.x+(e.q.x-e.p.x)*t,y:e.p.y+(e.q.y-e.p.y)*t,dx:(e.q.x-e.p.x)/e.len,dy:(e.q.y-e.p.y)/e.len};}
   s-=e.len;
 }
 return along(0);
}
// Sprite direction d faces ground angle -45°·d (clockwise on screen from east).
const dirIndex=(dx,dy)=>((Math.round(-Math.atan2(dy,dx)/(Math.PI/4))%8)+8)%8;

function paintGround(){
 const w=Math.ceil(GROUND*2*S),h=Math.ceil(GROUND*2*S*SQUASH),c=document.createElement('canvas');
 c.width=w;c.height=h;
 const g=c.getContext('2d');
 g.translate(w/2,h/2);
 // Diamond tiles (grid rotated 45° in ground space) with gentle colour noise.
 const n=Math.ceil(GROUND*1.5/TILE),r=Math.SQRT1_2;
 for(let i=-n;i<n;i++)for(let j=-n;j<n;j++){
   const corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([a,b])=>project((a-b)*TILE*r,(a+b)*TILE*r));
   const v=hash(i+500,j+500),l=0.96+v*0.06,warm=hash(j+77,i+11);
   g.fillStyle=`rgb(${Math.round(98*l+warm*6)},${Math.round(116*l)},${Math.round(70*l)})`;
   g.beginPath();corners.forEach((p,k)=>k?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();
 }
 // Soft meadow patches break up the tile grid.
 for(let k=0;k<160;k++){
   const p=project((hash(k,1)-.5)*GROUND*2,(hash(k,2)-.5)*GROUND*2),rad=(2+hash(k,3)*5)*S;
   const light=hash(k,4)>.5,grad=g.createRadialGradient(p.x,p.y,0,p.x,p.y,rad);
   grad.addColorStop(0,light?'rgba(170,176,104,.22)':'rgba(52,72,40,.2)');grad.addColorStop(1,'rgba(0,0,0,0)');
   g.save();g.scale(1,SQUASH);g.fillStyle=grad;g.beginPath();g.arc(p.x,p.y/SQUASH,rad,0,7);g.fill();g.restore();
 }
 // Dirt road drawn in unsquashed ground space so its width foreshortens with depth.
 const road=(width,style)=>{g.strokeStyle=style;g.lineWidth=width*S;g.lineJoin='round';g.beginPath();
   octagon.forEach((p,i)=>i?g.lineTo(p.x*S,-p.y*S):g.moveTo(p.x*S,-p.y*S));g.closePath();g.stroke();};
 g.save();g.scale(1,SQUASH);
 road(5.2,'rgba(92,78,52,.5)');road(4.4,'#a48a5e');road(3.0,'#b39a6b');
 g.setLineDash([S*.7,S*.4]);road(.12,'rgba(108,86,56,.6)');g.restore();
 // Flower and stone specks for scale.
 for(let k=0;k<2400;k++){
   const p=project((hash(k,9)-.5)*GROUND*2,(hash(k,10)-.5)*GROUND*2),t=hash(k,11);
   g.fillStyle=t<.45?'rgba(226,214,140,.7)':t<.7?'rgba(232,232,220,.6)':'rgba(60,78,44,.55)';
   g.fillRect(p.x,p.y,2,1.4);
 }
 state.ground={canvas:c,w,h};
}

const loadImage=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('ontbreekt: '+src));im.src=src;});
const loadJson=url=>fetch(url,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('ontbreekt: '+url);return r.json();});
// Blender terrain + props share the sprite camera; the procedural ground stays as fallback.
async function loadScene(){
 const [layout,manifest]=await Promise.all([loadJson('./assets/iso/layout.json'),loadJson('./assets/iso/props/props.json')]);
 const image=await loadImage('./assets/iso/'+layout.ground.image);
 const sprites={};
 await Promise.all(Object.entries(manifest.props).map(async([kind,meta])=>{sprites[kind]={...meta,image:await loadImage('./assets/iso/props/'+meta.image)};}));
 state.terrain={image,scale:S/layout.ground.pxPerM};
 state.props=layout.props.filter(p=>sprites[p.type]).map(p=>({...p,sprite:sprites[p.type],...project(p.x,p.y)}));
}

function loadAtlas(prefix){
 const base='./assets/sprites/iso/'+prefix+'_iso_infantry_atlas';
 return Promise.all([
   fetch(base+'.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('ontbrekende atlas '+prefix);return r.json();}),
   new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('ontbrekende PNG '+prefix));im.src=base+'.png';})
 ]).then(([sheet,image])=>{
   if(sheet.meta.size.w!==image.naturalWidth||sheet.meta.size.h!==image.naturalHeight)throw new Error(prefix+': PNG-maat wijkt af');
   for(const d of DIRS)for(const s of ['idle','march','aim','fire','reload'])if(!sheet.animations[s+'_'+d])throw new Error(prefix+': animatie ontbreekt '+s+'_'+d);
   if(!sheet.meta.muzzle||!sheet.meta.cell||!sheet.meta.pivot)throw new Error(prefix+': atlas-meta onvolledig');
   return{sheet,image};
 });
}

function resize(){
 const r=view.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));
 if(!state.customZoom)state.zoom=Math.max(.85,Math.min(1.6,r.width/(ROAD_R*2.6*S),r.height/(ROAD_R*1.7*S)));
}

function units(){
 const out=[],files=4,gap=1.6,spacing=1.15;
 [['france','fr',0],['britain','br',perimeter/2]].forEach(([side,prefix,offset])=>{
   for(let i=0;i<state.perSide;i++){
     const rank=Math.floor(i/files),file=i%files-(files-1)/2;
     const p=along(state.travelled+offset-rank*gap);
     const nx=-p.dy,ny=p.dx;
     out.push({side,prefix,id:i,gx:p.x+nx*file*spacing,gy:p.y+ny*file*spacing,dir:dirIndex(p.dx,p.dy)});
   }
 });
 // A firing line turns to face the enemy regiment's centre.
 if(state.firing){
   const centre=side=>{const l=out.filter(u=>u.side===side);return{x:l.reduce((a,u)=>a+u.gx,0)/l.length,y:l.reduce((a,u)=>a+u.gy,0)/l.length};};
   const c={france:centre('britain'),britain:centre('france')};
   for(const u of out){const t=c[u.side];u.dir=dirIndex(t.x-u.gx,t.y-u.gy);}
 }
 return out;
}

// One deterministic controller (v321) drives idle/aim/fire/reload on the lab
// clock; marching keeps the distance-driven cadence so nobody walks in place.
function frameFor(u){
 const d=DIRS[u.dir];
 const c=state.controller;
 if(c){
   const r=c.update(u.prefix+':'+u.id,state.time*1000,{moving:!state.halted,fireOrder:state.firing});
   for(const e of r.events)if(e.type==='muzzle')spawnSmoke(u);
   if(r.state!=='march')return r.state+'_'+d+'|'+r.frame;
 }else if(state.halted){
   return 'idle_'+d+'|'+Math.floor((state.time*1000+u.id*137)/IDLE.frameMs)%IDLE.frames;
 }
 const f=Math.floor((state.travelled%MARCH.strideM)/MARCH.strideM*MARCH.frames)%MARCH.frames;
 return 'march_'+d+'|'+f;
}

// Powder smoke puffs born at the rendered muzzle pixel, drifting downwind.
function spawnSmoke(u){
 const atlas=state.atlases[u.prefix];if(!atlas)return;
 const m=atlas.sheet.meta,px=m.muzzle.px[DIRS[u.dir]],k=S/SPRITE_PX_PER_M;
 const x=u.x+(px.x-m.pivot.x)*k,y=u.y+(px.y-m.pivot.y)*k;
 if(u.id===0)state.volleys++;
 if(state.smoke.length>600)state.smoke.splice(0,state.smoke.length-600);
 const seed=hash(u.id+state.volleys*97,u.prefix==='fr'?1:2);
 state.smoke.push({x,y,born:state.time,life:4.5+seed*2,size:.55+seed*.5,seed});
}

function drawSmoke(){
 const t=state.time;
 state.smoke=state.smoke.filter(p=>t-p.born<p.life);
 for(const p of state.smoke){
   const age=t-p.born,f=age/p.life,r=(6+age*13)*p.size;
   const x=p.x+age*9+Math.sin(age*.9+p.seed*6)*3,y=p.y-age*7-10*f;
   const g=ctx.createRadialGradient(x,y,0,x,y,r);
   const a=(1-f)*(age<.12?age/.12:1);
   g.addColorStop(0,`rgba(236,232,222,${(.55*a).toFixed(3)})`);
   g.addColorStop(.55,`rgba(214,212,204,${(.32*a).toFixed(3)})`);
   g.addColorStop(1,'rgba(200,200,196,0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,r,r*.82,0,0,Math.PI*2);ctx.fill();
 }
}

function drawSprite(atlas,anim,f,x,y,k){
 const name=atlas.sheet.animations[anim][f],fr=atlas.sheet.frames[name].frame,p=atlas.sheet.meta.pivot;
 ctx.drawImage(atlas.image,fr.x,fr.y,fr.w,fr.h,x-p.x*k,y-p.y*k,fr.w*k,fr.h*k);
}

function draw(now){
 const dt=Math.min(now-state.last,60)/1000;state.last=now;
 if(!state.paused){state.time+=dt;if(!state.halted)state.travelled+=SPEED*dt;}
 state.frames++;
 if(now-state.frameClock>=750){state.fps=Math.round(state.frames*1000/(now-state.frameClock));state.frames=0;state.frameClock=now;}
 const dpr=canvas.width/Math.max(1,view.clientWidth),z=state.zoom;
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#5d6b45';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.setTransform(dpr*z,0,0,dpr*z,dpr*(view.clientWidth/2-state.camX*z),dpr*(view.clientHeight/2-state.camY*z));
 if(state.terrain){const t=state.terrain,w=t.image.naturalWidth*t.scale,h=t.image.naturalHeight*t.scale;ctx.drawImage(t.image,-w/2,-h/2,w,h);}
 else if(state.ground)ctx.drawImage(state.ground.canvas,-state.ground.w/2,-state.ground.h/2);
 const k=S/SPRITE_PX_PER_M;
 // Soldiers and props share one painter's order by their ground point.
 const list=units().map(u=>({...u,...project(u.gx,u.gy)})).concat(state.props).sort((a,b)=>a.y-b.y);
 state.animStates={};
 state.drawn=0;state.propsDrawn=0;
 for(const u of list){
   if(u.sprite){const p=u.sprite;ctx.drawImage(p.image,u.x-p.pivot.x*k,u.y-p.pivot.y*k,p.w*k,p.h*k);state.propsDrawn++;continue;}
   const atlas=state.atlases[u.prefix];if(!atlas)continue;
   const [anim,f]=frameFor(u).split('|');
   drawSprite(atlas,anim,Number(f),u.x,u.y,k);
   const st=anim.split('_')[0];state.animStates[st]=(state.animStates[st]||0)+1;
   state.directionsSeen.add(u.dir);state.drawn++;
 }
 drawSmoke();
 drawCompass(dpr);
 requestAnimationFrame(draw);
}

// Screen-space strip: the French soldier in all 8 directions, for review.
function drawCompass(dpr){
 const a=state.atlases.fr;if(!a)return;
 const w=view.clientWidth,size=Math.min(64,(w-24)/8),cell=a.sheet.meta.cell.h;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='rgba(20,24,22,.62)';ctx.fillRect(8,8,size*8+8,size*.95+8);
 // Cycles the full drill so every state can be reviewed in all directions.
 const drill=[['march',6,110],['aim',2,260],['fire',3,140],['reload',4,425]];
 const total=drill.reduce((s,[,n,ms])=>s+n*ms,0);let t=(state.time*1000)%total,anim='march',f=0;
 for(const [name,n,ms] of drill){if(t<n*ms){anim=name;f=Math.floor(t/ms);break;}t-=n*ms;}
 DIRS.forEach((d,i)=>drawSprite(a,anim+'_'+d,f,12+size*(i+.5),12+size*.85,size/cell));
}

// Pan with one pointer, pinch or wheel to zoom around the gesture centre.
const pointers=new Map();let pinch=null;
const toWorld=(x,y)=>({x:(x-view.clientWidth/2)/state.zoom+state.camX,y:(y-view.clientHeight/2)/state.zoom+state.camY});
view.addEventListener('pointerdown',e=>{view.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2){const[a,b]=[...pointers.values()],r=view.getBoundingClientRect();
   pinch={dist:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.zoom,anchor:toWorld((a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top)};}});
view.addEventListener('pointermove',e=>{const p=pointers.get(e.pointerId);if(!p)return;
 const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
 if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],r=view.getBoundingClientRect();
   state.zoom=Math.min(3,Math.max(.35,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(10,pinch.dist)));
   const cx=(a.x+b.x)/2-r.left,cy=(a.y+b.y)/2-r.top;
   state.camX=pinch.anchor.x-(cx-r.width/2)/state.zoom;state.camY=pinch.anchor.y-(cy-r.height/2)/state.zoom;state.customZoom=true;}
 else if(pointers.size===1&&!pinch){state.camX-=dx/state.zoom;state.camY-=dy/state.zoom;}});
const up=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;};
view.addEventListener('pointerup',up);view.addEventListener('pointercancel',up);
view.addEventListener('wheel',e=>{e.preventDefault();const r=view.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,a=toWorld(x,y);
 state.zoom=Math.min(3,Math.max(.35,state.zoom*Math.exp(-e.deltaY*.001)));
 state.camX=a.x-(x-r.width/2)/state.zoom;state.camY=a.y-(y-r.height/2)/state.zoom;state.customZoom=true;},{passive:false});
function setHalt(h){state.halted=h;if(!h)setFire(false);ui.halt.textContent=h?'▶ Voorwaarts mars':'✋ Halt';}
function setFire(f){state.firing=f;if(f&&!state.halted)setHalt(true);ui.fire.textContent=f?'✋ Staakt het vuren':'🔥 Vuur!';}
ui.halt.addEventListener('click',()=>setHalt(!state.halted));
ui.fire.addEventListener('click',()=>setFire(!state.firing));
ui.pause.addEventListener('click',()=>{state.paused=!state.paused;ui.pause.textContent=state.paused?'▶ Hervatten':'⏸ Pauzeren';});
ui.center.addEventListener('click',()=>{state.camX=state.camY=0;state.customZoom=false;resize();});
ui.count.addEventListener('change',()=>{state.perSide=Number(ui.count.value);});
addEventListener('resize',resize);

window.__GRAPHICS_LAB_ISO__={version:'324.0',state,
 getStats:()=>({loaded:Object.keys(state.atlases).length,units:state.perSide*2,drawn:state.drawn,fps:state.fps,
   terrain:!!state.terrain,props:state.props.length,propsDrawn:state.propsDrawn||0,
   zoom:state.zoom,halted:state.halted,firing:state.firing,directionsSeen:state.directionsSeen.size,perimeter,
   animStates:{...(state.animStates||{})},smoke:state.smoke.length,volleys:state.volleys,
   muzzleEvents:state.controller?state.controller.metrics().muzzleEvents:0})};

paintGround();resize();
const loadController=()=>loadJson('./assets/sprites/unit-animation-config.json').then(cfg=>{
 state.controller=NRTSInfantryAnimation.createInfantryAnimationController(cfg);});
Promise.all([loadAtlas('fr'),loadAtlas('br'),loadController(),loadScene().catch(err=>{console.warn('Iso terrein/gebouwen fallback:',err);})]).then(([fr,br])=>{
 state.atlases={fr,br};
 ui.status.textContent=state.terrain?'Blender-scène geladen · soldaten, gebouwen en terrein':'Blender-soldaten geladen · eenvoudig terrein';
}).catch(err=>{
 ui.status.textContent='Atlassen konden niet laden.';console.error(err);
});
requestAnimationFrame(draw);
})();
