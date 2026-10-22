// Graphics Lab v339 — isometric scene: Blender-rendered soldiers in five looks (incl. grenadiers
// and voltigeurs; march, aim, fire, reload, three falls) led by an officer, drummer and ensign,
// deploying from column into line, buildings, trees and terrain.
// Isolated demo: no game simulation, no shared globals with the playable RTS.
(function(){
'use strict';
const view=document.getElementById('iso-view'),canvas=document.getElementById('iso-canvas'),ctx=canvas.getContext('2d');
const ui={status:document.getElementById('iso-status'),halt:document.getElementById('iso-halt'),
 pause:document.getElementById('iso-pause'),center:document.getElementById('iso-center'),count:document.getElementById('iso-count'),
 fire:document.getElementById('iso-fire'),reset:document.getElementById('iso-reset'),charge:document.getElementById('iso-charge'),cav:document.getElementById('iso-cav'),follow:document.getElementById('iso-follow'),
 sound:document.getElementById('iso-sound')};
// Sprite contract from scripts/render-iso-infantry.py: 41.3 px per metre, cell
// size and feet pivot come from the atlas meta; camera elevation 30° squashes
// the ground by sin(30°)=0.5.
const SPRITE_PX_PER_M=128/3.1,SQUASH=0.5,S=20;
const DIRS=['e','se','s','sw','w','nw','n','ne'];
const MARCH={frames:6,strideM:1.5},IDLE={frames:2,frameMs:500},SPEED=1.3;
// Rolling fire: the ranks of a line open fire this far apart. Each shot has a
// small chance to drop an enemy soldier, who then plays the fall.
const BAND_DELAY=0.8,HIT_CHANCE=0.05,HIT_DELAY=0.25,DIE_FRAME=0.17;
const ROAD_R=14,GROUND=64,TILE=2;
const state={zoom:1,customZoom:false,camX:0,camY:0,time:0,last:performance.now(),paused:false,halted:false,
 travelled:0,perSide:32,atlases:{},ground:null,terrain:null,props:[],firing:false,controller:null,smoke:[],volleys:0,
 fireStart:0,regiments:null,simTime:0,dead:new Map(),batteries:null,squadrons:null,cavCharge:null,reaction:true,cavCounter:null,squareShots:0,clashes:0,deadRiders:[],riderFalls:0,sabreHits:0,balls:[],cannonShots:0,ballHits:0,charge:null,woundedShare:0.3,drill:new Map(),bank:[],misfires:0,misfireChance:0.06,hits:[],shots:0,hitChance:HIT_CHANCE,fps:0,frames:0,frameClock:performance.now(),drawn:0,directionsSeen:new Set()};

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
 state.terrain={image,scale:S/layout.ground.pxPerM,half:layout.ground.halfSize};
 state.props=layout.props.filter(p=>sprites[p.type]).map(p=>({...p,gx:p.x,gy:p.y,sprite:sprites[p.type],...project(p.x,p.y)}));
}

// Each nation has an infantry atlas (drill) and a fallen atlas (three falls).
const FALLS=['die','diefwd','dieside'];
function loadSheet(prefix,kind,states){
 const dir='./assets/sprites/iso/';
 return fetch(dir+prefix+'_iso_'+kind+'_atlas.json',{cache:'no-cache'})
   .then(r=>{if(!r.ok)throw new Error('ontbrekende atlas '+prefix+' '+kind);return r.json();})
   // The JSON names the image (WebP since v330). The lab draws sprites at about half
   // their atlas size, so it loads the half-resolution copy unless ?hd=1: all atlases
   // at full size decode to close to 1 GB, far too much for a phone.
   .then(sheet=>{
     const half=!HD&&sheet.meta.half,scale=half?half.scale:1;
     return loadImage(dir+(half?half.image:sheet.meta.image)).then(image=>{
     if(Math.round(sheet.meta.size.w*scale)!==image.naturalWidth||Math.round(sheet.meta.size.h*scale)!==image.naturalHeight)
       throw new Error(prefix+': atlasmaat wijkt af');
     for(const d of DIRS)for(const s of states)if(!sheet.animations[s+'_'+d])throw new Error(prefix+': animatie ontbreekt '+s+'_'+d);
     if(!sheet.meta.cell||!sheet.meta.pivot)throw new Error(prefix+': atlas-meta onvolledig');
     return{sheet,image,scale};
   });});
}
const HD=new URLSearchParams(location.search).has('hd');
// Looks per nation: 1-3 vary face, trousers and kit, 4 grenadiers, 5 voltigeurs
// (British light company). Fixed per soldier so the same man keeps his look.
const LOOKS=['','2','3'];
const COMPANY_SHARE=1/8;
const lookOf=(prefix,id)=>{
 const elite=Math.max(1,Math.round(state.perSide*COMPANY_SHARE));
 if(id<elite)return prefix+'4';
 if(id>=state.perSide-elite)return prefix+'5';
 return prefix+LOOKS[Math.floor(hash(id+11,prefix==='fr'?3:5)*LOOKS.length)];
};
// Every look has five sheets; animations are looked up across them by name.
const SHEETS={infantry:['idle','march','aim','fire','reload'],fallen:FALLS,
 combat:['kaim','kfire','misfire','charge','thrust'],morale:['rout','crawl','cheer'],idlex:['look','adjust','lean']};
function indexAtlas(parts){
 const byAnim=new Map();
 for(const part of parts)for(const anim of Object.keys(part.sheet.animations))byAnim.set(anim,part);
 return{...parts[0],byAnim};
}
function loadAtlas(prefix){
 return Promise.all(Object.entries(SHEETS).map(([kind,states])=>loadSheet(prefix,kind,states)))
   .then(parts=>{
     if(!parts[0].sheet.meta.muzzle||!parts[2].sheet.meta.muzzle)throw new Error(prefix+': mondingspunten ontbreken');
     const atlas=indexAtlas(parts);atlas.combat=parts[2];return atlas;
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
// Firing realism: per-man delay before presenting, misfires (flash in the pan,
// no shot), own reload pace, and a slow smoke bank over the firing line.
const FIRE_JITTER=0.35,RATE_SPREAD=0.3,BANK_LIFE=28,BANK_MAX=70,BANK_MERGE=36,SMOKE_MAX=240;
// Idle variety: every few seconds a man looks around, sets his shako or leans on his musket.
const IDLE_EXTRAS=[['look',4,0.45],['adjust',4,0.38],['lean',2,1.4]];
// Bayonet charge: the French line advances at the double until the front ranks
// meet, both front ranks fight with the bayonet, then the weaker side routs and
// the victors cheer. Some casualties are only wounded and crawl to the rear.
const CHARGE={speed:3.0,contact:1.3,melee:4.5,strikeEvery:0.4,rout:3.6,cheer:4,stride:1.8,routStride:1.6};
const CRAWL={time:7,speed:0.3,frameS:0.32};
// Sound (iso-audio.js): shots and drums are panned to where they happen on screen.
const audio=window.NRTSIsoAudio?window.NRTSIsoAudio.create():null;
const COMMANDS={
 fire:{fr:['Apprêtez armes! Joue! Feu!','fr-FR'],br:['Make ready! Present! Fire!','en-GB']},
 charge:{fr:['En avant! À la baïonnette!','fr-FR'],br:['Steady, lads! Hold the line!','en-GB']},
 cheer:{fr:["Vive l'Empereur!",'fr-FR'],br:['Huzzah! Huzzah!','en-GB']}};
const command=(prefix,kind)=>{if(audio){const [text,lang]=COMMANDS[kind][prefix];audio.say(text,lang);}};
function ear(x,y){
 const hw=view.clientWidth/2||1,hh=view.clientHeight/2||1,dx=(x-state.camX)*state.zoom/hw,dy=(y-state.camY)*state.zoom/hh;
 return[Math.max(-1,Math.min(1,dx)),Math.max(0,1-Math.hypot(dx,dy)*0.45)];
}
const groundVec=d=>({x:Math.cos(-d*Math.PI/4),y:Math.sin(-d*Math.PI/4)});
// --- Artillery ----------------------------------------------------------------
// Each regiment has two guns. On the march they are run along behind the
// column; when the regiment deploys they go to the flanks of the line, one
// each side. While the regiment fires, each gun's crew works the drill: #1
// sponges and rams, #2 loads the cartridge, #3 lays the gun with the handspike,
// #4 fires it with the linstock. The gun recoils, #3 and #4 run it back up, and
// the round shot grazes and bounces through the enemy ranks.
const GUN={speed:2,flank:3,trail:3.2,spacing:4.5,cycle:8,fireAt:5.3,recoil:0.9,recoilTime:0.2,haulFrom:6,haulTo:7.6,stagger:2.7,
 ballSpeed:30,muzzle:1.45,muzzleH:1.0,lethalH:1.7,reach:0.45,maxHits:4,rest:3};
// Crew places in gun coordinates: [right of the axle, forward of it, facing [right, forward]].
const CREW_SPOTS={
 rest:[[1.25,0.75,[-1,0]],[-1.25,0.75,[1,0]],[0.75,-2.45,[0,1]],[0.85,-0.45,[-1,0]]],
 ram:[0.35,2.55,[-1,0]],load:[-0.75,1.75,[1,0]],aim:[0.15,-2.6,[0,1]],
 haul:[[0.95,0.15,[0,1]],[-0.95,0.15,[0,1]]]};
// --- Cavalry ------------------------------------------------------------------
// Each regiment has a squadron of six light horse in two ranks, led by an
// officer with a trumpeter beside him. On the march they ride behind the guns;
// in line they stand on the left flank, trotting when they have far to go.
// Cavalerie! sends the French squadron at the British line: walk, trot, then
// the gallop, a short melee of sabre cuts with rearing horses, then they rally.
// Buildings a charge rides around (ground radius in metres).
const OBSTACLE_R={farmhouse:5,barn:6,cottage:4,barracks_fr:6,barracks_br:6};
// First building on the straight ride from c to e, and a point to ride round it on the near side.
function detour(c,e){
 const dx=e.x-c.x,dy=e.y-c.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
 let best=null;
 for(const p of state.props){
   const R=OBSTACLE_R[p.type];if(!R)continue;
   const along=(p.gx-c.x)*ux+(p.gy-c.y)*uy;if(along<0||along>len)continue;
   const side=(p.gx-c.x)*-uy+(p.gy-c.y)*ux;
   if(Math.abs(side)>R+1.5||(best&&along>best.along))continue;
   const s=side>0?-1:1;best={along,x:p.gx-uy*s*(R+3.5),y:p.gy+ux*s*(R+3.5)};
 }
 return best;
}
const SQUAD={ranks:2,files:3,walk:3.2,trot:4.5,gallop:7.5,stride:2.4,trotStride:2.8,gallopStride:3.6,walkFor:1.2,trotFor:1.5,
 trotFrom:5,contact:1.2,
 melee:3.2,meet:3.5,clash:3.5,clashLoss:0.2,squareHit:0.15,squareCut:0.08,cutEvery:0.45,cutChance:0.35,cutReach:1.6,fallChance:0.18,fallWithin:6,dieFrame:0.22};
const REGIMENTS=[{side:'france',prefix:'fr',lineRanks:3,start:0},{side:'britain',prefix:'br',lineRanks:2,start:0.5}];
const slotKey=(r,f)=>r+','+f;
// v339 orders: an ordered regiment's centre marches at this pace (the men walk
// faster to keep their places) and stops within this distance of the flag.
const ORDER={speed:1.4,arrive:0.3,tapPx:8,flagLife:25};

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

// Men who fell or ran off the field no longer belong to the formation.
const aliveMen=reg=>reg.men.filter(m=>!m.dead&&!m.gone);
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
// Square against cavalry: a hollow square, two ranks on each face, every man
// facing outward; slots and men are matched by their angle round the centre so
// nobody crosses the square to reach his place.
function formSquare(reg,threat){
 const c=centreOf(reg),men=aliveMen(reg),per=Math.ceil(men.length/8),half=per*LINE.spacing/2;
 let nx=threat.x-c.x,ny=threat.y-c.y;const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
 const slots=[];
 for(let k=0;k<4;k++){
   const fx=k===0?nx:k===1?-ny:k===2?-nx:ny,fy=k===0?ny:k===1?nx:k===2?-ny:-nx,tx=-fy,ty=fx;
   for(let r=0;r<2;r++)for(let i=0;i<per;i++){
     const out=half+(r===0?0.5:-0.45),side=(i-(per-1)/2)*LINE.spacing;
     slots.push({x:c.x+fx*out+tx*side,y:c.y+fy*out+ty*side,dir:dirIndex(fx,fy),r,fx,fy});
   }
 }
 const angle=p=>Math.atan2(p.y-c.y,p.x-c.x);
 slots.sort((a,b)=>angle(a)-angle(b));
 men.sort((a,b)=>angle({x:a.gx,y:a.gy})-angle({x:b.gx,y:b.gy}));
 men.forEach((m,j)=>{m.square=slots[Math.floor(j*slots.length/men.length)];});
 reg.square={cx:c.x,cy:c.y,half};reg.formation='square';reg.readyAt=null;
}
// Column off the road (v339 orders): four files behind the head, around a
// centre that the move order walks to the flag.
function formFreeColumn(reg,face){
 const c=centreOf(reg),l=Math.hypot(face.x-c.x,face.y-c.y)||1,nx=(face.x-c.x)/l,ny=(face.y-c.y)/l,tx=-ny,ty=nx;
 const men=aliveMen(reg),ranks=Math.ceil(men.length/COLUMN.files);
 men.sort((a,b)=>(b.gx*nx+b.gy*ny)-(a.gx*nx+a.gy*ny));
 reg.slots=new Map();
 for(let r=0;r<ranks;r++){
   men.slice(r*COLUMN.files,(r+1)*COLUMN.files).sort((a,b)=>(a.gx*tx+a.gy*ty)-(b.gx*tx+b.gy*ty))
     .forEach((m,f)=>{m.slot={r,f};reg.slots.set(slotKey(r,f),m);});
 }
 reg.col={cx:c.x,cy:c.y,nx,ny,tx,ty,ranks};reg.formation='fcolumn';reg.readyAt=null;
}
function freeColumnAt(reg,back,lateral){
 const C=reg.col,v=(C.ranks-1)/2*COLUMN.gap-back;
 return{x:C.cx+C.nx*v+C.tx*lateral,y:C.cy+C.ny*v+C.ty*lateral,dir:dirIndex(C.nx,C.ny)};
}
const firingOf=reg=>state.firing||!!(reg.cmd&&reg.cmd.fire);
function slotTarget(reg,m){
 if(reg.formation==='square'&&m.square)return m.square;
 if(reg.formation==='fcolumn')return freeColumnAt(reg,m.slot.r*COLUMN.gap,(m.slot.f-(COLUMN.files-1)/2)*COLUMN.spacing);
 return reg.formation==='line'?lineTarget(reg,m.slot.r,m.slot.f)
   :columnTarget(reg,m.slot.r*COLUMN.gap,(m.slot.f-(COLUMN.files-1)/2)*COLUMN.spacing);
}
function staffTarget(reg,role){
 // In square the staff and the colour stand in the middle.
 if(reg.formation==='square'){const S=reg.square,o=role==='officer'?0:role==='ensign'?0.7:-0.7;return{x:S.cx+o,y:S.cy,dir:0};}
 if(reg.formation==='line'){
   const L=reg.line,half=(L.files/2)*LINE.spacing;
   const at=(u,v)=>({x:L.cx+L.tx*u+L.nx*v,y:L.cy+L.ty*u+L.ny*v,dir:dirIndex(L.nx,L.ny)});
   // Officer on the right flank, colour just behind the front rank, drummer at the rear.
   return role==='officer'?at(half+1.1,0.4):role==='ensign'?at(0,-LINE.gap*0.5):at(-1.0,-(L.ranks*LINE.gap+0.7));
 }
 if(reg.formation==='fcolumn'){const R=reg.col.ranks;
   return role==='officer'?freeColumnAt(reg,-2.2,0):role==='ensign'?freeColumnAt(reg,(R/2-0.5)*COLUMN.gap,0):freeColumnAt(reg,R*COLUMN.gap+0.4,1.2);}
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

function walkTo(m,t,dt,snap,speed=WALK){
 const dx=t.x-m.gx,dy=t.y-m.gy,dist=Math.hypot(dx,dy);
 if(!m.placed||snap||dist<=ARRIVE){
   if(m.placed)m.walk+=dist;
   m.moving=m.placed&&snap&&dist>1e-3;
   m.gx=t.x;m.gy=t.y;m.placed=true;
   m.dir=t.dir;return;
 }
 const step=Math.min(dist,speed*dt);
 m.gx+=dx/dist*step;m.gy+=dy/dist*step;m.walk+=step;
 m.moving=true;m.dir=dirIndex(dx,dy);
}

function updateRegiments(){
 if(!state.regiments)buildRegiments();
 const dt=Math.max(0,Math.min(0.25,state.time-state.simTime));state.simTime=state.time;
 const [fr,br]=state.regiments,centres=[centreOf(fr),centreOf(br)];
 if(state.charge)updateCharge(dt);
 updateBatteries(dt);
 updateSquadrons(dt);
 state.regiments.forEach((reg,i)=>{
   // The British form square while the French horse is out, and line again after.
   const square=i===1&&state.reaction&&state.cavCharge&&state.cavCharge.phase!=='rally';
   const cmd=reg.cmd,firing=firingOf(reg);
   if(square){if(reg.formation!=='square')formSquare(reg,centreOf({men:liveRiders(state.squadrons[0])}));}
   else if(reg.formation==='square')formLine(reg,centres[1-i]);
   else if((firing||state.charge)&&reg.formation!=='line')formLine(reg,centres[1-i]);
   else if(cmd){
     // An ordered regiment keeps its own formation off the road.
     if(cmd.form==='line'&&reg.formation!=='line')formLine(reg,cmd.face);
     else if(cmd.form==='column'&&reg.formation!=='fcolumn')formFreeColumn(reg,cmd.face);
   }
   else if(!state.halted&&reg.formation!=='column')formColumn(reg);
   reg.marching=false;
   if(cmd&&cmd.dest&&!state.charge&&!square&&(reg.formation==='line'||reg.formation==='fcolumn')){
     // March the formation's centre to the flag; the men keep their places round it.
     const A=reg.formation==='line'?reg.line:reg.col,dx=cmd.dest.x-A.cx,dy=cmd.dest.y-A.cy,dist=Math.hypot(dx,dy);
     if(dist<=ORDER.arrive)cmd.dest=null;
     else{const step=Math.min(dist,ORDER.speed*dt);A.cx+=dx/dist*step;A.cy+=dy/dist*step;reg.readyAt=null;reg.marching=true;}
   }
   // A column on the march follows the road exactly; reforming men walk.
   const snap=reg.formation==='column'&&!reg.reforming;
   let spread=0,walking=0;
   if(state.charge&&state.charge.loser===i){flee(reg,dt);return;}
   const speed=state.charge&&state.charge.phase==='advance'&&i===state.charge.attacker?CHARGE.speed*1.15:WALK;
   for(const m of aliveMen(reg)){
     const t=slotTarget(reg,m);walkTo(m,t,dt,snap,speed);
     spread=Math.max(spread,Math.hypot(t.x-m.gx,t.y-m.gy));if(m.moving&&!snap)walking++;
   }
   for(const st of reg.staff)walkTo(st,staffTarget(reg,st.role),dt,snap);
   if(reg.reforming&&spread<0.3)reg.reforming=false;
   if(reg.formation==='line'&&reg.readyAt===null&&walking===0&&!reg.marching){reg.readyAt=state.time;if(firing)command(reg.prefix,'fire');}
 });
}

// Charge phases: form (both lines stand) -> advance -> melee -> rout.
function updateCharge(dt){
 const ch=state.charge,regs=state.regiments,att=regs[ch.attacker],def=regs[1-ch.attacker];
 if(ch.phase==='form'&&att.readyAt!==null&&def.readyAt!==null){ch.phase='advance';ch.at=state.time;regs.forEach(r=>command(r.prefix,'charge'));}
 if(ch.phase==='advance'){
   const L=att.line,E=def.line,gap=(E.cx-L.cx)*L.nx+(E.cy-L.cy)*L.ny;
   // Within a millimetre counts as contact (the last step lands on it exactly, up to rounding).
   if(gap<=CHARGE.contact+1e-3){ch.phase='melee';ch.at=state.time;ch.strikes=0;}
   else{const step=Math.min(gap-CHARGE.contact,CHARGE.speed*dt);L.cx+=L.nx*step;L.cy+=L.ny*step;}
 }
 if(ch.phase==='melee'){
   // Each round the front ranks trade bayonet thrusts; the attacker, deeper in
   // ranks and with momentum, loses fewer men.
   while(state.time>=ch.at+(ch.strikes+1)*CHARGE.strikeEvery){
     ch.strikes++;
     regs.forEach((reg,i)=>{
       const front=aliveMen(reg).filter(m=>m.slot.r===0&&!state.hits.some(h=>h.key===m.key));
       if(front.length<=1||hash(ch.strikes*13+i,61)>=(i===ch.attacker?0.3:0.6))return;
       const m=front[Math.floor(hash(ch.strikes,i+71)*front.length)];
       state.hits.push({key:m.key,at:state.time,seed:1000+ch.strikes*2+i,melee:true});
     });
   }
   if(state.time>=ch.at+CHARGE.melee){
     const alive=regs.map(r=>aliveMen(r).length);
     ch.loser=alive[ch.attacker]>=alive[1-ch.attacker]?1-ch.attacker:ch.attacker;
     ch.phase='rout';ch.at=state.time;command(regs[1-ch.loser].prefix,'cheer');
   }
 }
}
// The beaten regiment turns and runs from the enemy, each man on his own line,
// and is gone once he has left the field.
function flee(reg,dt){
 const enemy=centreOf(state.regiments[1-state.regiments.indexOf(reg)]),c=centreOf(reg);
 const l=Math.hypot(c.x-enemy.x,c.y-enemy.y)||1,ax=(c.x-enemy.x)/l,ay=(c.y-enemy.y)/l;
 for(const m of [...aliveMen(reg),...reg.staff]){
   if(m.gone)continue;
   const seed=hash((m.id??m.role.length)+5,reg.prefix==='fr'?83:89),turn=(seed-.5)*0.7,v=CHARGE.rout*(0.85+seed*0.3);
   const dx=ax*Math.cos(turn)-ay*Math.sin(turn),dy=ax*Math.sin(turn)+ay*Math.cos(turn);
   m.gx+=dx*v*dt;m.gy+=dy*v*dt;m.walk+=v*dt;m.moving=true;m.dir=dirIndex(dx,dy);
   if(Math.max(Math.abs(m.gx),Math.abs(m.gy))>GROUND*0.85)m.gone=true;
 }
}

// Drummers beat the march (and the pas de charge, faster) while their regiment moves.
function beatDrums(){
 if(!audio||!audio.isOn())return;
 state.regiments.forEach((reg,i)=>{
   const ch=state.charge,charging=ch&&ch.phase==='advance'&&i===ch.attacker;
   const moving=charging||(reg.cmd?reg.marching:!state.halted&&!state.firing)||reg.reforming;
   const drummer=reg.staff.find(s=>s.role==='drummer');
   if(!moving||!drummer||drummer.gone){reg.drumAt=null;return;}
   const every=charging?0.28:0.5;
   if(reg.drumAt==null)reg.drumAt=state.time;
   if(state.time<reg.drumAt)return;
   const p=project(drummer.gx,drummer.gy);reg.beat=(reg.beat||0)+1;
   audio.drum(ear(p.x,p.y)[0],reg.beat%4===1);reg.drumAt=state.time+every;
 });
}

function buildBatteries(){
 state.batteries=state.regiments.flatMap(reg=>[0,1].map(i=>{
   const {side,prefix}=reg,key=prefix+':gun'+i,h=gunTarget(reg,i);
   const gun={side,prefix,gun:true,key,index:i,home:{x:h.x,y:h.y},gx:h.x,gy:h.y,dir:h.dir,recoil:0,roll:0,
     rolling:false,moving:false,clock:-i*GUN.stagger,t:-1,fired:-1};
   gun.crew=[0,1,2,3].map(n=>({side,prefix,gunner:true,num:n+1,key:key+':'+(n+1),gx:h.x,gy:h.y,walk:0,dir:gun.dir,
     moving:false,placed:false,act:'idle',t:-1}));
   return gun;
 }));
}
// Where a gun belongs: behind the column, or on its flank of the line facing the enemy.
function gunTarget(reg,i){
 const ranks=Math.ceil(aliveMen(reg).length/COLUMN.files),B=reg.batCmd;
 // Ordered elsewhere: the two guns side by side, laid towards the enemy.
 if(B)return{x:B.x+B.tx*(i?-1:1)*GUN.spacing/2,y:B.y+B.ty*(i?-1:1)*GUN.spacing/2,dir:B.dir};
 if(reg.formation==='fcolumn')return freeColumnAt(reg,ranks*COLUMN.gap+GUN.trail+i*GUN.spacing,0);
 if(reg.formation==='column'||!reg.line)return columnTarget(reg,ranks*COLUMN.gap+GUN.trail+i*GUN.spacing,0);
 const L=reg.line,u=(i?-1:1)*((L.files-1)/2*LINE.spacing+GUN.flank);
 return{x:L.cx+L.tx*u,y:L.cy+L.ty*u,dir:dirIndex(L.nx,L.ny)};
}
// Gun-local point (right, forward) in ground metres; from the home spot or the recoiled gun.
function gunPoint(g,lx,ly,fromHome){
 const F=groundVec(g.dir),o=fromHome?g.home:{x:g.gx,y:g.gy};
 return{x:o.x+F.y*lx+F.x*ly,y:o.y-F.x*lx+F.y*ly};
}
const gunFacing=(g,[fx,fy])=>{const F=groundVec(g.dir);return dirIndex(F.y*fx+F.x*fy,-F.x*fx+F.y*fy);};

function updateBatteries(dt){
 if(!state.batteries)buildBatteries();
 for(const g of state.batteries){
   const reg=state.regiments[g.prefix==='fr'?0:1],enemy=state.regiments[g.prefix==='fr'?1:0],c=centreOf(enemy);
   // Run the gun to its place (wheels turning); it only works once it stands there.
   const goal=gunTarget(reg,g.index),dx=goal.x-g.home.x,dy=goal.y-g.home.y,dist=Math.hypot(dx,dy);
   g.moving=dist>0.15;
   if(g.moving){
     const step=Math.min(dist,GUN.speed*dt);
     g.home.x+=dx/dist*step;g.home.y+=dy/dist*step;g.roll+=step;g.dir=dirIndex(dx,dy);
     g.clock=Math.min(g.clock,-g.index*GUN.stagger);g.recoil=0;g.rolling=true;g.t=-1;
     g.gx=g.home.x;g.gy=g.home.y;
     moveCrew(g,dt);continue;
   }
   const firing=state.firing||!!reg.batFire;
   if(firing)g.clock+=dt;
   const t=firing&&g.clock>=0?g.clock%GUN.cycle:-1,cycle=Math.floor(g.clock/GUN.cycle);
   g.t=t;
   if(t<0&&!firing)g.dir=goal.dir;
   // The gun is laid on the enemy between shots.
   if(t>=0&&t<0.6&&aliveMen(enemy).length)g.dir=dirIndex(c.x-g.home.x,c.y-g.home.y);
   if(t>=GUN.fireAt&&g.fired!==cycle){g.fired=cycle;fireGun(g,c);}
   // Recoil on the shot, then the crew runs the gun back up.
   const before=g.recoil;
   g.recoil=t<GUN.fireAt?0:t<GUN.haulFrom?GUN.recoil*Math.min(1,(t-GUN.fireAt)/GUN.recoilTime)
     :t<GUN.haulTo?GUN.recoil*(1-(t-GUN.haulFrom)/(GUN.haulTo-GUN.haulFrom)):0;
   g.rolling=t>=GUN.haulFrom&&t<GUN.haulTo;
   if(g.rolling)g.roll+=Math.abs(before-g.recoil);
   const F=groundVec(g.dir);g.gx=g.home.x-F.x*g.recoil;g.gy=g.home.y-F.y*g.recoil;
   g.crew.forEach((m,n)=>{
     let spot=CREW_SPOTS.rest[n],act=n===3?'ready':'idle',onGun=false;
     if(n===0&&t>=0&&t<3.0){spot=CREW_SPOTS.ram;if(t>=1.4)act='ram';}
     // #2 steps up to the muzzle only to load; at the shot both stand clear by the wheels.
     if(n===1&&t>=0.3&&t<1.6){spot=CREW_SPOTS.load;if(t>=0.6&&t<1.4)act='load';}
     if(n===2&&t>=3.0&&t<4.4){spot=CREW_SPOTS.aim;act='aim';}
     if(n===3&&t>=5.0&&t<5.8)act='touch';
     if((n===2||n===3)&&g.rolling){spot=CREW_SPOTS.haul[n-2];act='haul';onGun=true;}
     const p=gunPoint(g,spot[0],spot[1],!onGun);
     walkTo(m,{x:p.x,y:p.y,dir:gunFacing(g,spot[2])},dt,false);
     m.act=act;m.t=t;
   });
 }
}

// On the move #3 and #4 push at the wheels and #1 and #2 walk beside the trail.
const MOVE_SPOTS=[[0.9,-1.3,[0,1]],[-0.9,-1.3,[0,1]],[0.95,0.15,[0,1]],[-0.95,0.15,[0,1]]];
function moveCrew(g,dt){
 g.crew.forEach((m,n)=>{
   const [lx,ly,face]=MOVE_SPOTS[n],p=gunPoint(g,lx,ly,true);
   walkTo(m,{x:p.x,y:p.y,dir:gunFacing(g,face)},dt,false,GUN.speed*1.6);
   m.act=n<2?'march':'haul';m.t=-1;
 });
}

function fireGun(g,c){
 state.cannonShots++;
 const atlas=state.atlases[g.prefix+'g'],F=groundVec(g.dir),p=project(g.gx,g.gy);
 if(atlas){
   const m=atlas.sheet.meta,px=m.muzzle.px[DIRS[g.dir]],k=S/SPRITE_PX_PER_M;
   const x=p.x+(px.x-m.pivot.x)*k,y=p.y+(px.y-m.pivot.y)*k;
   // A cannon throws out a big rolling cloud ahead of the muzzle.
   for(let i=0;i<6;i++){
     const seed=hash(state.cannonShots*7+i,g.prefix==='fr'?3:5);
     state.smoke.push({x:x+F.x*S*i*0.5,y:y-F.y*S*SQUASH*i*0.5,born:state.time,life:7+seed*3,size:1.5+seed*1.3,seed});
   }
   addBank(x,y,hash(state.cannonShots,9));
   if(audio)audio.cannon(...ear(x,y));
 }
 // Round shot: first graze just short of the enemy line, then ever lower bounces.
 const dx=c.x-g.gx,dy=c.y-g.gy,D=Math.hypot(dx,dy)||1,first=Math.max(4,D-GUN.muzzle-2.5);
 const hops=[[0,first,0.9],[first,first+6,0.8],[first+6,first+10,0.4],[first+10,first+12.5,0.15]];
 state.balls.push({side:g.prefix,x0:g.gx+F.x*GUN.muzzle,y0:g.gy+F.y*GUN.muzzle,ux:dx/D,uy:dy/D,born:state.time,
   hops,end:first+18,grazed:0,hits:0,hit:new Set()});
}

// Ball position along its path: ground point and height above it.
function ballAt(b){
 const s=Math.min(b.end,(state.time-b.born)*GUN.ballSpeed);
 let h=0;
 b.hops.forEach(([a,e,peak],i)=>{
   if(s<a||s>=e)return;
   const u=(s-a)/(e-a);h=4*peak*u*(1-u)+(i===0?GUN.muzzleH*(1-u):0);
 });
 return{s,h,x:b.x0+b.ux*s,y:b.y0+b.uy*s};
}
function updateBalls(){
 state.balls=state.balls.filter(b=>{
   const p=ballAt(b);
   // Each graze throws up a puff of earth.
   while(b.grazed<b.hops.length&&p.s>=b.hops[b.grazed][1]){
     const e=b.hops[b.grazed][1],q=project(b.x0+b.ux*e,b.y0+b.uy*e);
     state.smoke.push({x:q.x,y:q.y,born:state.time,life:1.6,size:.6,seed:hash(b.grazed,state.cannonShots),dust:true});
     b.grazed++;
   }
   if(p.h<GUN.lethalH&&b.hits<GUN.maxHits){
     const enemy=state.regiments[b.side==='fr'?1:0];
     for(const m of aliveMen(enemy)){
       if(b.hit.has(m.key)||Math.hypot(m.gx-p.x,m.gy-p.y)>GUN.reach)continue;
       b.hit.add(m.key);b.hits++;state.ballHits++;
       state.hits.push({key:m.key,at:state.time,seed:5000+state.ballHits});
       if(b.hits>=GUN.maxHits)break;
     }
   }
   return state.time-b.born<b.end/GUN.ballSpeed+GUN.rest;
 });
}
function drawBalls(){
 for(const b of state.balls){
   const p=ballAt(b),g=project(p.x,p.y),y=g.y-p.h*0.866*S;
   ctx.fillStyle='rgba(20,20,16,.3)';ctx.beginPath();ctx.ellipse(g.x,g.y,2.4,1.2,0,0,Math.PI*2);ctx.fill();
   if(p.s<b.end){
     // Motion streak behind a flying ball.
     const back=project(p.x-b.ux*0.8,p.y-b.uy*0.8);
     ctx.strokeStyle='rgba(40,38,34,.35)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(back.x,back.y-p.h*0.866*S);ctx.lineTo(g.x,y);ctx.stroke();
   }
   ctx.fillStyle='#1d1c1a';ctx.beginPath();ctx.arc(g.x,y,2.1,0,Math.PI*2);ctx.fill();
 }
}
function gunFrame(g){
 const d=DIRS[g.dir],since=g.t-GUN.fireAt;
 if(g.t>=0&&since>=0&&since<0.4)return 'fire_'+d+'|'+(since<0.09?0:1);
 if(g.rolling||g.moving)return 'roll_'+d+'|'+Math.floor(g.roll/0.1)%4;
 return 'idle_'+d+'|0';
}
function crewFrame(m){
 const d=DIRS[m.dir],t=m.t,beat=(period,n)=>Math.floor(state.time/period+m.num*0.37)%n;
 if(m.moving||m.act==='march')return 'march_'+d+'|'+Math.floor((m.walk%MARCH.strideM)/MARCH.strideM*MARCH.frames)%MARCH.frames;
 switch(m.act){
   case 'ram':return 'ram_'+d+'|'+Math.floor((t-1.4)/0.2)%4;
   case 'load':return 'load_'+d+'|'+(t<1.0?0:1);
   case 'aim':return 'aim_'+d+'|'+Math.floor((t-3.0)/0.35)%2;
   case 'touch':return 'touch_'+d+'|'+(t<GUN.fireAt?0:1);
   case 'haul':return 'haul_'+d+'|'+beat(0.18,4);
   case 'ready':return 'ready_'+d+'|'+beat(0.8,2);
   default:return 'idle_'+d+'|'+beat(0.6,2);
 }
}

function buildSquadrons(){
 state.squadrons=state.regiments.map(reg=>{
   const riders=[];
   for(let r=0;r<SQUAD.ranks;r++)for(let f=0;f<SQUAD.files;f++){
     const id=r*SQUAD.files+f,look=reg.prefix+'c'+(hash(id+3,reg.prefix==='fr'?51:53)<0.5?'':'2');
     riders.push({side:reg.side,prefix:reg.prefix,rider:true,id,r,f,look,key:reg.prefix+':cav'+id,gx:0,gy:0,walk:0,
       dir:0,moving:false,placed:false,act:'idle',gait:'walk',forceWalk:false});
   }
   // Officer in front of the centre, trumpeter at his right.
   [['officer','co',1],['trumpeter','ct',2]].forEach(([role,look,f],i)=>riders.push({side:reg.side,prefix:reg.prefix,
     rider:true,role,id:SQUAD.ranks*SQUAD.files+i,r:-1,f,look:reg.prefix+look,key:reg.prefix+':cav'+role,gx:0,gy:0,walk:0,
     dir:0,moving:false,placed:false,act:'idle',gait:'walk',forceWalk:false}));
   return{reg,riders};
 });
}
// A rider's place: in the column behind the guns, or on the line's left flank.
function riderHome(reg,m){
 const Q=state.squadrons&&state.squadrons[reg.prefix==='fr'?0:1].cmd;
 if(Q){const u=(m.f-1)*1.5+(m.r<0?(m.role==='officer'?-0.4:0.4):0),v=m.r<0?2.2:-m.r*2.6;
   return{x:Q.x+Q.tx*u+Q.nx*v,y:Q.y+Q.ty*u+Q.ny*v,dir:Q.dir};}
 if(reg.formation==='fcolumn'){const ranks=Math.ceil(aliveMen(reg).length/COLUMN.files);
   return freeColumnAt(reg,ranks*COLUMN.gap+GUN.trail+GUN.spacing+4+m.r*2.8,(m.f-1)*1.4);}
 if(reg.formation==='column'||!reg.line){
   const ranks=Math.ceil(aliveMen(reg).length/COLUMN.files);
   return columnTarget(reg,ranks*COLUMN.gap+GUN.trail+GUN.spacing+4+m.r*2.8,(m.f-1)*1.4);
 }
 const L=reg.line,u=-((L.files-1)/2*LINE.spacing+GUN.flank+3.5+m.f*1.5),v=-1-m.r*2.6;
 return{x:L.cx+L.tx*u+L.nx*v,y:L.cy+L.ty*u+L.ny*v,dir:dirIndex(L.nx,L.ny)};
}
const liveRiders=sq=>sq.riders.filter(m=>!m.dead);
function updateSquadrons(dt){
 if(!state.squadrons)buildSquadrons();
 const ch=state.cavCharge;
 updateCounter(dt);updateClash();
 state.squadrons.forEach((sq,i)=>{
   const reg=sq.reg,charging=ch&&i===0,marching=!sq.cmd&&((reg.formation==='column'&&!state.halted)||reg.marching);
   if(i===1&&state.cavCounter)return;
   if(!charging){
     for(const m of liveRiders(sq)){
       // A long way to their place: trot there; otherwise walk.
       const h=riderHome(reg,m),far=Math.hypot(h.x-m.gx,h.y-m.gy)>SQUAD.trotFrom&&m.placed;
       if(far)m.gait='trot';else if(!m.moving)m.gait='walk';
       walkTo(m,h,dt,false,m.gait==='trot'?SQUAD.trot:SQUAD.walk);
       m.act='idle';m.forceWalk=marching;
     }
     return;
   }
   const enemy=state.regiments[1],E=enemy.formation==='square'?{x:enemy.square.cx,y:enemy.square.cy}:centreOf(enemy);
   const C=centreOf({men:liveRiders(sq).map(m=>({gx:m.gx,gy:m.gy}))});
   const contact=enemy.formation==='square'?enemy.square.half+1.6:SQUAD.contact;
   if(!ch.aim){const l=Math.hypot(E.x-C.x,E.y-C.y)||1;ch.aim={x:(E.x-C.x)/l,y:(E.y-C.y)/l};ch.via=detour(C,E);}
   // Ride round a building first, then straight at the enemy.
   if(ch.via&&Math.hypot(ch.via.x-C.x,ch.via.y-C.y)<2.5){
     ch.via=null;const l=Math.hypot(E.x-C.x,E.y-C.y)||1;ch.aim={x:(E.x-C.x)/l,y:(E.y-C.y)/l};
   }
   const A=ch.aim,T={x:-A.y,y:A.x},face=dirIndex(A.x,A.y),via=ch.via&&ch.phase!=='melee'&&ch.phase!=='rally'?ch.via:null;
   const since=state.time-ch.at;
   if(ch.phase==='walk'&&since>=SQUAD.walkFor){ch.phase='trot';ch.at=state.time;}
   else if(ch.phase==='trot'&&since>=SQUAD.trotFor){ch.phase='gallop';ch.at=state.time;}
   let arrived=0;
   for(const m of liveRiders(sq)){
     m.forceWalk=false;
     if(ch.phase==='rally'){
       const h=riderHome(reg,m);walkTo(m,h,dt,false,SQUAD.gallop*0.8);m.gait='gallop';m.act='idle';
       if(!m.moving)arrived++;continue;
     }
     // Officer and trumpeter ride in at the ends of the front rank.
     const r=Math.max(0,m.r),f=m.r<0?(m.role==='officer'?-0.6:2.6):m.f;
     const goal=via||E,back=via?r*2.2:contact+0.4+r*2.2;
     const t={x:goal.x-A.x*back+T.x*(f-1)*1.5,y:goal.y-A.y*back+T.y*(f-1)*1.5,dir:face};
     if(ch.phase==='melee'){walkTo(m,t,dt,false,SQUAD.walk);meleeRider(m,ch);continue;}
     if(ch.phase==='clash'){walkTo(m,{x:m.gx,y:m.gy,dir:m.dir},dt,false);m.act=hash(m.id+3,Math.floor(state.time/0.4))<0.25?'rear':'slash';continue;}
     walkTo(m,t,dt,false,SQUAD[ch.phase]);
     m.gait=ch.phase;m.act='idle';
     // Some riders are brought down by musketry as they close.
     if(ch.phase==='gallop'&&!via&&enemy.formation!=='square'&&!state.cavCounter&&Math.hypot(t.x-m.gx,t.y-m.gy)<SQUAD.fallWithin&&hash(m.id+ch.count*13,77)<SQUAD.fallChance){
       m.dead=true;state.riderFalls++;
       state.deadRiders.push({look:m.look,prefix:m.prefix,gx:m.gx,gy:m.gy,dir:m.dir,t0:state.time});continue;
     }
     if(!m.moving)arrived++;
   }
   const alive=liveRiders(sq).length;
   if(ch.phase==='gallop'&&!ch.via&&!(state.cavCounter&&state.cavCounter.phase==='gallop')&&(arrived>=alive||since>12)){ch.phase='melee';ch.at=state.time;}
   else if(ch.phase==='melee'&&since>=SQUAD.melee){ch.phase='rally';ch.at=state.time;}
   else if(ch.phase==='rally'&&(arrived>=alive||since>10)){state.cavCharge=null;ui.cav.disabled=false;}
   if(ch.phase==='gallop'&&audio&&state.time>=(ch.hoofAt||0)){
     const p=project(C.x,C.y);audio.hooves(...ear(p.x,p.y));ch.hoofAt=state.time+0.11;
   }
 });
}
// Nearest live French rider within range in front of a man of the square.
function riderInFront(u,range){
 if(!state.squadrons)return null;
 const fx=u.square.fx,fy=u.square.fy;let best=null,bd=range;
 for(const m of liveRiders(state.squadrons[0])){
   const dx=m.gx-u.gx,dy=m.gy-u.gy,dist=Math.hypot(dx,dy);
   if(dist<bd&&(dx*fx+dy*fy)>0.3*dist){best=m;bd=dist;}
 }
 return best;
}
function killRider(m){
 m.dead=true;state.riderFalls++;
 state.deadRiders.push({look:m.look,prefix:m.prefix,gx:m.gx,gy:m.gy,dir:m.dir,t0:state.time});
}
// A musket ball from the square may bring down a horse.
function shootRider(u){
 state.squareShots++;
 const m=riderInFront(u,10);
 if(m&&hash(state.squareShots*17+u.id,59)<SQUAD.squareHit)killRider(m);
}
// Squadron against squadron: every half second each side may lose a rider.
function updateClash(){
 const ch=state.cavCharge,co=state.cavCounter;
 if(!ch||!co||ch.phase!=='clash')return;
 const beat=Math.floor((state.time-ch.at)/0.5);
 if(beat!==ch.clashBeat){
   ch.clashBeat=beat;
   // The stronger squadron loses fewer: each side's risk grows with the odds against it.
   const live=state.squadrons.map(sq=>liveRiders(sq));
   live.forEach((own,i)=>{
     const odds=live[1-i].length/Math.max(1,own.length),risk=Math.min(0.9,SQUAD.clashLoss*odds);
     if(own.length>1&&hash(beat*11+i*5,ch.count+131)<risk)killRider(own[Math.floor(hash(beat,i+7)*own.length)]);
   });
 }
 if(state.time-ch.at<SQUAD.clash)return;
 const [fr,br]=state.squadrons.map(sq=>liveRiders(sq).length);
 co.phase='rally';co.at=state.time;
 // The winners of the clash ride on at the square; beaten, the French rally too.
 if(fr>=br){ch.phase='gallop';ch.aim=null;ch.via=null;ch.won=true;}else{ch.phase='rally';ch.won=false;}
 ch.at=state.time;
}
// The British squadron rides out at the French one once it is under way.
function updateCounter(dt){
 const ch=state.cavCharge;
 if(state.reaction&&ch&&!state.cavCounter&&(ch.phase==='trot'||ch.phase==='gallop')&&!ch.won)
   state.cavCounter={phase:'gallop',at:state.time};
 const co=state.cavCounter;if(!co)return;
 // Nothing left to meet: the French are going home.
 if(co.phase==='gallop'&&(!ch||ch.phase==='rally')){co.phase='rally';co.at=state.time;}
 const sq=state.squadrons[1],own=liveRiders(sq),foe=liveRiders(state.squadrons[0]);
 const C=centreOf({men:own}),F=centreOf({men:foe});
 const l=Math.hypot(F.x-C.x,F.y-C.y)||1,A={x:(F.x-C.x)/l,y:(F.y-C.y)/l},T={x:-A.y,y:A.x},face=dirIndex(A.x,A.y);
 let arrived=0;
 for(const m of own){
   m.forceWalk=false;
   if(co.phase==='rally'){
     const h=riderHome(sq.reg,m);walkTo(m,h,dt,false,SQUAD.gallop*0.8);m.gait='gallop';m.act='idle';
     if(!m.moving)arrived++;continue;
   }
   if(co.phase==='clash'){walkTo(m,{x:m.gx,y:m.gy,dir:face},dt,false);m.act=hash(m.id,Math.floor(state.time/0.4))<0.3?'rear':'slash';continue;}
   const r=Math.max(0,m.r),f=m.r<0?(m.role==='officer'?-0.6:2.6):m.f;
   walkTo(m,{x:F.x-A.x*r*2.2+T.x*(f-1)*1.5,y:F.y-A.y*r*2.2+T.y*(f-1)*1.5,dir:face},dt,false,SQUAD.gallop);
   m.gait='gallop';m.act='idle';
 }
 // The two squadrons meet.
 if(co.phase==='gallop'&&ch&&ch.phase==='gallop'&&foe.length&&own.length&&l<SQUAD.meet){
   co.phase='clash';co.at=state.time;ch.phase='clash';ch.at=state.time;ch.clashBeat=-1;state.clashes++;
 }
 if(co.phase==='rally'&&(arrived>=own.length||state.time-co.at>10))state.cavCounter=null;
}
// In the melee each rider cuts at the nearest enemy now and then; some horses rear.
function meleeRider(m,ch){
 const beat=Math.floor((state.time-ch.at)/SQUAD.cutEvery);
 // Horses refuse a square: more rearing and few cuts get through the bayonets.
 const square=state.regiments[1].formation==='square';
 m.act=hash(m.id+ch.count*7,beat%3+90)<(square?0.5:0.25)?'rear':'slash';
 if(m.lastCut===beat)return;
 m.lastCut=beat;
 if(hash(m.id*31+beat,ch.count+97)>=(square?SQUAD.squareCut:SQUAD.cutChance))return;
 let best=null,bestD=SQUAD.cutReach;
 for(const e of aliveMen(state.regiments[1])){
   if(state.hits.some(h=>h.key===e.key))continue;
   const d=Math.hypot(e.gx-m.gx,e.gy-m.gy);if(d<bestD){best=e;bestD=d;}
 }
 if(best){state.sabreHits++;state.hits.push({key:best.key,at:state.time+0.1,seed:7000+state.sabreHits});}
}
function riderFrame(u){
 const d=DIRS[u.dir],seed=hash(u.id,u.prefix==='fr'?61:63);
 if(u.moving||u.forceWalk){
   const stride=u.gait==='gallop'?SQUAD.gallopStride:u.gait==='trot'?SQUAD.trotStride:SQUAD.stride;
   return u.gait+'_'+d+'|'+Math.floor((u.walk%stride)/stride*6)%6;
 }
 if(u.act==='slash')return 'slash_'+d+'|'+Math.floor(state.time/0.18+seed*3)%3;
 if(u.act==='rear')return 'rear_'+d+'|'+Math.floor(state.time/0.3)%2;
 return 'idle_'+d+'|'+Math.floor(state.time/0.7+seed*2)%2;
}

function units(){
 updateRegiments();
 return state.regiments.flatMap(reg=>[...aliveMen(reg),...reg.staff.filter(s=>!s.gone)]);
}

// One deterministic controller (v321) drives idle/aim/fire/reload on the lab
// clock; marching keeps the distance-driven cadence so nobody walks in place.
function frameFor(u){
 const d=DIRS[u.dir];
 if(u.role){
   // Command pose while the regiment fires: sword raised, charge beaten, colour raised.
   if(u.moving)return 'march_'+d+'|'+Math.floor((u.walk%MARCH.strideM)/MARCH.strideM*MARCH.frames)%MARCH.frames;
   if(firingOf(regimentOf(u)))return 'command_'+d+'|'+(Math.floor(state.time/0.45)%2);
   return 'idle_'+d+'|'+(Math.floor(state.time/0.6)%2);
 }
 const ch=state.charge,step=(stride,frames)=>Math.floor((u.walk%stride)/stride*frames)%frames;
 if(ch&&ch.phase!=='form'){
   const i=u.side==='france'?0:1,beat=hash(u.id+9,i+3);
   if(ch.loser===i)return 'rout_'+d+'|'+step(CHARGE.routStride,6);
   if(ch.phase==='rout')return state.time<ch.at+CHARGE.cheer?'cheer_'+d+'|'+(Math.floor(state.time/0.35+beat*2)%2):'idle_'+d+'|'+(Math.floor(state.time/0.6+beat)%2);
   if(u.moving)return (i===ch.attacker?'charge_':'march_')+d+'|'+(i===ch.attacker?step(CHARGE.stride,6):step(MARCH.strideM,MARCH.frames));
   // Melee: the front ranks thrust, the men behind stand with bayonets levelled.
   if(ch.phase==='melee'&&u.slot.r===0)return 'thrust_'+d+'|'+(Math.floor(state.time/0.2+beat*3)%3);
   return (i===ch.attacker?'charge_'+d+'|0':'aim_'+d+'|0');
 }
 const c=state.controller,sreg=regimentOf(u);
 if(c&&sreg.formation==='square'&&u.square&&!u.moving){
   // Each face fires at horsemen in front of it; the outer rank kneels.
   const kneel=u.square.r===0,threat=riderInFront(u,9);
   const r=c.update(u.key,state.time*1000,{moving:false,fireOrder:!!threat,rate:1});
   for(const e of r.events)if(e.type==='muzzle'){spawnSmoke(u,kneel);shootRider(u);}
   if(kneel&&(r.state==='aim'||r.state==='fire'))return 'k'+r.state+'_'+d+'|'+r.frame;
   if(kneel&&r.state==='idle')return 'kaim_'+d+'|0';
   return r.state+'_'+d+'|'+r.frame;
 }
 if(c){
   // Ranks open fire one after another once the whole line stands; each man
   // presents a moment later or earlier than his neighbours.
   const reg=regimentOf(u),jitter=hash(u.id+71,u.prefix==='fr'?13:17)*FIRE_JITTER;
   const ordered=firingOf(reg)&&reg.formation==='line'&&reg.readyAt!==null&&state.time>=reg.readyAt+u.slot.r*BAND_DELAY+jitter;
   const rate=1-RATE_SPREAD/2+hash(u.id+29,u.prefix==='fr'?19:23)*RATE_SPREAD;
   const r=c.update(u.key,state.time*1000,{moving:u.moving,fireOrder:ordered&&!u.moving,rate});
   const mem=state.drill.get(u.key)||{last:'idle',volley:0,misfire:false};
   if(r.state==='aim'&&mem.last!=='aim'){mem.volley++;mem.misfire=hash(u.id*7+mem.volley,u.prefix==='fr'?29:31)<state.misfireChance;}
   mem.last=r.state;state.drill.set(u.key,mem);
   // The French front rank kneels to aim and fire; nobody kneels to reload.
   const kneel=reg.formation==='line'&&reg.lineRanks===3&&u.slot.r===0;
   for(const e of r.events)if(e.type==='muzzle'){
     if(mem.misfire&&!kneel){state.misfires++;if(audio)audio.misfire(...ear(u.x,u.y));continue;}
     spawnSmoke(u,kneel);shoot(u);if(audio)audio.shot(...ear(u.x,u.y));
   }
   if(!u.moving&&r.state!=='march'){
     if(kneel&&(r.state==='aim'||r.state==='fire'))return 'k'+r.state+'_'+d+'|'+r.frame;
     if(r.state==='fire'&&mem.misfire)return 'misfire_'+d+'|'+r.frame;
     if(r.state==='idle'&&!firingOf(reg)){const extra=idleExtra(u);if(extra)return extra[0]+'_'+d+'|'+extra[1];}
     return r.state+'_'+d+'|'+r.frame;
   }
 }else if(!u.moving){
   return 'idle_'+d+'|'+Math.floor((state.time*1000+u.id*137)/IDLE.frameMs)%IDLE.frames;
 }
 // Distance-driven cadence: each man steps with his own walk, never in place.
 return 'march_'+d+'|'+Math.floor((u.walk%MARCH.strideM)/MARCH.strideM*MARCH.frames)%MARCH.frames;
}

// A man at rest now and then looks around, sets his shako or leans on his musket.
function idleExtra(u){
 const period=7+hash(u.id+3,u.prefix==='fr'?41:43)*6,phase=state.time+hash(u.id,7)*period;
 const bucket=Math.floor(phase/period),into=phase-bucket*period;
 const [name,frames,frameS]=IDLE_EXTRAS[Math.floor(hash(bucket*13+u.id,u.prefix==='fr'?5:9)*IDLE_EXTRAS.length)];
 if(into>=frames*frameS)return null;
 return[name,Math.min(frames-1,Math.floor(into/frameS))];
}

// Powder smoke puffs born at the rendered muzzle pixel, drifting downwind.
function spawnSmoke(u,kneel){
 const atlas=state.atlases[u.look]||state.atlases[u.prefix];if(!atlas)return;
 const m=(kneel?atlas.combat.sheet:atlas.sheet).meta,px=m.muzzle.px[DIRS[u.dir]],k=S/SPRITE_PX_PER_M;
 const x=u.x+(px.x-m.pivot.x)*k,y=u.y+(px.y-m.pivot.y)*k;
 if(u.id===0)state.volleys++;
 if(state.smoke.length>SMOKE_MAX)state.smoke.splice(0,state.smoke.length-SMOKE_MAX);
 const seed=hash(u.id+state.volleys*97,u.prefix==='fr'?1:2);
 state.smoke.push({x,y,born:state.time,life:4.5+seed*2,size:.55+seed*.5,seed});
 // Every shot also feeds a slow, faint bank of smoke that hangs over the line.
 addBank(x,y,seed);
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
     // Some are only wounded: they turn, go down and crawl to the rear.
     const wounded=hash(h.seed+5,u.id+23)<state.woundedShare;
     state.dead.set(h.key,{prefix:u.prefix,look:u.look,side:u.side,id:u.id,gx:u.gx,gy:u.gy,dir:wounded?(u.dir+4)%8:u.dir,t0:state.time,
       fall:wounded?'diefwd':fall,wounded});
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

// Smoke and dust puffs are drawn from small pre-rendered gradient images (made
// once) instead of building hundreds of radial gradients every frame.
const PUFFS={};
function puff(kind){
 if(PUFFS[kind])return PUFFS[kind];
 const c=document.createElement('canvas');c.width=c.height=64;
 const g=c.getContext('2d'),grad=g.createRadialGradient(32,32,0,32,32,32);
 const stops={smoke:[[0,'rgba(236,232,222,.55)'],[.55,'rgba(214,212,204,.32)'],[1,'rgba(200,200,196,0)']],
   dust:[[0,'rgba(150,128,96,.55)'],[.55,'rgba(136,116,88,.32)'],[1,'rgba(120,104,80,0)']],
   bank:[[0,'rgba(226,224,216,1)'],[1,'rgba(214,214,208,0)']]}[kind];
 for(const [o,col] of stops)grad.addColorStop(o,col);
 g.fillStyle=grad;g.fillRect(0,0,64,64);
 return(PUFFS[kind]=c);
}
// Shots close together feed one bank cloud (it thickens and stays young)
// instead of each adding its own: the same haze from far fewer, cheaper puffs.
function addBank(x,y,seed){
 const near=state.bank.find(p=>state.time-p.born<6&&Math.abs(p.x-x)<BANK_MERGE&&Math.abs(p.y-y)<BANK_MERGE);
 if(near){near.weight=Math.min(4,(near.weight||1)+0.35);near.born=Math.max(near.born,state.time-2);return;}
 if(state.bank.length>=BANK_MAX)state.bank.shift();
 state.bank.push({x,y,born:state.time,seed,weight:1});
}
function drawSmokeBank(){
 const t=state.time;
 state.bank=state.bank.filter(p=>t-p.born<BANK_LIFE);
 for(const p of state.bank){
   const age=t-p.born,f=age/BANK_LIFE,r=24+age*4.2;
   const x=p.x+age*3.2+Math.sin(age*.15+p.seed*9)*6,y=p.y-14-age*1.1;
   const a=0.075*(age<1.5?age/1.5:1)*(1-f);
   ctx.globalAlpha=Math.min(0.6,a*(p.weight||1));ctx.drawImage(puff('bank'),x-r,y-r*.62,r*2,r*1.24);
 }
 ctx.globalAlpha=1;
}

function drawSmoke(){
 const t=state.time;
 state.smoke=state.smoke.filter(p=>t-p.born<p.life);
 for(const p of state.smoke){
   const age=t-p.born,f=age/p.life,r=(6+age*13)*p.size;
   const x=p.x+age*9+Math.sin(age*.9+p.seed*6)*3,y=p.y-age*7-10*f;
   const a=(1-f)*(age<.12?age/.12:1);
   // Earth thrown up by a grazing ball is brown; powder smoke is off-white.
   ctx.globalAlpha=a;ctx.drawImage(puff(p.dust?'dust':'smoke'),x-r,y-r*.82,r*2,r*1.64);
 }
 ctx.globalAlpha=1;
}

function drawSprite(atlas,anim,f,x,y,k){
 // A missing animation or frame is counted (tests expect none) instead of drawn.
 const src=atlas.byAnim.get(anim),name=src&&src.sheet.animations[anim]?.[f];
 if(!name){state.missing=(state.missing||0)+1;return;}
 const fr=src.sheet.frames[name].frame,p=src.sheet.meta.pivot,s=src.scale||1;
 ctx.drawImage(src.image,fr.x*s,fr.y*s,fr.w*s,fr.h*s,x-p.x*k,y-p.y*k,fr.w*k,fr.h*k);
}

function draw(now){
 const dt=Math.min(now-state.last,60)/1000;state.last=now;
 if(!state.paused){state.time+=dt;if(!state.halted)state.travelled+=SPEED*dt;}
 state.frames++;
 if(now-state.frameClock>=750){state.fps=Math.round(state.frames*1000/(now-state.frameClock));state.frames=0;state.frameClock=now;}
 const dpr=canvas.width/Math.max(1,view.clientWidth),z=state.zoom;
 followCamera();
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#5d6b45';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.setTransform(dpr*z,0,0,dpr*z,dpr*(view.clientWidth/2-state.camX*z),dpr*(view.clientHeight/2-state.camY*z));
 if(state.terrain){const t=state.terrain,w=t.image.naturalWidth*t.scale,h=t.image.naturalHeight*t.scale;ctx.drawImage(t.image,-w/2,-h/2,w,h);}
 else if(state.ground)ctx.drawImage(state.ground.canvas,-state.ground.w/2,-state.ground.h/2);
 const k=S/SPRITE_PX_PER_M;
 // Soldiers and props share one painter's order by their ground point.
 const alive=units();
 updateBalls();resolveHits(alive);beatDrums();
 const fallen=[...state.dead.values()].map(d=>{
   const p=crawled(d);return{...d,fallen:true,...project(d.gx+p.x,d.gy+p.y)};});
 const battery=(state.batteries||[]).flatMap(g=>[g,...g.crew]).map(u=>({...u,...project(u.gx,u.gy)}));
 const horse=(state.squadrons||[]).flatMap(sq=>liveRiders(sq)).map(u=>({...u,...project(u.gx,u.gy)}))
   .concat(state.deadRiders.map(d=>({...d,deadRider:true,...project(d.gx,d.gy)})));
 drawSelection();
 const list=alive.filter(u=>!u.dead).map(u=>({...u,...project(u.gx,u.gy)})).concat(battery,horse,fallen,state.props).sort((a,b)=>a.y-b.y);
 state.animStates={};state.crewStates={};state.cavStates={};state.ridersDrawn=0;
 state.drawn=0;state.propsDrawn=0;state.rolesDrawn=0;state.gunsDrawn=0;state.crewDrawn=0;
 for(const u of list){
   if(u.sprite){const p=u.sprite;ctx.drawImage(p.image,u.x-p.pivot.x*k,u.y-p.pivot.y*k,p.w*k,p.h*k);state.propsDrawn++;continue;}
   if(u.gun){
     const a=state.atlases[u.prefix+'g'];if(!a)continue;
     const [an,f]=gunFrame(u).split('|');drawSprite(a,an,Number(f),u.x,u.y,k);state.gunsDrawn++;continue;
   }
   if(u.rider||u.deadRider){
     const a=state.atlases[u.look]||state.atlases[u.prefix+'c'];if(!a)continue;
     const [an,f]=u.deadRider?['die_'+DIRS[u.dir],Math.min(3,Math.floor((state.time-u.t0)/SQUAD.dieFrame))]:riderFrame(u).split('|');
     drawSprite(a,an,Number(f),u.x,u.y,k);
     const st=an.split('_')[0];state.cavStates[st]=(state.cavStates[st]||0)+1;if(u.rider)state.ridersDrawn++;continue;
   }
   if(u.gunner){
     const a=state.atlases[u.prefix+'a'];if(!a)continue;
     const [an,f]=crewFrame(u).split('|');drawSprite(a,an,Number(f),u.x,u.y,k);state.crewDrawn++;
     const st=an.split('_')[0];state.crewStates[st]=(state.crewStates[st]||0)+1;continue;
   }
   const atlas=state.atlases[u.look]||state.atlases[u.prefix];if(!atlas)continue;
   if(u.fallen){
     // The fall plays once; the last frame stays on the field. The wounded
     // then crawl a few metres to the rear before they lie still.
     const age=Math.max(0,state.time-u.t0),crawl=u.wounded?age-4*DIE_FRAME:-1;
     if(crawl>=0){
       const f=crawl<CRAWL.time?Math.floor(crawl/CRAWL.frameS)%4:0;
       drawSprite(atlas,'crawl_'+DIRS[u.dir],f,u.x,u.y,k);
       state.animStates.crawl=(state.animStates.crawl||0)+1;continue;
     }
     drawSprite(atlas,u.fall+'_'+DIRS[u.dir],Math.min(3,Math.floor(age/DIE_FRAME)),u.x,u.y,k);
     state.animStates.die=(state.animStates.die||0)+1;continue;
   }
   const [anim,f]=frameFor(u).split('|');
   drawSprite(atlas,anim,Number(f),u.x,u.y,k);
   if(u.role){state.rolesDrawn++;continue;}
   (state.lookSet||(state.lookSet=new Set())).add(u.look);state.looksDrawn=state.lookSet.size;
   const st=anim.split('_')[0];state.animStates[st]=(state.animStates[st]||0)+1;
   state.directionsSeen.add(u.dir);state.drawn++;
 }
 drawBalls();
 drawFlags();
 drawSmoke();
 drawSmokeBank();
 drawCompass(dpr);
 drawMinimap(dpr);
 drawBox(dpr);
 requestAnimationFrame(draw);
}

// Screen-space strip: the French soldier in all 8 directions, for review.
function drawCompass(dpr){
 const a=state.atlases.fr;if(!a)return;
 const w=view.clientWidth,size=Math.min(64,(w-24)/8),cell=a.sheet.meta.cell.h;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='rgba(20,24,22,.62)';ctx.fillRect(8,8,size*8+8,size*.95+8);
 // Cycles the full drill so every state can be reviewed in all directions.
 const drill=[['march',6,110],['aim',2,260],['fire',3,140],['reload',4,425],['kaim',2,260],['kfire',3,140],['misfire',3,200],
   ['charge',6,100],['thrust',3,200],['rout',6,100],['crawl',4,320],['cheer',2,350],['look',4,450],['adjust',4,380],['lean',2,900],
   ['die',4,300],['diefwd',4,300],['dieside',4,300]];
 const total=drill.reduce((s,[,n,ms])=>s+n*ms,0);let t=(state.time*1000)%total,anim='march',f=0;
 for(const [name,n,ms] of drill){if(t<n*ms){anim=name;f=Math.floor(t/ms);break;}t-=n*ms;}
 DIRS.forEach((d,i)=>drawSprite(a,anim+'_'+d,f,12+size*(i+.5),12+size*.85,size/cell));
}

// Minimap (bottom right): the whole terrain, every soldier, gun and rider as a
// dot, and the part of the field in view. Click or tap it to look there.
function drawMinimap(dpr){
 const t=state.terrain;if(!t||!state.regiments){state.minimapRect=null;return;}
 const vw=view.clientWidth,vh=view.clientHeight,w=Math.min(200,vw*0.32),h=w/2,x=vw-w-10,y=vh-h-10,half=t.half;
 state.minimapRect={x,y,w,h};
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='rgba(20,24,22,.72)';ctx.fillRect(x-4,y-4,w+8,h+8);
 // The terrain thumbnail is scaled once and cached, not every frame.
 if(!state.miniTerrain||state.miniTerrain.width!==Math.round(w*dpr)){
   const c=document.createElement('canvas');c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
   c.getContext('2d').drawImage(t.image,0,0,c.width,c.height);state.miniTerrain=c;
 }
 ctx.drawImage(state.miniTerrain,x,y,w,h);
 const dot=(gx,gy,size,color)=>{ctx.fillStyle=color;ctx.fillRect(x+(gx/(2*half)+0.5)*w-size/2,y+(-gy/(2*half)+0.5)*h-size/2,size,size);};
 state.regiments.forEach((reg,i)=>{for(const m of aliveMen(reg))dot(m.gx,m.gy,2,i?'#d0362e':'#2f55c8');});
 for(const g of state.batteries||[])dot(g.gx,g.gy,3.5,'#1c1c1c');
 (state.squadrons||[]).forEach((sq,i)=>{for(const m of liveRiders(sq))dot(m.gx,m.gy,3,i?'#f08070':'#7fa0ff');});
 // The visible part of the field.
 const sw=vw/state.zoom,sh=vh/state.zoom,u=sx=>x+(sx/(2*half*S)+0.5)*w,v=sy=>y+(sy/(half*S)+0.5)*h;
 ctx.strokeStyle='rgba(255,246,214,.9)';ctx.lineWidth=1.2;
 ctx.strokeRect(u(state.camX-sw/2),v(state.camY-sh/2),u(state.camX+sw/2)-u(state.camX-sw/2),v(state.camY+sh/2)-v(state.camY-sh/2));
}
function minimapHit(e){
 const mm=state.minimapRect;if(!mm)return false;
 const r=view.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
 if(px<mm.x||px>mm.x+mm.w||py<mm.y||py>mm.y+mm.h)return false;
 const half=state.terrain.half;
 state.camX=((px-mm.x)/mm.w-0.5)*2*half*S;state.camY=((py-mm.y)/mm.h-0.5)*half*S;
 setFollow(0);return true;
}
// Camera follow: off, the French regiment, the British regiment, the French squadron.
const FOLLOW=[[null,'uit'],['fr','Frans regiment'],['br','Brits regiment'],['cav','Franse ruiters']];
function setFollow(i){state.follow=i;ui.follow.textContent='🎥 Volg: '+FOLLOW[i][1];ui.follow.setAttribute('aria-pressed',String(i>0));}
function followCamera(){
 const key=FOLLOW[state.follow||0][0];if(!key||!state.regiments)return;
 const c=key==='cav'?centreOf({men:state.squadrons?liveRiders(state.squadrons[0]):[]}):centreOf(state.regiments[key==='fr'?0:1]);
 const p=project(c.x,c.y);
 state.camX+=(p.x-state.camX)*0.12;state.camY+=(p.y-state.camY)*0.12;
}

// v339 command: regiments, batteries and squadrons can be selected and ordered.
const GROUPS=[['fr','regiment',0,'Frans regiment'],['br','regiment',1,'Brits regiment'],['frbat','battery',0,'Franse batterij'],
 ['brbat','battery',1,'Britse batterij'],['frcav','squadron',0,'Franse ruiters'],['brcav','squadron',1,'Britse ruiters']]
 .map(([id,kind,side,name])=>({id,kind,side,name}));
const GROUP=Object.fromEntries(GROUPS.map(g=>[g.id,g]));
state.selected=new Set();state.flags=[];state.orders=0;state.box=null;state.boxMode=false;
function groupMembers(id){
 const g=GROUP[id];if(!state.regiments)return[];
 const reg=state.regiments[g.side];
 if(g.kind==='regiment')return[...aliveMen(reg),...reg.staff.filter(s=>!s.gone)];
 if(g.kind==='battery')return(state.batteries||[]).filter(b=>b.prefix===reg.prefix).flatMap(b=>[b,...b.crew]);
 return state.squadrons?liveRiders(state.squadrons[g.side]):[];
}
// Height above the feet (screen px) where a body is clicked.
const bodyLift=m=>m.rider?26:m.gun?8:15;
const groundAt=w=>({x:w.x/S,y:-w.y/(SQUASH*S)});
function hitGroup(w){
 let best=null,bestD=Math.max(12,20/state.zoom);
 for(const g of GROUPS)for(const m of groupMembers(g.id)){
   const p=project(m.gx,m.gy),d=Math.hypot(w.x-p.x,w.y-(p.y-bodyLift(m)));
   if(d<bestD){best=g.id;bestD=d;}
 }
 return best;
}
function select(ids,add){
 if(!add)state.selected.clear();
 for(const id of ids)state.selected.add(id);
 refreshOrders();
}
const enemyCentre=side=>centreOf(state.regiments[1-side]);
// Ground frame facing from p towards q: n forward, t to the left.
function facing(p,q,fallback){
 let nx=q.x-p.x,ny=q.y-p.y,l=Math.hypot(nx,ny);
 if(l<0.5&&fallback){nx=fallback.x-p.x;ny=fallback.y-p.y;l=Math.hypot(nx,ny);}
 l=l||1;nx/=l;ny/=l;return{nx,ny,tx:-ny,ty:nx,dir:dirIndex(nx,ny)};
}
function moveGroup(id,P){
 const g=GROUP[id],reg=state.regiments[g.side];
 if(g.kind==='regiment'){
   if(state.charge)return false;
   const form=reg.cmd?reg.cmd.form:reg.formation==='line'?'line':'column';
   reg.cmd={form,face:P,dest:P,fire:false};
   if(form==='line')formLine(reg,P);else formFreeColumn(reg,P);
 }else if(g.kind==='battery'){
   // Unlimbered facing the enemy from the new spot.
   reg.batCmd={x:P.x,y:P.y,...facing(P,enemyCentre(g.side))};
 }else{
   const sq=state.squadrons[g.side];
   if(g.side===0&&state.cavCharge)return false;
   if(g.side===1&&state.cavCounter)return false;
   sq.cmd={x:P.x,y:P.y,...facing(centreOf({men:liveRiders(sq)}),P,enemyCentre(g.side))};
 }
 return true;
}
function orderMove(dest){
 const ids=[...state.selected];if(!ids.length||!state.regiments)return;
 const lim=GROUND*0.8;dest={x:Math.max(-lim,Math.min(lim,dest.x)),y:Math.max(-lim,Math.min(lim,dest.y))};
 // Several groups keep their places relative to each other round the flag.
 const cs=ids.map(id=>centreOf({men:groupMembers(id)}));
 const mx=cs.reduce((a,c)=>a+c.x,0)/cs.length,my=cs.reduce((a,c)=>a+c.y,0)/cs.length;
 const moved=ids.filter((id,j)=>moveGroup(id,{x:dest.x+cs[j].x-mx,y:dest.y+cs[j].y-my}));
 if(!moved.length)return;
 state.flags.push({x:dest.x,y:dest.y,born:state.time,ids:moved,side:GROUP[moved[0]].side});
 state.orders++;refreshOrders();
}
function orderForm(form){
 for(const id of state.selected){
   const g=GROUP[id];if(g.kind!=='regiment'||state.charge)continue;
   const reg=state.regiments[g.side],face=reg.cmd&&reg.cmd.dest||enemyCentre(g.side);
   reg.cmd={form,face,dest:reg.cmd?reg.cmd.dest:null,fire:false};
   if(form==='line')formLine(reg,face);else formFreeColumn(reg,face);
   state.orders++;
 }
 refreshOrders();
}
function orderFire(){
 const on=!selectedFiring();
 for(const id of state.selected){
   const g=GROUP[id],reg=state.regiments[g.side];
   if(g.kind==='regiment'&&!state.charge){
     // Halt, face the enemy in line and open fire.
     reg.cmd={form:'line',face:enemyCentre(g.side),dest:null,fire:on};
     if(on)formLine(reg,reg.cmd.face);
   }else if(g.kind==='battery')reg.batFire=on;
   else continue;
   state.orders++;
 }
 refreshOrders();
}
function selectedFiring(){
 return [...state.selected].some(id=>{const g=GROUP[id],reg=state.regiments&&state.regiments[g.side];
   return reg&&(g.kind==='regiment'?!!(reg.cmd&&reg.cmd.fire):g.kind==='battery'&&!!reg.batFire);});
}
// Bayonets for the first selected regiment, and the French squadron goes in too if chosen.
function orderCharge(){
 const ids=[...state.selected],reg=ids.find(id=>GROUP[id].kind==='regiment');
 if(reg&&!state.charge){setCharge(GROUP[reg].side);state.orders++;}
 if(ids.includes('frcav')&&!state.cavCharge){setCavCharge();state.orders++;}
 refreshOrders();
}
function clearOrders(){
 if(!state.regiments)return;
 state.regiments.forEach(reg=>{reg.cmd=null;reg.batCmd=null;reg.batFire=false;});
 (state.squadrons||[]).forEach(sq=>{sq.cmd=null;});
 state.flags=[];
}
// The order bar shows what the selection can do.
const orders={bar:document.getElementById('iso-orders'),label:document.getElementById('iso-sel'),box:document.getElementById('iso-box'),
 line:document.getElementById('iso-o-line'),column:document.getElementById('iso-o-column'),fire:document.getElementById('iso-o-fire'),
 charge:document.getElementById('iso-o-charge'),clear:document.getElementById('iso-o-clear')};
function refreshOrders(){
 const ids=[...state.selected],kinds=new Set(ids.map(id=>GROUP[id].kind));
 orders.bar.dataset.empty=String(!ids.length);
 orders.label.textContent=ids.length?ids.map(id=>GROUP[id].name).join(' + '):'Tik een eenheid aan';
 orders.line.disabled=orders.column.disabled=!kinds.has('regiment')||!!state.charge;
 orders.fire.disabled=!kinds.has('regiment')&&!kinds.has('battery');
 orders.fire.textContent=selectedFiring()?'✋ Staakt vuren':'🔥 Vuren';
 orders.charge.disabled=!(kinds.has('regiment')&&!state.charge)&&!(ids.includes('frcav')&&!state.cavCharge);
 for(const b of [orders.line,orders.column,orders.fire,orders.charge,orders.clear])b.hidden=!ids.length;
}
orders.line.addEventListener('click',()=>orderForm('line'));
orders.column.addEventListener('click',()=>orderForm('column'));
orders.fire.addEventListener('click',orderFire);
orders.charge.addEventListener('click',orderCharge);
orders.clear.addEventListener('click',()=>select([],false));
orders.box.addEventListener('click',()=>{state.boxMode=!state.boxMode;orders.box.setAttribute('aria-pressed',String(state.boxMode));});
addEventListener('keydown',e=>{if(e.key==='Escape'){select([],false);state.box=null;}});

// Selection circles under the feet of every selected man, gun and horse.
function drawSelection(){
 if(!state.selected.size)return;
 ctx.lineWidth=1.5/state.zoom;
 for(const id of state.selected){
   ctx.strokeStyle=GROUP[id].side?'rgba(255,190,170,.95)':'rgba(255,236,150,.95)';
   ctx.beginPath();
   for(const m of groupMembers(id)){
     const p=project(m.gx,m.gy),rx=(m.rider?1.3:m.gun?1.4:0.5)*S;
     ctx.moveTo(p.x+rx,p.y);ctx.ellipse(p.x,p.y,rx,rx*SQUASH,0,0,Math.PI*2);
   }
   ctx.stroke();
 }
}
// A small flag marks where an order sends the selection; it goes once they are there.
function drawFlags(){
 state.flags=state.flags.filter(f=>{
   if(state.time-f.born>ORDER.flagLife)return false;
   const c=centreOf({men:f.ids.map(id=>{const k=centreOf({men:groupMembers(id)});return{gx:k.x,gy:k.y};})});
   return Math.hypot(c.x-f.x,c.y-f.y)>2.5||state.time-f.born<0.6;
 });
 for(const f of state.flags){
   const p=project(f.x,f.y),wave=Math.sin((state.time-f.born)*6)*2;
   ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(p.x,p.y,6,3,0,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#2b2118';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-30);ctx.stroke();
   ctx.fillStyle=f.side?'#c8322a':'#2c4fb8';ctx.beginPath();ctx.moveTo(p.x,p.y-30);ctx.lineTo(p.x+15,p.y-25+wave);ctx.lineTo(p.x,p.y-19);ctx.fill();
 }
}
function drawBox(dpr){
 const b=state.box;if(!b)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 const x=Math.min(b.x0,b.x1),y=Math.min(b.y0,b.y1),w=Math.abs(b.x1-b.x0),h=Math.abs(b.y1-b.y0);
 ctx.fillStyle='rgba(255,236,150,.12)';ctx.fillRect(x,y,w,h);
 ctx.strokeStyle='rgba(255,236,150,.9)';ctx.lineWidth=1.2;ctx.strokeRect(x,y,w,h);
}
function boxSelect(b,add){
 const a=toWorld(Math.min(b.x0,b.x1),Math.min(b.y0,b.y1)),c=toWorld(Math.max(b.x0,b.x1),Math.max(b.y0,b.y1));
 const ids=GROUPS.filter(g=>groupMembers(g.id).some(m=>{const p=project(m.gx,m.gy);return p.x>=a.x&&p.x<=c.x&&p.y>=a.y&&p.y<=c.y;})).map(g=>g.id);
 select(ids,add);
}
// Screen point (client px) of a group's member nearest its centre, for tests.
function groupScreen(id){
 const men=groupMembers(id);if(!men.length)return null;
 const c=centreOf({men}),m=men.reduce((b,u)=>Math.hypot(u.gx-c.x,u.gy-c.y)<Math.hypot(b.gx-c.x,b.gy-c.y)?u:b);
 const p=project(m.gx,m.gy),r=view.getBoundingClientRect();
 return{x:r.left+(p.x-state.camX)*state.zoom+r.width/2,y:r.top+(p.y-bodyLift(m)-state.camY)*state.zoom+r.height/2};
}
function screenOfGround(gx,gy){
 const p=project(gx,gy),r=view.getBoundingClientRect();
 return{x:r.left+(p.x-state.camX)*state.zoom+r.width/2,y:r.top+(p.y-state.camY)*state.zoom+r.height/2};
}

// One pointer: tap selects or orders, drag pans (or draws a selection box with
// Shift or ▢ Kader); two pointers pinch; wheel zooms round the cursor.
const pointers=new Map();let pinch=null,press=null;
const toWorld=(x,y)=>({x:(x-view.clientWidth/2)/state.zoom+state.camX,y:(y-view.clientHeight/2)/state.zoom+state.camY});
const local=e=>{const r=view.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
view.addEventListener('contextmenu',e=>e.preventDefault());
view.addEventListener('pointerdown',e=>{if(e.target.closest('#iso-orders')||minimapHit(e))return;view.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 press=pointers.size===1?{x:e.clientX,y:e.clientY,moved:false,box:e.shiftKey||state.boxMode,shift:e.shiftKey,right:e.button===2}:null;
 if(!press)state.box=null;
 if(pointers.size===2){const[a,b]=[...pointers.values()],r=view.getBoundingClientRect();
   pinch={dist:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.zoom,anchor:toWorld((a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top)};}});
view.addEventListener('pointermove',e=>{const p=pointers.get(e.pointerId);if(!p)return;
 const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
 if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>ORDER.tapPx)press.moved=true;
 if(press&&press.box){if(press.moved){const r=view.getBoundingClientRect(),l=local(e);state.box={x0:press.x-r.left,y0:press.y-r.top,x1:l.x,y1:l.y};}return;}
 if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],r=view.getBoundingClientRect();
   state.zoom=Math.min(3,Math.max(.35,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(10,pinch.dist)));
   const cx=(a.x+b.x)/2-r.left,cy=(a.y+b.y)/2-r.top;
   state.camX=pinch.anchor.x-(cx-r.width/2)/state.zoom;state.camY=pinch.anchor.y-(cy-r.height/2)/state.zoom;state.customZoom=true;}
 else if(pointers.size===1&&!pinch){state.camX-=dx/state.zoom;state.camY-=dy/state.zoom;if(state.follow)setFollow(0);}});
function tap(e,pr){
 const l=local(e),w=toWorld(l.x,l.y);
 if(pr.right){orderMove(groundAt(w));return;}
 const hit=hitGroup(w);
 if(hit){
   if(pr.shift&&state.selected.has(hit)){state.selected.delete(hit);refreshOrders();}
   else select([hit],pr.shift);
 }else if(state.selected.size)orderMove(groundAt(w));
}
const up=e=>{
 const pr=pointers.size===1&&pointers.has(e.pointerId)?press:null;
 pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;
 if(pointers.size===0)press=null;
 if(!pr||e.type==='pointercancel'){state.box=null;return;}
 if(pr.box&&pr.moved&&state.box){boxSelect(state.box,pr.shift);state.box=null;
   if(state.boxMode){state.boxMode=false;orders.box.setAttribute('aria-pressed','false');}return;}
 if(!pr.moved)tap(e,pr);
};
view.addEventListener('pointerup',up);view.addEventListener('pointercancel',up);
view.addEventListener('wheel',e=>{e.preventDefault();const r=view.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,a=toWorld(x,y);
 state.zoom=Math.min(3,Math.max(.35,state.zoom*Math.exp(-e.deltaY*.001)));
 state.camX=a.x-(x-r.width/2)/state.zoom;state.camY=a.y-(y-r.height/2)/state.zoom;state.customZoom=true;},{passive:false});
function setHalt(h){state.halted=h;if(!h){setFire(false);clearOrders();state.charge=null;ui.charge.disabled=false;state.cavCharge=null;ui.cav.disabled=false;}ui.halt.textContent=h?'▶ Voorwaarts mars':'✋ Halt';}
// Offset of a wounded man who has crawled toward his own rear (his sprite direction).
function crawled(d){
 if(!d.wounded)return{x:0,y:0};
 const m=Math.max(0,Math.min(CRAWL.time,state.time-d.t0-4*DIE_FRAME))*CRAWL.speed,v=groundVec(d.dir);
 return{x:v.x*m,y:v.y*m};
}
function setCharge(attacker=0){
 if(state.charge)return;
 setFire(false);if(!state.halted)setHalt(true);
 // Ordered regiments stop where they are and face each other first.
 (state.regiments||[]).forEach((reg,i)=>{if(reg.cmd){reg.cmd.dest=null;reg.cmd.fire=false;formLine(reg,enemyCentre(i));}});
 state.charge={phase:'form',at:state.time,attacker,loser:null,strikes:0};
 ui.charge.disabled=true;refreshOrders();
}
// Cavalerie!: trumpet, "Chargez!", and the French squadron goes in.
function setCavCharge(){
 if(state.cavCharge||!state.squadrons)return;
 if(!state.halted)setHalt(true);
 state.cavCharge={phase:'walk',at:state.time,count:(state.cavCount=(state.cavCount||0)+1),aim:null};
 ui.cav.disabled=true;
 if(audio){const sq=liveRiders(state.squadrons[0]),p=sq.length?project(sq[0].gx,sq[0].gy):{x:0,y:0};
   audio.trumpet(ear(p.x,p.y)[0]);audio.say('Chargez!','fr-FR');}
}
function setFire(f){
 if(f&&state.charge)return;
 state.firing=f;if(f&&!state.halted)setHalt(true);
 if(f)state.fireStart=state.time;
 ui.fire.textContent=f?'✋ Staakt het vuren':'🔥 Vuur!';
}
function resetBattle(){
 state.charge=null;ui.charge.disabled=false;
 state.dead.clear();state.hits=[];state.smoke=[];state.bank=[];state.drill=new Map();state.misfires=0;
 state.shots=0;state.volleys=0;state.regiments=null;state.shooters=null;
 state.batteries=null;state.balls=[];state.cannonShots=0;state.ballHits=0;
 state.squadrons=null;state.cavCharge=null;state.deadRiders=[];state.riderFalls=0;state.sabreHits=0;ui.cav.disabled=false;
 state.cavCounter=null;state.squareShots=0;state.clashes=0;
 state.selected.clear();state.flags=[];state.box=null;refreshOrders();
 if(state.controller)state.controller.reset();
}
ui.reset.addEventListener('click',()=>{setFire(false);resetBattle();});
ui.halt.addEventListener('click',()=>setHalt(!state.halted));
ui.fire.addEventListener('click',()=>setFire(!state.firing));
ui.charge.addEventListener('click',()=>setCharge(0));
ui.cav.addEventListener('click',setCavCharge);
ui.follow.addEventListener('click',()=>setFollow(((state.follow||0)+1)%FOLLOW.length));
// The explanation stays out of the way (it covered the scene on phones); this button shows it.
const info=document.getElementById('iso-info'),infoToggle=document.getElementById('iso-info-toggle');
infoToggle.addEventListener('click',()=>{info.hidden=!info.hidden;infoToggle.setAttribute('aria-pressed',String(!info.hidden));});
ui.sound.addEventListener('click',()=>{
 if(!audio)return;
 const on=audio.setOn(!audio.isOn());
 ui.sound.textContent=on?'🔊 Geluid aan':'🔇 Geluid uit';ui.sound.setAttribute('aria-pressed',String(on));
});
ui.pause.addEventListener('click',()=>{state.paused=!state.paused;ui.pause.textContent=state.paused?'▶ Hervatten':'⏸ Pauzeren';});
ui.center.addEventListener('click',()=>{state.camX=state.camY=0;state.customZoom=false;resize();});
ui.count.addEventListener('change',()=>{state.perSide=Number(ui.count.value);resetBattle();});
addEventListener('resize',resize);

window.__GRAPHICS_LAB_ISO__={version:'339.0',state,groupScreen,screenOfGround,
 getStats:()=>({missing:state.missing||0,loaded:Object.keys(state.atlases).length,looks:state.looksDrawn||0,roles:state.rolesDrawn||0,units:state.perSide*2,drawn:state.drawn,fps:state.fps,
   terrain:!!state.terrain,props:state.props.length,propsDrawn:state.propsDrawn||0,
   zoom:state.zoom,halted:state.halted,firing:state.firing,directionsSeen:state.directionsSeen.size,perimeter,
   animStates:{...(state.animStates||{})},smoke:state.smoke.length,volleys:state.volleys,shots:state.shots,
   fallen:{fr:[...state.dead.keys()].filter(k=>k.startsWith('fr')).length,br:[...state.dead.keys()].filter(k=>k.startsWith('br')).length},
   bands:state.regiments?Math.max(...state.regiments.map(r=>r.formation==='line'?r.line.ranks:0)):0,
   formations:state.regiments?state.regiments.map(r=>r.formation):[],
   deployed:state.regiments?state.regiments.filter(r=>r.readyAt!==null).length:0,
   shooters:state.shooters?state.shooters.size:0,misfires:state.misfires,bank:state.bank.length,
   kneeling:state.animStates?(state.animStates.kaim||0)+(state.animStates.kfire||0):0,
   sound:audio?audio.stats():null,
   guns:state.batteries?state.batteries.length:0,gunsDrawn:state.gunsDrawn||0,crewDrawn:state.crewDrawn||0,
   crewStates:{...(state.crewStates||{})},cannonShots:state.cannonShots,balls:state.balls.length,ballHits:state.ballHits,
   riders:state.squadrons?state.squadrons.reduce((n,sq)=>n+liveRiders(sq).length,0):0,ridersDrawn:state.ridersDrawn||0,
   cavStates:{...(state.cavStates||{})},cavCharge:state.cavCharge?state.cavCharge.phase:null,
   riderFalls:state.riderFalls,sabreHits:state.sabreHits,
   minimap:!!state.minimapRect,follow:FOLLOW[state.follow||0][0],cam:{x:state.camX,y:state.camY},half:state.terrain?state.terrain.half:0,
   cavCounter:state.cavCounter?state.cavCounter.phase:null,squareShots:state.squareShots,clashes:state.clashes,
   recoiled:state.batteries?state.batteries.filter(g=>g.recoil>0.5).length:0,
   charge:state.charge?state.charge.phase:null,loser:state.charge&&state.charge.loser!==null?['fr','br'][state.charge.loser]:null,
   gone:state.regiments?state.regiments.reduce((n,r)=>n+r.men.filter(m=>m.gone).length,0):0,
   wounded:[...state.dead.values()].filter(d=>d.wounded).length,
   frontGaps:state.regiments?state.regiments.reduce((n,r)=>n+frontGaps(r),0):0,
   fallKinds:[...new Set([...state.dead.values()].map(d=>d.fall))].sort(),
   selected:[...state.selected],orders:state.orders,flags:state.flags.length,box:!!state.box,
   commands:state.regiments?state.regiments.map(r=>r.cmd?{form:r.cmd.form,fire:!!r.cmd.fire,moving:!!r.cmd.dest}:null):[],
   centres:state.regiments?state.regiments.map(centreOf):[],
   batteryFire:state.regiments?state.regiments.map(r=>!!r.batFire):[],batteryAt:state.regiments?state.regiments.map(r=>r.batCmd?{x:r.batCmd.x,y:r.batCmd.y}:null):[],
   squadronAt:state.squadrons?state.squadrons.map(sq=>sq.cmd?{x:sq.cmd.x,y:sq.cmd.y}:null):[],
   muzzleEvents:state.controller?state.controller.metrics().muzzleEvents:0})};

paintGround();resize();
const loadController=()=>loadJson('./assets/sprites/unit-animation-config.json').then(cfg=>{
 state.controller=NRTSInfantryAnimation.createInfantryAnimationController(cfg);});
const ALL_LOOKS=['','2','3','4','5'];
const ATLAS_KEYS=['fr','br'].flatMap(p=>ALL_LOOKS.map(l=>p+l));
// Officer, drummer and ensign atlases: idle, march and command in taller cells.
const ROLE_KEYS={officer:'o',drummer:'d',ensign:'e'};
const ROLE_ATLASES=['fr','br'].flatMap(p=>Object.entries(ROLE_KEYS).map(([role,k])=>[p+k,role]));
const loadRole=([key,role])=>loadSheet(key,role,['idle','march','command']).then(sheet=>indexAtlas([sheet]));
// Base looks and staff first so the scene starts quickly; the other looks
// stream in afterwards (soldiers use the base look until theirs has arrived).
const firstKeys=['fr','br'];
// Cavalry: two coat colours per nation, a riding and a fighting sheet each.
const CAV_KEYS=['frc','frc2','frco','frct','brc','brc2','brco','brct'];
const loadCav=key=>Promise.all([loadSheet(key,'cavalry',['idle','walk','trot']),
 loadSheet(key,'cavfight',['gallop','slash','rear','die'])]).then(indexAtlas);
// Batteries: one gun atlas and two gunner sheets per nation, streamed in with the extra looks.
const loadGun=p=>loadSheet(p+'g','gun',['idle','fire','roll']).then(s=>{
 if(!s.sheet.meta.muzzle)throw new Error(p+': kanon zonder mondingspunten');return indexAtlas([s]);});
const loadCrew=p=>Promise.all([loadSheet(p+'a','gunner',['idle','ram','load','aim','ready','touch','haul']),
 loadSheet(p+'a','gunner2',['march','die','diefwd','dieside'])]).then(indexAtlas);
Promise.all([Promise.all([...firstKeys.map(loadAtlas),...ROLE_ATLASES.map(loadRole)]),loadController(),loadScene().catch(err=>{console.warn('Iso terrein/gebouwen fallback:',err);})]).then(([atlases])=>{
 [...firstKeys,...ROLE_ATLASES.map(([key])=>key)].forEach((key,i)=>{state.atlases[key]=atlases[i];});
 ui.status.textContent=state.terrain?'Blender-scène geladen · soldaten, gebouwen en terrein':'Blender-soldaten geladen · eenvoudig terrein';
 return Promise.all([...ATLAS_KEYS.filter(k=>!firstKeys.includes(k)).map(key=>loadAtlas(key).then(a=>{state.atlases[key]=a;})),
   ...['fr','br'].flatMap(p=>[loadGun(p).then(a=>{state.atlases[p+'g']=a;}),loadCrew(p).then(a=>{state.atlases[p+'a']=a;})]),
   ...CAV_KEYS.map(key=>loadCav(key).then(a=>{state.atlases[key]=a;}))]);
}).catch(err=>{
 ui.status.textContent='Atlassen konden niet laden.';console.error(err);
});
requestAnimationFrame(draw);
})();
