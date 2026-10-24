const {test,expect} = require('@playwright/test');
async function rendererPage(page, query='&gpu=on') {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).pathname === '/') return route.fulfill({contentType:'text/html',body:'<canvas id="target" width="512" height="256"></canvas><script src="/src/systems/rendering/iso-gpu-v1.js"></script>'});
    return route.continue();
  });
  await page.goto('/?view=iso'+query);
}
for (const scale of [1,1.5]) test(`GPU sprites preserve cropping, alpha and painter order at ${scale}x pixel density`, async({page}) => {
  await rendererPage(page);
  const result=await page.evaluate(scale => {
    const gpu=window.__ISO_GPU_V1__,target=document.getElementById('target'),ctx=target.getContext('2d');
    target.width=512*scale;target.height=256*scale;ctx.setTransform(scale,0,0,scale,0,0);
    const ref=document.createElement('canvas');ref.width=512*scale;ref.height=256*scale;const r=ref.getContext('2d');r.setTransform(scale,0,0,scale,0,0);
    const image=document.createElement('canvas');image.width=image.height=128;
    const c=image.getContext('2d');c.fillStyle='#ff2200';c.fillRect(0,0,64,128);c.fillStyle='rgba(0,90,255,.6)';c.fillRect(64,0,64,128);
    const draw=(...args)=>{if(!gpu.draw(ctx,image,...args))ctx.drawImage(image,...args);r.drawImage(image,...args);};
    gpu.beginFrame(512,256,scale,performance.now());gpu.begin(ctx);
    draw(0,0,80,80);ctx.globalAlpha=r.globalAlpha=.4;draw(64,0,64,128,30,20,100,120);gpu.end();
    ctx.globalAlpha=r.globalAlpha=1;ctx.fillStyle=r.fillStyle='#33cc88';ctx.fillRect(60,60,60,60);r.fillRect(60,60,60,60);
    gpu.begin(ctx);draw(0,0,64,128,90,80,90,150);gpu.end();
    // Floating-point source edges must not allocate a zero-height texture.
    gpu.beginFrame(512,256,scale,performance.now());gpu.begin(ctx);
    draw(0,0,127.99999999999,128,250,10,90,120.0000000001);gpu.end();
    const actual=ctx.getImageData(0,0,target.width,target.height).data,expected=r.getImageData(0,0,ref.width,ref.height).data;
    let sum=0,bad=0;for(let i=0;i<actual.length;i++){const diff=Math.abs(actual[i]-expected[i]);sum+=diff;if(diff>8)bad++;}
    return {stats:gpu.stats(),mean:sum/actual.length,bad:bad/actual.length};
  },scale);
  expect(result.stats.active).toBe(true);expect(result.stats.draws).toBeGreaterThan(0);
  expect(result.stats.lastError).toBeNull();
  expect(result.mean).toBeLessThan(.8);expect(result.bad).toBeLessThan(.012);
});
test('different sprite textures share a draw and large images have no tile seams', async({page})=>{
  await rendererPage(page);
  const result=await page.evaluate(()=>{
    const gpu=window.__ISO_GPU_V1__,ctx=document.getElementById('target').getContext('2d');
    gpu.beginFrame(512,256,1,performance.now());gpu.begin(ctx);
    for(const [i,color] of ['red','green','blue'].entries()){
      const image=document.createElement('canvas');image.width=image.height=64;image.getContext('2d').fillStyle=color;image.getContext('2d').fillRect(0,0,64,64);
      gpu.draw(ctx,image,i*80,0,64,64);
    }
    gpu.end();const draws=gpu.stats().draws,colors=[20,100,180].map(x=>[...ctx.getImageData(x,20,1,1).data]);
    const large=document.createElement('canvas');large.width=1536;large.height=512;const c=large.getContext('2d');
    const gradient=c.createLinearGradient(0,0,1536,512);gradient.addColorStop(0,'#bd3724');gradient.addColorStop(1,'#184a92');c.fillStyle=gradient;c.fillRect(0,0,1536,512);
    const ref=document.createElement('canvas');ref.width=512;ref.height=256;const r=ref.getContext('2d');
    ctx.clearRect(0,0,512,256);gpu.beginFrame(512,256,1,performance.now());gpu.begin(ctx);gpu.draw(ctx,large,400,0,1000,512,10,10,400,200);gpu.end();r.drawImage(large,400,0,1000,512,10,10,400,200);
    const a=ctx.getImageData(0,0,512,256).data,b=r.getImageData(0,0,512,256).data;
    let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);
    return {draws,colors,mean:sum/a.length,stats:gpu.stats()};
  });
  expect(result.draws).toBe(1);expect(result.colors).toEqual([[255,0,0,255],[0,128,0,255],[0,0,255,255]]);
  expect(result.mean).toBeLessThan(.8);expect(result.stats.lastError).toBeNull();
});
test('GPU textures stay within budget, are reused and are explicitly released', async({page}) => {
  await rendererPage(page);
  const result=await page.evaluate(() => {
    const gpu=window.__ISO_GPU_V1__,ctx=document.getElementById('target').getContext('2d');
    for(let i=0;i<30;i++){
      const image=document.createElement('canvas');image.width=image.height=1024;image.getContext('2d').fillRect(0,0,1024,1024);
      gpu.beginFrame(512,256,1,performance.now());gpu.begin(ctx);gpu.draw(ctx,image,0,0,20,20);gpu.end();
      gpu.beginFrame(512,256,1,performance.now());gpu.begin(ctx);gpu.draw(ctx,image,0,0,20,20);gpu.end();
    }
    const before=gpu.stats();gpu.clear();return {before,after:gpu.stats()};
  });
  expect(result.before.uploads).toBe(120);expect(result.before.evictions).toBeGreaterThan(0);
  expect(result.before.bytes).toBeLessThanOrEqual(result.before.budget);expect(result.after.bytes).toBe(0);expect(result.after.textureCount).toBe(0);
});
test('GPU off or unavailable retains Canvas2D', async({page}) => {
  await rendererPage(page,'&gpu=off');
  expect(await page.evaluate(()=>window.__ISO_GPU_V1__.stats().backend)).toBe('canvas2d');
  await page.addInitScript(() => {const base=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:base.call(this,type,...args);};});
  await page.goto('/?view=iso');
  expect(await page.evaluate(()=>window.__ISO_GPU_V1__.active())).toBe(false);
});
test('a lost graphics context falls back and can be restored', async({page}) => {
  await page.addInitScript(() => {const base=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const context=base.call(this,type,...args);if(type==='webgl2')window.testGpuContext=context;return context;};});
  await rendererPage(page);
  await page.evaluate(()=>{window.testLoseContext=window.testGpuContext.getExtension('WEBGL_lose_context');window.testLoseContext.loseContext();});
  await expect.poll(()=>page.evaluate(()=>window.__ISO_GPU_V1__.stats().lost)).toBe(true);
  expect(await page.evaluate(()=>window.__ISO_GPU_V1__.active())).toBe(false);
  await page.evaluate(()=>window.testLoseContext.restoreContext());
  await expect.poll(()=>page.evaluate(()=>window.__ISO_GPU_V1__.active())).toBe(true);
  const restored=await page.evaluate(()=>{
    const gpu=window.__ISO_GPU_V1__,ctx=document.getElementById('target').getContext('2d');
    const image=document.createElement('canvas');image.width=image.height=32;image.getContext('2d').fillRect(0,0,32,32);
    gpu.beginFrame(512,256,1,performance.now());gpu.begin(ctx);gpu.draw(ctx,image,0,0,32,32);gpu.end();
    return {pixel:[...ctx.getImageData(10,10,1,1).data],stats:gpu.stats()};
  });
  expect(restored.pixel).toEqual([0,0,0,255]);expect(restored.stats.active).toBe(true);expect(restored.stats.lastError).toBeNull();
});
test('the actual isometric battle keeps the GPU active after asset warmup and camera changes', async({page}) => {
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=gpu-battle&view=iso&gpu=on');
  await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready,null,{timeout:90000});
  const stats=await page.evaluate(()=>{
    for(let i=0;i<12;i++)window.renderStableFrameV1(()=>{},performance.now());
    camera.x+=130;camera.y+=70;camera.zoom=1.03;
    for(let i=0;i<12;i++)window.renderStableFrameV1(()=>{},performance.now());
    return window.__ISO_GPU_V1__.stats();
  });
  expect(stats.active).toBe(true);expect(stats.lastError).toBeNull();expect(stats.sprites).toBeGreaterThan(100);
  expect(stats.bytes).toBeLessThanOrEqual(stats.budget);expect(stats.allocatedBytes).toBeLessThanOrEqual(stats.budget);
  expect(errors).toEqual([]);
});
