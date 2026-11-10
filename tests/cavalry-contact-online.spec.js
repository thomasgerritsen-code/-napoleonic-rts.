const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('both online parties fight at real horse contact distance and a mobile player can break off',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const context=await browser.newContext();contexts.push(context);await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
  await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=mounted-combat&gpu=off`);await simulation.waitForFunction(()=>!!window.__ONLINE_SIM_V1__&&!!window.__CAVALRY_CONTACT_V1__);
  await simulation.evaluate(()=>{
   window.__duel={};for(const side of['france','britain']){const u=createUnit(side,'cavalry',side==='france'?3920:4080,1800);u.hp=u.maxHp=4000;u.morale=100;u.targetX=u.x;u.targetY=u.y;u.facing=side==='france'?0:Math.PI;__duel[side]=u.id;}
  });
  return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:1280,height:900}}),cb=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');await expect(a.locator('#onlineHost')).toBeVisible({timeout:30000});await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);
  await b.goto(await a.inputValue('#onlineInvite'));await readyPlayers(a,b);for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  const ids=await simulation.evaluate(()=>__duel);
  for(const[p,side]of[[a,'france'],[b,'britain']]){
   await p.evaluate(({id,goal})=>{selectedUnits.clear();selectedBuilding=null;const u=units.find(u=>u.id===id);selectedUnits.add(u);camera.x=4000;camera.y=1800;camera.zoom=1.5;updateHud(true);window.__observedStrikes=0;function observe(){if(__ISO_VIEW_V1__.frameOf(id)?.[1].startsWith('slash_'))__observedStrikes++;requestAnimationFrame(observe);}requestAnimationFrame(observe);issueMoveWithFacingV06(goal,1800,goal>u.x?0:Math.PI);},{id:ids[side],goal:side==='france'?4080:3920});
  }
  await expect.poll(()=>simulation.evaluate(()=>Object.values(__duel).every(id=>units.find(u=>u.id===id).hp<4000)),{timeout:20000}).toBe(true);
  const state=await simulation.evaluate(()=>{const f=units.find(u=>u.id===__duel.france),b=units.find(u=>u.id===__duel.britain);return{france:f.hp,britain:b.hp,distance:Math.hypot(f.x-b.x,f.y-b.y),fTarget:__CAVALRY_CONTACT_V1__.state(f)?.enemyId,bTarget:__CAVALRY_CONTACT_V1__.state(b)?.enemyId};});
  expect(state.distance).toBeGreaterThan(18);expect(state.distance).toBeLessThan(25);expect(state.fTarget).toBe(ids.britain);expect(state.bTarget).toBe(ids.france);
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__observedStrikes),{timeout:10000}).toBeGreaterThan(0);
  await expect.poll(()=>a.evaluate(id=>Number.isFinite(__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id)?.meleeStrikeAt),ids.britain),{timeout:10000}).toBe(true);
  await b.screenshot({path:test.info().outputPath('online-mounted-melee-mobile.png')});
  const before=await b.evaluate(id=>{const u=units.find(u=>u.id===id);selectedUnits.clear();selectedUnits.add(u);issueMove(u.x+160,u.y);return u.x;},ids.britain);
  await b.waitForFunction(({id,before})=>units.find(u=>u.id===id)?.x>before+55,{id:ids.britain,before},{timeout:15000});
  expect(await simulation.evaluate(id=>__CAVALRY_CONTACT_V1__.state(units.find(u=>u.id===id)),ids.britain)).toBeNull();
  expect(await a.evaluate(id=>Object.hasOwn(__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id)||{},'cavalryTargetId'),ids.britain)).toBe(false);expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
