'use strict';
// Recolour shared plant pictures once, never individual trees or full maps.
(function installSeasonalProps(root){
 const config=root.NRTS_CONFIG?.seasons;if(!config)return;
 const budget=config.paletteBudgetMiB*2**20,entries=new Map(),ids=new WeakMap(),failed=new Set();
 let bytes=0,nextId=0,createdThisFrame=0;
 const stats={created:0,hits:0,evicted:0,failures:0,maxCreatedPerFrame:0};
 function drop(key){const e=entries.get(key);bytes-=e.cost;e.canvas.width=e.canvas.height=0;entries.delete(key);stats.evicted++;}
 function source(image,palette){
  if(palette!=='autumn'&&palette!=='winter')return image;
  if(!ids.has(image))ids.set(image,++nextId);const id=ids.get(image),key=id+':'+palette;
  let e=entries.get(key);if(e){entries.delete(key);entries.set(key,e);stats.hits++;return e.canvas;}
  const fallback=entries.get(id+':autumn')?.canvas||image,cost=image.width*image.height*4;
  if(createdThisFrame>=1||cost>budget/2||failed.has(key))return fallback;
  createdThisFrame++;stats.maxCreatedPerFrame=Math.max(stats.maxCreatedPerFrame,createdThisFrame);
  while(bytes+cost>budget&&entries.size)drop(entries.keys().next().value);
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
  try{
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height),data=pixels.data;
   const winter=palette==='winter',tint=winter?[214,228,235]:[218,113,30];
   for(let i=0;i<data.length;i+=4){
    if(!data[i+3])continue;
    const r=data[i],g=data[i+1],b=data[i+2],green=Math.max(0,Math.min(1,(g-Math.max(r,b)*1.04)/Math.max(1,g)*5));
    if(!green)continue;
    const light=(r*.25+g*.6+b*.15)/160;
    const upper=Math.max(0,Math.min(1,(.9-Math.floor(i/4/c.width)/c.height)/.3));
    const weight=green*(winter?.92*upper:.95),shade=winter?.65+Math.min(1,light)*.4:Math.max(.25,Math.min(1.15,light));
    data[i]=r*(1-weight)+Math.min(255,tint[0]*shade)*weight;
    data[i+1]=g*(1-weight)+Math.min(255,tint[1]*shade)*weight;
    data[i+2]=b*(1-weight)+Math.min(255,tint[2]*shade)*weight;
   }
   ctx.putImageData(pixels,0,0);entries.set(key,{canvas:c,cost});bytes+=cost;stats.created++;return c;
  }catch(_){c.width=c.height=0;failed.add(key);stats.failures++;return image;}
 }
 root.__SEASONAL_PROPS_V1__=Object.freeze({source,beginFrame:()=>{createdThisFrame=0;},
  reset(){for(const key of [...entries.keys()])drop(key);failed.clear();createdThisFrame=0;},
  stats:()=>({...stats,bytes,budget,entries:entries.size,createdThisFrame})});
})(window);
