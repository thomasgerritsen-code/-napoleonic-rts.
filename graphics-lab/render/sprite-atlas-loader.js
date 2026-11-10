// Graphics Lab v321 — infantry atlas loader + Canvas renderer (PR D1).
// Validates config and Pixi spritesheet JSON before use and exposes only
// getFrame(side,state,index). Missing atlases reject; the lab then keeps the
// legacy SVG soldiers instead of drawing placeholders.
(function(root){
'use strict';
const SIDES={france:{prefix:'fr',dir:'france'},britain:{prefix:'br',dir:'britain'}};

function validateSheet(sheet,side,config,names){
 const fw=config.frameWidth,fh=config.frameHeight;
 if(!sheet||!sheet.frames||!sheet.animations||!sheet.meta)throw new Error(side+': onvolledige atlas-JSON');
 const size=sheet.meta.size||{};
 if(size.w!==fw*config.atlasColumns||size.h!==fh*config.atlasRows)throw new Error(side+': onverwachte atlasmaat');
 let index=0;
 for(const state of Object.keys(names)){
   const listed=sheet.animations[state];
   if(!Array.isArray(listed)||listed.join()!==names[state].join())throw new Error(side+': animatie '+state+' wijkt af');
   for(const name of names[state]){
     const f=sheet.frames[name]&&sheet.frames[name].frame;
     const col=index%config.atlasColumns,row=Math.floor(index/config.atlasColumns);
     if(!f||f.x!==col*fw||f.y!==row*fh||f.w!==fw||f.h!==fh)throw new Error(side+': frame '+name+' heeft een onjuiste cel');
     index++;
   }
 }
 return sheet;
}

function loadImage(src){
 return new Promise((resolve,reject)=>{
   const im=new Image();
   im.onload=()=>resolve(im);
   im.onerror=()=>reject(new Error('atlasafbeelding ontbreekt: '+src));
   im.src=src;
 });
}

async function loadInfantryAtlases(base,config,frameNames){
 const fetchJson=async url=>{
   const r=await fetch(url,{cache:'no-cache'});
   if(!r.ok)throw new Error('atlas-JSON ontbreekt: '+url);
   return r.json();
 };
 const sides={};
 // Both nations load in parallel; one failure rejects the whole atlas mode.
 await Promise.all(Object.entries(SIDES).map(async([side,info])=>{
   const folder=base+'infantry/'+info.dir+'/';
   const sheet=validateSheet(await fetchJson(folder+info.prefix+'_line_infantry_atlas.json'),side,config,frameNames(info.prefix));
   const image=await loadImage(folder+sheet.meta.image);
   if(image.naturalWidth!==sheet.meta.size.w||image.naturalHeight!==sheet.meta.size.h)throw new Error(side+': PNG-maat wijkt af van JSON');
   sides[side]={sheet,image,names:frameNames(info.prefix)};
 }));
 function getFrame(side,state,index){
   const s=sides[side];if(!s)return null;
   const list=s.names[state];if(!list)return null;
   const name=list[Math.max(0,Math.min(list.length-1,index))];
   const f=s.sheet.frames[name].frame;
   return{name,image:s.image,sx:f.x,sy:f.y,sw:f.w,sh:f.h};
 }
 return{getFrame,sides:Object.keys(sides)};
}

// Draws one frame with the shared pivot on the soldier's world position.
// referenceFacing is screen-right; facing -1 mirrors as a lab-only stopgap
// until dedicated left-facing art exists.
function drawInfantryFrame(ctx,frame,config,x,y,size,facing){
 if(!frame)return false;
 const scale=size/config.frameWidth,px=config.pivot.x*scale,py=config.pivot.y*scale;
 ctx.save();
 ctx.translate(x,y);
 if(facing<0)ctx.scale(-1,1);
 ctx.drawImage(frame.image,frame.sx,frame.sy,frame.sw,frame.sh,-px,-py,frame.sw*scale,frame.sh*scale);
 ctx.restore();
 return true;
}

const api={loadInfantryAtlases,validateSheet,drawInfantryFrame,SIDES};
if(typeof module==='object'&&module.exports)module.exports=api;
root.NRTSInfantryAtlas=api;
})(typeof globalThis!=='undefined'?globalThis:this);
