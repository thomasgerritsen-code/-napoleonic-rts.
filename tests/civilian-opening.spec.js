const{test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
test('mobile new battles show only workers and no leftover soldiers, horses or corpses',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.__NRTS_HUMAN_BRITAIN__=true;});
  await page.goto('/play.html?view=iso&test=civilian-mobile');await page.waitForFunction(()=>window.__BALANCED_START__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
  const sample=()=>page.evaluate(()=>({types:['france','britain'].map(s=>livingUnits(s).map(u=>u.type)),groups:regiments.length,corpses:__ISO_VIEW_V1__.stats().corpses,over:gameOver}));
  const first=await sample();for(const types of first.types)expect(types).toEqual(Array(6).fill('worker'));expect(first.groups).toBe(0);expect(first.corpses).toBe(0);expect(first.over).toBe(false);
  await page.screenshot({path:test.info().outputPath('civilian-opening-mobile.png')});
  await page.evaluate(()=>resetGame());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await sample()).toEqual(first);expect(errors).toEqual([]);
 }finally{await context.close();}
});
test('both civilian openings remain playable, construct barracks and stables and produce their first soldiers only through training',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
 await page.goto('/play.html?view=iso&test=civilian-production');await page.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__BALANCED_START__);
 const r=await page.evaluate(()=>{
  const roster=()=>['france','britain'].map(side=>({side,types:livingUnits(side).map(u=>u.type),groups:activeRegiments(side).length,home:livingBuildings(side).some(b=>b.type==='towncenter')}));
  const initial=roster();RTS_SIM.step(10);const idle=roster(),over=gameOver,constructed=[];
  for(const side of['france','britain'])for(const type of['barracks','stable']){
   let b;for(let i=0;i<40&&!b;i++){const p=findBuildLocation(side,type,i);if(!waterAtV067(p.x,p.y))b=constructBuilding(side,type,p.x,p.y,livingUnits(side).filter(u=>u.type==='worker'));}
   if(!b)throw Error('Cannot build '+side+' '+type);
   for(let i=0;i<400&&!b.complete;i++)RTS_SIM.step(.25);
   if(!b.complete)throw Error('Construction did not finish: '+type);
   constructed.push({side,type,complete:b.complete});
  }
  const beforeTraining=roster(),orders=[];
  for(const side of['france','britain'])for(const[type,producer]of[['infantry','barracks'],['cavalry','stable']]){
   const b=livingBuildings(side).find(b=>b.type===producer&&b.complete);orders.push(queueUnitForBuilding(side,b,type));
  }
  for(let i=0;i<240&&['france','britain'].some(s=>livingUnits(s).filter(u=>u.type!=='worker').length<2);i++)RTS_SIM.step(.25);
  const trained=roster();resetGame();return{initial,idle,over,constructed,beforeTraining,orders,trained,reset:roster(),resetOver:gameOver};
 });
 for(const rows of[r.initial,r.idle,r.beforeTraining,r.reset])for(const p of rows){expect(p.types).toEqual(Array(6).fill('worker'));expect(p.groups).toBe(0);expect(p.home).toBe(true);}
 expect(r.over).toBe(false);expect(r.resetOver).toBe(false);expect(r.constructed).toHaveLength(4);expect(r.orders).toEqual([true,true,true,true]);
 for(const p of r.trained){expect(p.types.filter(t=>t==='infantry')).toHaveLength(1);expect(p.types.filter(t=>t==='cavalry')).toHaveLength(1);expect(p.types).toHaveLength(8);}
 console.log('CIVILIAN_PRODUCTION',JSON.stringify(r));expect(errors).toEqual([]);
});
test('the singleplayer computer starts with workers and obtains its first soldier from a completed barracks queue',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/play.html?view=iso&test=civilian-ai&gpu=off');await page.waitForFunction(()=>window.__BALANCED_START__&&window.__TERRITORIES__);
 const r=await page.evaluate(()=>{
  const initial=['france','britain'].map(s=>livingUnits(s).map(u=>u.type));let first=null,infantry=null;
  for(let i=0;i<1200&&!infantry;i++){
   const pending=livingBuildings('britain').filter(b=>b.complete&&b.queue.length).map(b=>({type:b.type,unit:b.queue[0].type}));
   RTS_SIM.step(.25);const u=livingUnits('britain').find(u=>u.type!=='worker');
   if(u&&!first)first={at:elapsed,type:u.type,fromQueue:pending.some(b=>b.type==='barracks'&&b.unit===u.type)};
   if(livingUnits('britain').some(u=>u.type==='infantry'))infantry={at:elapsed,fromQueue:pending.some(b=>b.type==='barracks'&&b.unit==='infantry')};
  }
  return{initial,first,infantry,france:livingUnits('france').map(u=>u.type),over:gameOver};
 });
 for(const types of r.initial)expect(types).toEqual(Array(6).fill('worker'));
 console.log('CIVILIAN_AI',JSON.stringify(r));expect(['infantry','officer','drummer']).toContain(r.first?.type);expect(r.first.fromQueue).toBe(true);expect(r.first.at).toBeGreaterThan(0);expect(r.infantry?.fromQueue).toBe(true);expect(r.france.every(t=>t==='worker')).toBe(true);expect(r.over).toBe(false);expect(errors).toEqual([]);
});
