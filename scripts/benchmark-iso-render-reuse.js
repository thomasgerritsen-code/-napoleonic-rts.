// Compare the same seeded, paused battle with and without one renderer source.
// Uses a fixed animation clock, drained artwork queues, warmed scenery caches and
// captured PNGs (never a live canvas after asynchronous decoding). Timings are
// synthetic CPU-throttled Chromium measurements, not physical-phone frame rates.
const fs=require('fs'),path=require('path'),{chromium}=require('@playwright/test');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(2,at),arg.slice(at+1)];}));
if(!args['baseline-source'])throw Error('Use --baseline-source=/path/to/previous-iso-view-v1.js [--url=http://127.0.0.1:4173] [--browser=/usr/bin/chromium] [--output=test-results/render-reuse.json]');
const baseline=path.resolve(args['baseline-source']),output=path.resolve(args.output||'test-results/render-reuse.json');
fs.accessSync(baseline);

(async()=>{
 const results=[],reference=new Map();
 for(const label of ['before','after']){
  const browser=await chromium.launch({executablePath:args.browser||undefined,args:['--no-sandbox']});
  try{
   const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(label==='before')await page.route('**/src/systems/rendering/iso-view-v1.js*',r=>r.fulfill({path:baseline,contentType:'application/javascript'}));
   await page.addInitScript(()=>{let seed=123;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;window.benchClock=10000;window.benchRAF=true;window.benchNow=performance.now.bind(performance);performance.now=()=>window.benchClock;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(window.benchRAF)fn(window.benchClock);});});
   const target=new URL(args.url||'http://127.0.0.1:4173');target.searchParams.set('view','iso');target.searchParams.set('test','exact-rendering');await page.goto(target.href);
   await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready&&window.__ISO_VIEW_V1__.stats().assets.background===0,null,{timeout:120000});
   await page.evaluate(()=>{window.benchRAF=false;});
   const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(args.cpu||4)});
   for(const scenario of ['base','army','moving','pan','zoom','vision','explored','portrait','reset']){
    if(scenario==='portrait')await page.setViewportSize({width:390,height:844});
    const sample=await page.evaluate(scenario=>{
     if(scenario==='army'){window.benchTroops=[];const x=camera.x,y=camera.y;for(let i=0;i<280;i++)benchTroops.push(createUnit('france','infantry',x-220+i%20*22,y-180+Math.floor(i/20)*25));camera.zoom=.72;}
     if(scenario==='pan'){camera.x+=80;camera.y+=60;}
     if(scenario==='zoom')camera.zoom=1.1;
     if(scenario==='vision'){benchTroops[0].type='cavalry';window.__VISION_EPOCH__=(window.__VISION_EPOCH__||0)+1;}
     if(scenario==='explored'){const x=Math.floor(camera.x/EXPLORE_CELL),y=Math.floor(camera.y/EXPLORE_CELL);exploredCells.delete([...exploredCells][0]);for(let i=0;i<20;i++){const key=`${x+i},${y}`;if(!exploredCells.has(key)){exploredCells.add(key);break;}}}
     if(scenario==='reset')resetGame();
     for(let i=0;i<4;i++){window.benchClock+=400;window.renderStableFrameV1(()=>{},benchClock);}
     for(let i=0;i<120;i++)window.renderStableFrameV1(()=>{},benchClock);
     const costs=[];const frames=['base','army','moving'].includes(scenario)?60:4;
     for(let i=0;i<frames;i++){
      if(scenario==='moving')for(const u of benchTroops){u.x+=.25;u.y+=.1;}
      window.benchClock+=1000/60;const t=benchNow();window.renderStableFrameV1(()=>{},benchClock);costs.push(benchNow()-t);
     }
     costs.sort((a,b)=>a-b);const canvas=document.getElementById('game');
     return {mean:costs.reduce((a,b)=>a+b,0)/costs.length,p95:costs[Math.floor(costs.length*.95)],image:canvas.toDataURL(),
      state:units.map(u=>[u.id,u.side,u.type,u.x,u.y,u.hp,u.dead]),stats:window.__ISO_VIEW_V1__.stats(),width:canvas.width,height:canvas.height};
    },scenario);
    let pixels=null;if(label==='before')reference.set(scenario,{image:sample.image,state:sample.state});
    else{
     if(JSON.stringify(sample.state)!==JSON.stringify(reference.get(scenario).state))throw Error('Simulation differs: '+scenario);
     pixels=await page.evaluate(async images=>{const pixels=[];for(const image of images){const im=new Image();im.src=image;await im.decode();const ref=document.createElement('canvas');ref.width=im.width;ref.height=im.height;const c=ref.getContext('2d');c.drawImage(im,0,0);pixels.push(c.getImageData(0,0,ref.width,ref.height).data);}const [a,b]=pixels;if(a.length!==b.length)throw Error('Canvas dimensions differ');let changed=0,max=0;for(let i=0;i<a.length;i+=4){let diff=false;for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);max=Math.max(max,d);if(d)diff=true;}if(diff)changed++;}return{changed,max,total:a.length/4};},[reference.get(scenario).image,sample.image]);
    }
    delete sample.image;delete sample.state;const r={label,scenario,...sample,pixels,errors};results.push(r);console.log(JSON.stringify({label,scenario,mean:r.mean,p95:r.p95,pixels,drawn:r.stats.drawn,fogReuses:r.stats.fogGeometryReuses}));
   }
  }finally{await browser.close();}
 }
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2));
 if(results.some(r=>r.errors.length||(r.pixels&&r.pixels.changed)))throw Error('Visual comparison failed; inspect '+output);
})().catch(e=>{console.error(e);process.exit(1)});
