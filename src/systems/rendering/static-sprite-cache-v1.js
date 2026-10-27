'use strict';
// Cache resampled scenery while preserving depth, opacity and clipping.
// Pictures are cached per scale level (quarter octaves), not per drawn size:
// trees, bushes and houses each have their own scale, and a cache per exact size
// needed hundreds of entries that it could only fill two a frame - the scenery
// was resampled from full size for half a minute after every zoom. A level is at
// most 19% larger than the size drawn, so the last step is a cheap, sharp one.
(function installStaticSpriteCache(root) {
  const entries = new Map(), ids = new WeakMap();
  const budget = (matchMedia('(pointer:coarse)').matches ? 24 : 48) * 2 ** 20;
  // New levels a frame: a few always, more while 3 ms of resampling lasts.
  const MIN_CREATE = 2, CREATE_MS = 3;
  let nextId = 0, bytes = 0, createdThisFrame = 0, createMs = 0;
  const stats = { hits: 0, misses: 0, created: 0, evicted: 0, direct: 0 };
  function draw(ctx, image, ...args) {
    let sx=0, sy=0, sw=image.width, sh=image.height, dx, dy, dw, dh;
    if (args.length === 4) [dx,dy,dw,dh] = args;
    else if (args.length === 8) [sx,sy,sw,sh,dx,dy,dw,dh] = args;
    else { ctx.drawImage(image,...args); return; }
    const m=ctx.getTransform(), rx=Math.hypot(m.a,m.b), ry=Math.hypot(m.c,m.d);
    const scale=Math.max(dw*rx/sw, dh*ry/sh);
    // Near full size (or larger) the picture itself is drawn: nothing to save.
    if (!(scale>0) || scale>=0.84) { stats.direct++; ctx.drawImage(image,...args); return; }
    const level=Math.ceil(Math.log2(scale)*4), s=2**(level/4);
    const w=Math.ceil(sw*s), h=Math.ceil(sh*s), cost=w*h*4;
    if (!(w>0&&h>0) || w>4096 || h>4096 || cost>budget/4) { ctx.drawImage(image,...args); return; }
    if (!ids.has(image)) ids.set(image,++nextId);
    const key=ids.get(image)+':'+sx+':'+sy+':'+sw+':'+sh+':'+level+':'+ctx.imageSmoothingEnabled+':'+ctx.imageSmoothingQuality;
    let entry=entries.get(key);
    if (entry) { entries.delete(key); entries.set(key,entry); stats.hits++; }
    else {
      stats.misses++;
      if (createdThisFrame>=MIN_CREATE && createMs>CREATE_MS) { ctx.drawImage(image,...args); return; }
      createdThisFrame++; const t0=performance.now();
      while(bytes+cost>budget && entries.size) {
        const oldest=entries.keys().next().value, old=entries.get(oldest);
        bytes-=old.cost; entries.delete(oldest); old.canvas.width=old.canvas.height=0; stats.evicted++;
      }
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const c=canvas.getContext('2d');c.imageSmoothingEnabled=ctx.imageSmoothingEnabled;
      c.imageSmoothingQuality=ctx.imageSmoothingQuality;c.drawImage(image,sx,sy,sw,sh,0,0,w,h);
      entry={canvas,cost,w,h};entries.set(key,entry);bytes+=cost;stats.created++;createMs+=performance.now()-t0;
    }
    ctx.drawImage(entry.canvas,0,0,entry.w,entry.h,dx,dy,dw,dh);
  }
  root.__STATIC_SPRITE_CACHE_V1__=Object.freeze({ draw, beginFrame:()=>{createdThisFrame=0;createMs=0;},
    stats:()=>({...stats,bytes,budget,entries:entries.size}) });
})(window);
