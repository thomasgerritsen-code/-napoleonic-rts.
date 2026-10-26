const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('the authority makes natural charge falls visible to both players and removes the pose after recovery',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const context=await browser.newContext();contexts.push(context);
  await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
  await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?test=charge-online&view=iso`);
  await simulation.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__CHARGE_STUMBLE_V1__);
  await simulation.evaluate(()=>{
   window.__chargingIds=[];
   for(let i=0;i<36;i++){
    const u=createUnit('france','cavalry',3900,1500+i*25);u.hp=u.maxHp=10000;u.morale=100;__chargingIds.push(u.id);
    // Nearby observers see the real enemy fall, without blocking his run.
    const w=createUnit('britain','worker',4100,1500+i*25+100);w.hp=w.maxHp=10000;
   }
  });
  return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:1280,height:900}}),cb=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');
  await expect(a.locator('#onlineHost')).toBeVisible({timeout:30000});await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);
  await b.goto(await a.inputValue('#onlineInvite'));await readyPlayers(a,b);
  for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  const ids=await simulation.evaluate(()=>__chargingIds);
  for(const p of[a,b])await p.evaluate(ids=>{
   window.__fallObservations=[];camera.x=4000;camera.y=1800;camera.zoom=1.4;
   function observe(){for(const u of units)if(ids.includes(u.id)&&__CHARGE_STUMBLE_V1__.down(u)){
    const frame=__ISO_VIEW_V1__.frameOf(u.id);
    if(frame?.[1].startsWith('die_'))__fallObservations.push({id:u.id,at:u.chargeFallAt,until:u.chargeFallUntil,side:u.side});
   }requestAnimationFrame(observe);}requestAnimationFrame(observe);
  },ids);
  await a.evaluate(ids=>{selectedUnits.clear();for(const u of units)if(ids.includes(u.id))selectedUnits.add(u);issueMoveWithFacingV06(4650,1900,0);cavalryCharge();},ids);
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__fallObservations.length),{timeout:20000}).toBeGreaterThan(0);
  const own=await a.evaluate(()=>__fallObservations),enemy=await b.evaluate(()=>__fallObservations);
  const shared=own.find(x=>enemy.some(y=>x.id===y.id&&x.at===y.at&&x.until===y.until));expect(shared).toBeTruthy();
  expect(own.find(x=>x.id===shared.id).side).toBe('france');expect(enemy.find(x=>x.id===shared.id).side).toBe('britain');
  for(const p of[a,b])await expect.poll(()=>p.evaluate(id=>{const u=units.find(u=>u.id===id);return !!u&&!u.dead&&!__CHARGE_STUMBLE_V1__.down(u)&&!Object.hasOwn(u,'chargeFallAt');},shared.id),{timeout:10000}).toBe(true);
  // The existing enemy placeholder is its observed position, never its order.
  expect(await b.evaluate(id=>{const u=__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id);return !!u&&u.targetX===u.x&&u.targetY===u.y&&!Object.hasOwn(u,'cavalryTargetId');},shared.id)).toBe(true);
  expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
