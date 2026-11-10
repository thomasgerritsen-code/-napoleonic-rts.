const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('both online players see the formation break while the owner keeps control of the retreat',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const context=await browser.newContext();contexts.push(context);
  await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
  await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?test=cohesion-online&view=iso`);
  await simulation.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__BATTLE_COHESION_V1__);
  await simulation.evaluate(()=>{
   const men=Array.from({length:12},()=>createUnit('france','infantry',3900,1800));
   const reg=createRegiment('france',[...men,createUnit('france','officer',3900,1800),createUnit('france','drummer',3900,1800)]);
   arrangeFacingRegimentV146(reg,3900,1800,'line',0);
   regimentMembers(reg).forEach(u=>{u.x=u.targetX;u.y=u.targetY;u.morale=54;u.hp=u.maxHp=100;u.reload=100;});
   const enemy=createUnit('britain','infantry',4050,1800);enemy.hp=enemy.maxHp=10000;enemy.reload=100;
   for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,12,7);
   window.__retreatRegId=reg.id;
  });
  return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),cb=await browser.newContext();contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');
  await expect(a.locator('#onlineHost')).toBeVisible({timeout:30000});await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);
  const id=await simulation.evaluate(()=>__retreatRegId);
  await b.goto(await a.inputValue('#onlineInvite'));
  // Observe before play: after withdrawal the enemy correctly leaves sight.
  for(const p of[a,b])await p.evaluate(id=>{
   window.__cohesionObserved=[];
   function observe(){const r=regiments.find(r=>r.id===id);
    if(r&&['broken','withdrawing'].includes(r.cohesionPhase))__cohesionObserved.push({phase:r.cohesionPhase,since:r.cohesionSince,cohesion:r.cohesion,label:__BATTLE_COHESION_V1__.label(r),privateGoal:Object.hasOwn(r,'targetX')||Object.hasOwn(r,'goal')});
    requestAnimationFrame(observe);
   }requestAnimationFrame(observe);
  },id);
  await readyPlayers(a,b);
  for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__cohesionObserved.length),{timeout:15000}).toBeGreaterThan(0);
  const views=await Promise.all([a,b].map(p=>p.evaluate(()=>__cohesionObserved)));
  expect(views.every(v=>v.some(s=>s.label&&s.cohesion<50))).toBe(true);
  expect(views[1].every(v=>!v.privateGoal)).toBe(true);
  await a.evaluate(id=>{const r=regiments.find(r=>r.id===id);selectWholeRegiment(r);issueMove(3700,2100);camera.x=3850;camera.y=1800;camera.zoom=1.4;},id);
  await expect.poll(()=>simulation.evaluate(id=>{const r=getRegiment(id);return r?.finalTarget?.x===3700&&r.finalTarget.y===2100;},id),{timeout:10000}).toBe(true);
  expect(await simulation.evaluate(()=>__BATTLE_COHESION_V1__.stats().interrupted)).toBe(1);
  await a.screenshot({path:test.info().outputPath('online-cohesion-mobile.png')});expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
