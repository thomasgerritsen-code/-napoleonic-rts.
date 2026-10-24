'use strict';
// Cache resampled scenery while preserving depth, opacity and clipping.
(function installStaticSpriteCache(root) {
  const entries = new Map(), ids = new WeakMap();
  const budget = (matchMedia('(pointer:coarse)').matches ? 24 : 48) * 2 ** 20;
  let nextId = 0, bytes = 0, createdThisFrame = 0;
  const stats = { hits: 0, misses: 0, created: 0, evicted: 0 };
  function draw(ctx, image, ...args) {
    let sx=0, sy=0, sw=image.width, sh=image.height, dx, dy, dw, dh;
    if (args.length === 4) [dx,dy,dw,dh] = args;
    else if (args.length === 8) [sx,sy,sw,sh,dx,dy,dw,dh] = args;
    else { ctx.drawImage(image,...args); return; }
    const m=ctx.getTransform(), rx=Math.hypot(m.a,m.b), ry=Math.hypot(m.c,m.d);
    const w=Math.ceil(dw*rx), h=Math.ceil(dh*ry), cost=w*h*4;
    if (!(w>0&&h>0) || w>4096 || h>4096 || cost>budget/4) { ctx.drawImage(image,...args); return; }
    if (!ids.has(image)) ids.set(image,++nextId);
    const key=[ids.get(image),sx,sy,sw,sh,w,h,ctx.imageSmoothingEnabled,ctx.imageSmoothingQuality].join(':');
    let entry=entries.get(key);
    if (entry) { entries.delete(key); entries.set(key,entry); stats.hits++; }
    else {
      stats.misses++;
      if (createdThisFrame>=2) { ctx.drawImage(image,...args); return; }
      createdThisFrame++;
      while(bytes+cost>budget && entries.size) {
        const oldest=entries.keys().next().value, old=entries.get(oldest);
        bytes-=old.cost; entries.delete(oldest); old.canvas.width=old.canvas.height=0; stats.evicted++;
      }
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const c=canvas.getContext('2d');c.imageSmoothingEnabled=ctx.imageSmoothingEnabled;
      c.imageSmoothingQuality=ctx.imageSmoothingQuality;c.drawImage(image,sx,sy,sw,sh,0,0,w,h);
      entry={canvas,cost};entries.set(key,entry);bytes+=cost;stats.created++;
    }
    ctx.drawImage(entry.canvas,dx,dy,dw,dh);
  }
  root.__STATIC_SPRITE_CACHE_V1__=Object.freeze({ draw, beginFrame:()=>{createdThisFrame=0;},
    stats:()=>({...stats,bytes,budget,entries:entries.size}) });
})(window);
