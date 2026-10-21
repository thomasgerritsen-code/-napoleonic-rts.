// Graphics Lab v329 — isometric scene: Blender-rendered soldiers in three looks (march, aim, fire,
// reload, three falls) led by an officer, drummer and ensign, deploying from column into line,
// buildings, trees and terrain.
// Isolated demo: no game simulation, no shared globals with the playable RTS.
(function(){
'use strict';
const view=document.getElementById('iso-view'),canvas=document.getElementById('iso-canvas'),ctx=canvas.getContext('2d');
const ui={status:document.getElementById('iso-status'),halt:document.getElementById('iso-halt'),
 pause:document.getElementById('iso-pause'),center:document.getElementById('iso-center'),count:document.getElementById('iso-count'),
 fire:document.getElementById('iso-fire'),reset:document.getElementById('iso-reset')};
// Sprite contract from scripts/render-iso-infantry.py: 41.3 px per metre, cell
// size and feet pivot come from the atlas meta; camera elevation 30° squashes
// the ground by sin(30°)=0.5.
const SPRITE_PX_PER_M=128/3.1,SQUASH=0.5,S=20;
const DIRS=['e','se','s','sw','w','nw','n','ne'];
const MARCH={frames:6,strideM:1.5},IDLE={frames:2,frameMs:500},SPEED=1.3;
// Rolling fire: the ranks of a line open fire this far apart. Each shot has a
// small chance to drop an enemy soldier, who then plays the fall.
const BAND_DELAY=0.8,HIT_CHANCE=0.05,HIT_DELAY=0.25,DIE_FRAME=0.17;
const ROAD_R=14,GROUND=48,TILE=2;
const state={zoom:1,customZoom:false,camX:0,camY:0,time:0,last:performance.now(),paused:false,halted:false,
 travelled:0,perSide:32,atlases:{},ground:null,terrain:null,props:[],firing:false,controller:null,smoke:[],volleys:0,
 fireStart:0,regiments:null,simTime:0,dead:new Map(),hits:[],shots:0,hitChance:HIT_CHANCE,fps:0,frames:0,frameClock:performance.now(),drawn:0,directionsSeen:new Set()};

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

// Each nation has an infantry atlas (drill) and a fallen atlas (three falls).
const FALLS=['die','diefwd','dieside'];
function loadSheet(prefix,kind,states){
 const base='./assets/sprites/iso/'+prefix+'_iso_'+kind+'_atlas';
 return Promise.all([
   fetch(base+'.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('ontbrekende atlas '+prefix+' '+kind);return r.json();}),
   loadImage(base+'.png')
 ]).then(([sheet,image])=>{
   if(sheet.meta.size.w!==image.naturalWidth||sheet.meta.size.h!==image.naturalHeight)throw new Error(prefix+': PNG-maat wijkt af');
   for(const d of DIRS)for(const s of states)if(!sheet.animations[s+'_'+d])throw new Error(prefix+': animatie ontbreekt '+s+'_'+d);
   if(!sheet.meta.cell||!sheet.meta.pivot)throw new Error(prefix+': atlas-meta onvolledig');
   return{sheet,image};
 });
}
// Three looks per nation (atlas prefixes fr, fr2, fr3 / br, br2, br3), fixed
// per soldier so the same man keeps his face, trousers and kit.
const LOOKS=['','2','3'];
const lookOf=(prefix,id)=>prefix+LOOKS[Math.floor(hash(id+11,prefix==='fr'?3:5)*LOOKS.length)];
function loadAtlas(prefix){
 return Promise.all([loadSheet(prefix,'infantry',['idle','march','aim','fire','reload']),loadSheet(prefix,'fallen',FALLS)])
   .then(([drill,fallen])=>{
     if(!drill.sheet.meta.muzzle)throw new Error(prefix+': mondingspunten ontbreken');
     return{...drill,fallen};
   });
}

function resize(){
 const r=view.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));
 if(!state.customZoom)state.zoom=Math.max(.85,Math.min(1.6,r.width/(ROAD_R*2.6*S),r.height/(ROAD_R*1.7*S)));
}

// --- Regiments -----------------------------------------------------------------
// Every soldier owns a ground position and walks to a slot (rank r, file f) of
// his regiment's formation: a 4-file column that follows the road, or a firing
// line facing the enemy (French 3 ranks deep, British 2). When a man falls the
// man behind him in the same file steps up, so gaps move to the rear.
const COLUMN={files:4,gap:1.6,spacing:1.15},LINE={spacing:0.8,gap:0.95},WALK=2.2,ARRIVE=0.06;
const REGIMENTS=[{side:'france',prefix:'fr',lineRanks:3,start:0},{side:'britain',prefix:'br',lineRanks:2,start:0.5}];
const slotKey=(r,f)=>r+','+f;

function buildRegiments(){
 state.regiments=REGIMENTS.map(def=>{
   const reg={...def,offset:def.start*perimeter,formation:'column',reforming:false,slots:new Map(),men:[],line:null,readyAt:null};
   for(let i=0;i<state.perSide;i++){
     const m={side:def.side,prefix:def.prefix,look:lookOf(def.prefix,i),id:i,key:def.prefix+':'+i,
       gx:0,gy:0,walk:0,dir:0,moving:false,placed:false,slot:{r:Math.floor(i/COLUMN.files),f:i%COLUMN.files}};
     reg.men.push(m);reg.slots.set(slotKey(m.slot.r,m.slot.f),m);
   }
   reg.staff=['officer','ensign','drummer'].map(role=>({side:def.side,prefix:def.prefix,role,look:def.prefix+ROLE_KEYS[role],
     key:def.prefix+':'+role,gx:0,gy:0,walk:0,dir:0,moving:false,placed:false}));
   return reg;
 });
 state.simTime=state.time;
}

const aliveMen=reg=>reg.men.filter(m=>!m.dead);
function centreOf(reg){
 const l=aliveMen(reg);
 return{x:l.reduce((a,m)=>a+m.gx,0)/Math.max(1,l.length),y:l.reduce((a,m)=>a+m.gy,0)/Math.max(1,l.length)};
}

function columnTarget(reg,back,lateral){
 const p=along(state.travelled+reg.offset-back);
 return{x:p.x-p.dy*lateral,y:p.y+p.dx*lateral,dir:dirIndex(p.dx,p.dy)};
}
function lineTarget(reg,r,f){
 const L=reg.line,u=(f-(L.files-1)/2)*LINE.spacing,v=-r*LINE.gap;
 return{x:L.cx+L.tx*u+L.nx*v,y:L.cy+L.ty*u+L.ny*v,dir:dirIndex(L.nx,L.ny)};
}
function slotTarget(reg,m){
 return reg.formation==='line'?lineTarget(reg,m.slot.r,m.slot.f)
   :columnTarget(reg,m.slot.r*COLUMN.gap,(m.slot.f-(COLUMN.files-1)/2)*COLUMN.spacing);
}
function staffTarget(reg,role){
 if(reg.formation==='line'){
   const L=reg.line,half=(L.files/2)*LINE.spacing;
   const at=(u,v)=>({x:L.cx+L.tx*u+L.nx*v,y:L.cy+L.ty*u+L.ny*v,dir:dirIndex(L.nx,L.ny)});
   // Officer on the right flank, colour just behind the front rank, drummer at the rear.
   return role==='officer'?at(half+1.1,0.4):role==='ensign'?at(0,-LINE.gap*0.5):at(-1.0,-(L.ranks*LINE.gap+0.7));
 }
 const ranks=Math.ceil(aliveMen(reg).length/COLUMN.files);
 return role==='officer'?columnTarget(reg,-2.2,0):role==='ensign'?columnTarget(reg,(ranks/2-0.5)*COLUMN.gap,0)
   :columnTarget(reg,ranks*COLUMN.gap+0.4,1.2);
}

// Deploy into line around the regiment's centre, facing the enemy. Files are
// taken left to right by each man's position across the front and ranks by his
// distance to the enemy, so nobody has to cross the whole regiment.
function formLine(reg,enemy){
 const c=centreOf(reg),l=Math.hypot(enemy.x-c.x,enemy.y-c.y)||1;
 const nx=(enemy.x-c.x)/l,ny=(enemy.y-c.y)/l,tx=-ny,ty=nx;
 const men=aliveMen(reg),ranks=reg.lineRanks,files=Math.ceil(men.length/ranks);
 men.sort((a,b)=>(a.gx*tx+a.gy*ty)-(b.gx*tx+b.gy*ty));
 reg.slots=new Map();
 for(let f=0;f<files;f++){
   men.slice(f*ranks,f*ranks+ranks).sort((a,b)=>(b.gx*nx+b.gy*ny)-(a.gx*nx+a.gy*ny))
     .forEach((m,r)=>{m.slot={r,f};reg.slots.set(slotKey(r,f),m);});
 }
 reg.line={cx:c.x,cy:c.y,nx,ny,tx,ty,files,ranks};
 reg.formation='line';reg.readyAt=null;
}
function formColumn(reg){
 reg.slots=new Map();
 aliveMen(reg).sort((a,b)=>a.id-b.id).forEach((m,i)=>{
   m.slot={r:Math.floor(i/COLUMN.files),f:i%COLUMN.files};reg.slots.set(slotKey(m.slot.r,m.slot.f),m);
 });
 reg.formation='column';reg.reforming=true;reg.readyAt=null;
}
// The man behind steps into the fallen man's place, file by file.
function closeUp(reg,slot){
 let r=slot.r;const f=slot.f;
 reg.slots.delete(slotKey(r,f));
 while(reg.slots.has(slotKey(r+1,f))){
   const m=reg.slots.get(slotKey(r+1,f));
   reg.slots.delete(slotKey(r+1,f));m.slot={r,f};reg.slots.set(slotKey(r,f),m);r++;
 }
}

function walkTo(m,t,dt,snap){
 const dx=t.x-m.gx,dy=t.y-m.gy,dist=Math.hypot(dx,dy);
 if(!m.placed||snap||dist<=ARRIVE){
   if(m.placed)m.walk+=dist;
   m.moving=m.placed&&snap&&dist>1e-3;
   m.gx=t.x;m.gy=t.y;m.placed=true;
   m.dir=t.dir;return;
 }
 const step=Math.min(dist,WALK*dt);
 m.gx+=dx/dist*step;m.gy+=dy/dist*step;m.walk+=step;
 m.moving=true;m.dir=dirIndex(dx,dy);
}

function updateRegiments(){
 if(!state.regiments)buildRegiments();
 const dt=Math.max(0,Math.min(0.25,state.time-state.simTime));state.simTime=state.time;
 const [fr,br]=state.regiments,centres=[centreOf(fr),centreOf(br)];
 state.regiments.forEach((reg,i)=>{
   if(state.firing&&reg.formation!=='line')formLine(reg,centres[1-i]);
   else if(!state.halted&&reg.formation!=='column')formColumn(reg);
   // A column on the march follows the road exactly; reforming men walk.
   const snap=reg.formation==='column'&&!reg.reforming;
   let spread=0,walking=0;
   for(const m of aliveMen(reg)){
     const t=slotTarget(reg,m);walkTo(m,t,dt,snap);
     spread=Math.max(spread,Math.hypot(t.x-m.gx,t.y-m.gy));if(m.moving&&!snap)walking++;
   }
   for(const st of reg.staff)walkTo(st,staffTarget(reg,st.role),dt,snap);
   if(reg.reforming&&spread<0.3)reg.reforming=false;
   if(reg.formation==='line'&&reg.readyAt===null&&walking===0)reg.readyAt=state.time;
 });
}

function units(){
 updateRegiments();
 return state.regiments.flatMap(reg=>[...aliveMen(reg),...reg.staff]);
}

// One deterministic controller (v321) drives idle/aim/fire/reload on the lab
// clock; marching keeps the distance-driven cadence so nobody walks in place.
function frameFor(u){
 const d=DIRS[u.dir];
 if(u.role){
   // Command pose while the regiment fires: sword raised, charge beaten, colour raised.
   if(u.moving)return 'march_'+d+'|'+Math.floor((u.walk%MARCH.strideM)/MARCH.strideM*MARCH.frames)%MARCH.frames;
   if(state.firing)return 'command_'+d+'|'+(Math.floor(state.time/0.45)%2);
   return 'idle_'+d+'|'+(Math.floor(state.time/0.6)%2);
 }
 const c=state.controller;
 if(c){
   // Ranks open fire one after another once the whole line stands.
   const reg=regimentOf(u);
   const ordered=state.firing&&reg.formation==='line'&&reg.readyAt!==null&&state.time>=reg.readyAt+u.slot.r*BAND_DELAY;
   const r=c.update(u.key,state.time*1000,{moving:u.moving,fireOrder:ordered&&!u.moving});
   for(const e of r.events)if(e.type==='muzzle'){spawnSmoke(u);shoot(u);}
   if(!u.moving&&r.state!=='march')return r.state+'_'+d+'|'+r.frame;
 }else if(!u.moving){
   return 'idle_'+d+'|'+Math.floor((state.time*1000+u.id*137)/IDLE.frameMs)%IDLE.frames;
 }
 // Distance-driven cadence: each man steps with his own walk, never in place.
 return 'march_'+d+'|'+Math.floor((u.walk%MARCH.strideM)/MARCH.strideM*MARCH.frames)%MARCH.frames;
}

// Powder smoke puffs born at the rendered muzzle pixel, drifting downwind.
function spawnSmoke(u){
 const atlas=state.atlases[u.look];if(!atlas)return;
 const m=atlas.sheet.meta,px=m.muzzle.px[DIRS[u.dir]],k=S/SPRITE_PX_PER_M;
 const x=u.x+(px.x-m.pivot.x)*k,y=u.y+(px.y-m.pivot.y)*k;
 if(u.id===0)state.volleys++;
 if(state.smoke.length>600)state.smoke.splice(0,state.smoke.length-600);
 const seed=hash(u.id+state.volleys*97,u.prefix==='fr'?1:2);
 state.smoke.push({x,y,born:state.time,life:4.5+seed*2,size:.55+seed*.5,seed});
}

// A musket ball may drop a random soldier of the other side a moment later.
function shoot(u){
 state.shots++;(state.shooters||(state.shooters=new Set())).add(u.key);
 if(hash(state.shots*31+u.id,u.prefix==='fr'?7:11)>=state.hitChance)return;
 const enemy=u.prefix==='fr'?'br':'fr',alive=[];
 for(let i=0;i<state.perSide;i++)if(!state.dead.has(enemy+':'+i))alive.push(i);
 if(alive.length<=2)return;
 const id=alive[Math.floor(hash(state.shots,u.id+3)*alive.length)];
 state.hits.push({key:enemy+':'+id,at:state.time+HIT_DELAY,seed:state.shots});
}

function resolveHits(list){
 state.hits=state.hits.filter(h=>{
   if(state.time<h.at)return true;
   const u=list.find(v=>v.key===h.key&&!v.role);
   // Each casualty falls one of three ways (deterministic per shot).
   const fall=FALLS[Math.floor(hash(h.seed,u?u.id+17:0)*FALLS.length)];
   if(u&&!state.dead.has(h.key)){
     state.dead.set(h.key,{prefix:u.prefix,look:u.look,side:u.side,id:u.id,gx:u.gx,gy:u.gy,dir:u.dir,t0:state.time,fall});
     u.dead=true;closeUp(regimentOf(u),u.slot);
   }
   return false;
 });
}

// Front-rank places left empty although a man stands behind them in that file.
function frontGaps(reg){
 if(reg.formation!=='line')return 0;
 let gaps=0;
 for(let f=0;f<reg.line.files;f++){
   if(reg.slots.has(slotKey(0,f)))continue;
   for(let r=1;r<reg.line.ranks;r++)if(reg.slots.has(slotKey(r,f))){gaps++;break;}
 }
 return gaps;
}
const regimentOf=u=>state.regiments[u.side==='france'?0:1];

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
 const src=atlas.sheet.animations[anim]?atlas:atlas.fallen;
 const name=src.sheet.animations[anim][f],fr=src.sheet.frames[name].frame,p=src.sheet.meta.pivot;
 ctx.drawImage(src.image,fr.x,fr.y,fr.w,fr.h,x-p.x*k,y-p.y*k,fr.w*k,fr.h*k);
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
 const alive=units();
 resolveHits(alive);
 const fallen=[...state.dead.values()].map(d=>({...d,fallen:true,...project(d.gx,d.gy)}));
 const list=alive.map(u=>({...u,...project(u.gx,u.gy)})).concat(fallen,state.props).sort((a,b)=>a.y-b.y);
 state.animStates={};
 state.drawn=0;state.propsDrawn=0;state.rolesDrawn=0;
 for(const u of list){
   if(u.sprite){const p=u.sprite;ctx.drawImage(p.image,u.x-p.pivot.x*k,u.y-p.pivot.y*k,p.w*k,p.h*k);state.propsDrawn++;continue;}
   const atlas=state.atlases[u.look]||state.atlases[u.prefix];if(!atlas)continue;
   if(u.fallen){
     // The fall plays once; the last frame stays on the field.
     const f=Math.min(3,Math.floor(Math.max(0,state.time-u.t0)/DIE_FRAME));
     drawSprite(atlas,u.fall+'_'+DIRS[u.dir],f,u.x,u.y,k);
     state.animStates.die=(state.animStates.die||0)+1;continue;
   }
   const [anim,f]=frameFor(u).split('|');
   drawSprite(atlas,anim,Number(f),u.x,u.y,k);
   if(u.role){state.rolesDrawn++;continue;}
   (state.lookSet||(state.lookSet=new Set())).add(u.look);state.looksDrawn=state.lookSet.size;
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
 const drill=[['march',6,110],['aim',2,260],['fire',3,140],['reload',4,425],['die',4,300],['diefwd',4,300],['dieside',4,300]];
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
function setFire(f){
 state.firing=f;if(f&&!state.halted)setHalt(true);
 if(f)state.fireStart=state.time;
 ui.fire.textContent=f?'✋ Staakt het vuren':'🔥 Vuur!';
}
function resetBattle(){
 state.dead.clear();state.hits=[];state.smoke=[];state.shots=0;state.volleys=0;state.regiments=null;state.shooters=null;
 if(state.controller)state.controller.reset();
}
ui.reset.addEventListener('click',()=>{setFire(false);resetBattle();});
ui.halt.addEventListener('click',()=>setHalt(!state.halted));
ui.fire.addEventListener('click',()=>setFire(!state.firing));
ui.pause.addEventListener('click',()=>{state.paused=!state.paused;ui.pause.textContent=state.paused?'▶ Hervatten':'⏸ Pauzeren';});
ui.center.addEventListener('click',()=>{state.camX=state.camY=0;state.customZoom=false;resize();});
ui.count.addEventListener('change',()=>{state.perSide=Number(ui.count.value);resetBattle();});
addEventListener('resize',resize);

window.__GRAPHICS_LAB_ISO__={version:'329.0',state,
 getStats:()=>({loaded:Object.keys(state.atlases).length,looks:state.looksDrawn||0,roles:state.rolesDrawn||0,units:state.perSide*2,drawn:state.drawn,fps:state.fps,
   terrain:!!state.terrain,props:state.props.length,propsDrawn:state.propsDrawn||0,
   zoom:state.zoom,halted:state.halted,firing:state.firing,directionsSeen:state.directionsSeen.size,perimeter,
   animStates:{...(state.animStates||{})},smoke:state.smoke.length,volleys:state.volleys,shots:state.shots,
   fallen:{fr:[...state.dead.keys()].filter(k=>k.startsWith('fr')).length,br:[...state.dead.keys()].filter(k=>k.startsWith('br')).length},
   bands:state.regiments?Math.max(...state.regiments.map(r=>r.formation==='line'?r.line.ranks:0)):0,
   formations:state.regiments?state.regiments.map(r=>r.formation):[],
   deployed:state.regiments?state.regiments.filter(r=>r.readyAt!==null).length:0,
   shooters:state.shooters?state.shooters.size:0,
   frontGaps:state.regiments?state.regiments.reduce((n,r)=>n+frontGaps(r),0):0,
   fallKinds:[...new Set([...state.dead.values()].map(d=>d.fall))].sort(),
   muzzleEvents:state.controller?state.controller.metrics().muzzleEvents:0})};

paintGround();resize();
const loadController=()=>loadJson('./assets/sprites/unit-animation-config.json').then(cfg=>{
 state.controller=NRTSInfantryAnimation.createInfantryAnimationController(cfg);});
const ATLAS_KEYS=['fr','br'].flatMap(p=>LOOKS.map(l=>p+l));
// Officer, drummer and ensign atlases: idle, march and command in taller cells.
const ROLE_KEYS={officer:'o',drummer:'d',ensign:'e'};
const ROLE_ATLASES=['fr','br'].flatMap(p=>Object.entries(ROLE_KEYS).map(([role,k])=>[p+k,role]));
const loadRole=([key,role])=>loadSheet(key,role,['idle','march','command']).then(sheet=>({...sheet,fallen:sheet}));
Promise.all([Promise.all([...ATLAS_KEYS.map(loadAtlas),...ROLE_ATLASES.map(loadRole)]),loadController(),loadScene().catch(err=>{console.warn('Iso terrein/gebouwen fallback:',err);})]).then(([atlases])=>{
 state.atlases=Object.fromEntries([...ATLAS_KEYS,...ROLE_ATLASES.map(([key])=>key)].map((key,i)=>[key,atlases[i]]));
 ui.status.textContent=state.terrain?'Blender-scène geladen · soldaten, gebouwen en terrein':'Blender-soldaten geladen · eenvoudig terrein';
}).catch(err=>{
 ui.status.textContent='Atlassen konden niet laden.';console.error(err);
});
requestAnimationFrame(draw);
})();
