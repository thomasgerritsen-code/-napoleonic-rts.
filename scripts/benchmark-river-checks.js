'use strict';
// Compare the published simulation with exactly one source-file override; this
// isolates river performance from simultaneous officer, rendering or UI changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const flags=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg.slice(2),true]:[arg.slice(2,i),arg.slice(i+1)];}));
if(flags.help||!flags.baseline){
  console.log('node scripts/benchmark-river-checks.js --baseline=http://127.0.0.1:4176 [--source=src/v067.js] [--browser=/usr/bin/chromium] [--output=test-results/river-comparison.json]');
  process.exit(flags.help?0:1);
}
(async()=>{
  const results=[];
  for(const changed of [false,true]){
    const browser=await chromium.launch({...(flags.browser?{executablePath:flags.browser}:{}),args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    try{
      await page.addInitScript(()=>{let seed=99;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;});
      if(changed)await page.route('**/src/v067.js*',route=>route.fulfill({path:path.resolve(flags.source||'src/v067.js'),contentType:'application/javascript'}));
      await page.goto(new URL('/?test=river-benchmark&view=iso&gpu=off',flags.baseline).href);
      await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready&&window.__ISO_VIEW_V1__.stats().assets.background===0,null,{timeout:120000});
      for(let i=0;i<10;i++)await page.evaluate(()=>window.__RTS_DEBUG__.tick(30));
      const sample=await page.evaluate(()=>{
        const costs=[];
        for(let i=0;i<600;i++){const t=performance.now();window.__RTS_DEBUG__.tick(.05);costs.push(performance.now()-t);}
        costs.sort((a,b)=>a-b);
        return {elapsed,alive:units.filter(u=>!u.dead).length,buildings:buildings.length,
          meanMs:costs.reduce((a,b)=>a+b,0)/costs.length,p95Ms:costs[Math.floor(costs.length*.95)],
          state:units.filter(u=>!u.dead).map(u=>[u.id,+u.x.toFixed(3),+u.y.toFixed(3),+u.hp.toFixed(3)])};
      });
      results.push({changed,...sample});
      console.log(JSON.stringify({changed,elapsed:sample.elapsed,alive:sample.alive,meanMs:sample.meanMs,p95Ms:sample.p95Ms}));
    }finally{await browser.close();}
  }
  assert.deepEqual(results[0].state,results[1].state,'Simulation state changed');
  const output=flags.output||'test-results/river-comparison.json';fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(results,null,2));console.log('Matching simulation state; '+output);
})().catch(error=>{console.error(error);process.exit(1);});
