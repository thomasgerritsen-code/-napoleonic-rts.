const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('both online players see powder smoke and hit dust from actual authoritative musket fire',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const context=await browser.newContext();contexts.push(context);
  await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
  await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=atmosphere-authority`);
  await simulation.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__RANK_VOLLEY_V1__);
  await simulation.evaluate(()=>{
   const u=createUnit('france','infantry',3900,1800),e=createUnit('britain','infantry',4000,1800);
   for(const q of[u,e]){q.hp=q.maxHp=10000;q.reload=100;q.targetX=q.x;q.targetY=q.y;}u.reload=0;
   __WEATHER_V1__.setWetness(0);window.__atmoIds={shooter:u.id,target:e.id};
  });
  return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),cb=await browser.newContext();contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');
  await expect(a.locator('#onlineHost')).toBeVisible({timeout:30000});await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);
  const ids=await simulation.evaluate(()=>__atmoIds);await b.goto(await a.inputValue('#onlineInvite'));
  for(const p of[a,b])await p.evaluate(ids=>{
   window.__atmoSeen={smoke:false,hit:false,shot:null,hp:10000};
   function sample(){
    const u=units.find(u=>u.id===ids.shooter),e=units.find(u=>u.id===ids.target),effects=__ISO_VIEW_V1__?.atmosphere();
    if(u&&Number.isFinite(u.musketShotAt))__atmoSeen.shot=u.musketShotAt;
    if(e)__atmoSeen.hp=Math.min(__atmoSeen.hp,e.hp);
    if(effects?.smoke.length)__atmoSeen.smoke=true;if(effects?.hits.length)__atmoSeen.hit=true;
    requestAnimationFrame(sample);
   }camera.x=3950;camera.y=1800;camera.zoom=1.7;requestAnimationFrame(sample);
  },ids);
  await readyPlayers(a,b);for(const p of[a,b]){
   await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');
   // The first authoritative snapshot centers each player on their own army.
   // Pan to the actual fight after that initial camera placement.
   await p.evaluate(()=>{camera.x=3950;camera.y=1800;camera.zoom=1.7;});await p.click('#onlineClose');
  }
  try{
   for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__atmoSeen.smoke&&__atmoSeen.hit&&__atmoSeen.hp<10000),{timeout:20000}).toBe(true);
  }finally{
   console.log('ONLINE_ATMOSPHERE_OBSERVED',JSON.stringify({seen:await Promise.all([a,b].map(p=>p.evaluate(()=>__atmoSeen))),authority:await simulation.evaluate(ids=>({at:elapsed,hp:units.find(u=>u.id===ids.target)?.hp,shot:units.find(u=>u.id===ids.shooter)?.musketShotAt,reload:units.find(u=>u.id===ids.shooter)?.reload}),ids)}));
  }
  const seen=await Promise.all([a,b].map(p=>p.evaluate(()=>__atmoSeen)));
  expect(seen[0].shot).toBe(seen[1].shot);expect(seen[0].shot).not.toBeNull();
  const authority=await simulation.evaluate(ids=>({hp:units.find(u=>u.id===ids.target).hp,shot:units.find(u=>u.id===ids.shooter).musketShotAt}),ids);
  expect(authority.hp).toBeLessThan(10000);expect(authority.shot).toBe(seen[0].shot);
  expect(await b.evaluate(id=>{const u=__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id);return u&&u.targetX===u.x&&u.targetY===u.y;},ids.shooter)).toBe(true);
  console.log('ONLINE_ATMOSPHERE',JSON.stringify({seen,authority}));expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
