const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const flags=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');return i<0?[v.slice(2),true]:[v.slice(2,i),v.slice(i+1)];}));
if(flags.help || !flags.before || !flags.after){
 console.log('Usage: node scripts/benchmark-iso-performance.js --before=http://127.0.0.1:4175 --after=http://127.0.0.1:4173 [--browser=/usr/bin/chromium] [--output=test-results/iso-performance-comparison.json]');
 process.exit(flags.help?0:1);
}
const rounds=Number(flags.rounds||2),output=flags.output||'test-results/iso-performance-comparison.json';
if(!Number.isInteger(rounds)||rounds<1||rounds>10)throw new Error('rounds must be 1–10');
for(const url of [flags.before,flags.after])if(!['http:','https:'].includes(new URL(url).protocol))throw new Error('HTTP URL required');
(async()=>{
 const results=[];
 for(let round=0;round<rounds;round++)for(const [label,origin] of [['before',flags.before],['after',flags.after]])for(const army of [false,true]){
  const browser=await chromium.launch({...(flags.browser?{executablePath:flags.browser}:{}),args:['--no-sandbox']});
  const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{let seed=987654321;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
  await p.goto(new URL('/?test=perf-fixed&view=iso',origin).href);
  await p.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().atlases>=54 && window.__ISO_VIEW_V1__.stats().ground && (!window.__ISO_VIEW_V1__.stats().assets || window.__ISO_VIEW_V1__.stats().assets.background===0),null,{timeout:120000});
  const r=await p.evaluate(async army=>{
   if(army)for(const side of ['france','britain'])for(let r=0;r<10;r++){
    const x=(side==='france'?1900:2350)+r%5*60,y=1200+Math.floor(r/5)*200,g=[];
    for(let i=0;i<12;i++)g.push(createUnit(side,'infantry',x+i%6*18,y+Math.floor(i/6)*20));
    g.push(createUnit(side,'officer',x-20,y),createUnit(side,'drummer',x-40,y));createRegiment(side,g);
   }
   camera.x=2200;camera.y=1450;camera.zoom=.72;
   const start=performance.now();for(let i=0;i<120;i++)window.__RTS_DEBUG__.tick(1/60);const simulationMs=performance.now()-start;
   const checksum=units.map(u=>[u.id,u.dead,Math.round(u.x*1e4),Math.round(u.y*1e4),Math.round(u.hp*1e4)]);
   for(let i=0;i<25;i++)window.renderStableFrameV1(()=>{},performance.now());
   const costs=[];for(let i=0;i<80;i++){const t=performance.now();window.renderStableFrameV1(()=>{},t);costs.push(performance.now()-t);if(i%10===0)await new Promise(r=>setTimeout(r,0));}
   costs.sort((a,b)=>a-b);
   return{units:units.length,simulationMs,renderMeanMs:costs.reduce((a,b)=>a+b,0)/costs.length,renderP95Ms:costs[Math.floor(costs.length*.95)],checksum,stats:window.__ISO_VIEW_V1__.stats()};
  },army);
  results.push({round,label,army,...r,errors});console.log(JSON.stringify({round,label,army,simulationMs:r.simulationMs,renderMeanMs:r.renderMeanMs,renderP95Ms:r.renderP95Ms,units:r.units,errors}));
  await p.close();await browser.close();
 }
 for(let round=0;round<rounds;round++)for(const army of [false,true]){
  const before=results.find(r=>r.round===round&&r.army===army&&r.label==='before');
  const after=results.find(r=>r.round===round&&r.army===army&&r.label==='after');
  assert.deepEqual(after.checksum,before.checksum,'Simulation state changed');
  assert.deepEqual(before.errors,[]);assert.deepEqual(after.errors,[]);
 }
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2));
 console.log('Matching simulation states; results: '+output);
})().catch(e=>{console.error(e);process.exit(1)});
