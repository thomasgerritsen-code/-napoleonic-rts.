const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('both online players observe real rank shots and walking-wound treatment from the authority',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const context=await browser.newContext();contexts.push(context);await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
  await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?test=rank-care-online&view=iso`);
  await simulation.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__RANK_VOLLEY_V1__&&window.__FIELD_CARE_V1__);
  await simulation.evaluate(()=>{
   const men=Array.from({length:12},()=>createUnit('france','infantry',3900,1800));
   const reg=createRegiment('france',[...men,createUnit('france','officer',3900,1800),createUnit('france','drummer',3900,1800)]);reg.facing=0;
   const slots=finalFormationOffsetsV063(reg,'line');regimentMembers(reg).forEach(u=>{const o=slots.get(u.id);u.x=u.targetX=3900+o.ox;u.y=u.targetY=1800+o.oy;u.hp=u.maxHp=4000;u.morale=100;u.reload=u.type==='infantry'?0:100;u.facing=0;});
   for(let i=0;i<6;i++){const e=createUnit('britain','infantry',4000,1755+i*18);e.hp=e.maxHp=4000;e.reload=100;}
   createBuilding('france','hospital',3900,2200,true);
   const u=createUnit('france','infantry',3984,2200);u.hp=u.maxHp=100;u.reload=100;applyDamage(u,75,0);u.targetX=u.x;u.targetY=u.y;
   const observer=createUnit('britain','worker',4050,2280);observer.targetX=observer.x;observer.targetY=observer.y;
   window.__careIds={men:men.map(u=>u.id),patient:u.id};
  });
  return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),cb=await browser.newContext();contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');await expect(a.locator('#onlineHost')).toBeVisible({timeout:30000});await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);
  const ids=await simulation.evaluate(()=>__careIds);await b.goto(await a.inputValue('#onlineInvite'));
  for(const p of[a,b])await p.evaluate(ids=>{
   window.__rankObserved=[];window.__injuryObserved=false;window.__careObserved=false;const seen=new Set();camera.x=3950;camera.y=1800;camera.zoom=1.5;
   function observe(){for(const u of units){
    if(ids.men.includes(u.id)&&Number.isFinite(u.musketShotAt)){const key=u.id+':'+u.musketShotAt;if(!seen.has(key)){seen.add(key);__rankObserved.push({id:u.id,at:u.musketShotAt,rank:u.volleyRank,anim:__ISO_VIEW_V1__.frameOf(u.id)?.[1]});}}
    if(u.id===ids.patient){if(u.injuryLevel)__injuryObserved=true;if(Number.isFinite(u.bandagedAt)&&u.hp>25)__careObserved=true;}
   }requestAnimationFrame(observe);}requestAnimationFrame(observe);
  },ids);
  await readyPlayers(a,b);for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__rankObserved.length),{timeout:15000}).toBeGreaterThanOrEqual(12);
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__injuryObserved&&__careObserved),{timeout:15000}).toBe(true);
  const records=await Promise.all([a,b].map(p=>p.evaluate(()=>__rankObserved)));const same=records[0].find(x=>records[1].some(y=>x.id===y.id&&x.at===y.at));expect(same).toBeTruthy();
  for(const rows of records){const front=rows.filter(r=>r.rank===0),rear=rows.filter(r=>r.rank===1);expect(front.length).toBeGreaterThan(0);expect(rear.length).toBeGreaterThan(0);expect(Math.min(...rear.map(r=>r.at))-Math.min(...front.map(r=>r.at))).toBeGreaterThan(.35);}
  expect(await b.evaluate(id=>{const u=__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id);return u&&u.targetX===u.x&&u.targetY===u.y;},ids.patient)).toBe(true);
  await a.evaluate(id=>{const u=units.find(u=>u.id===id);camera.x=u.x;camera.y=u.y;camera.zoom=1.7;},ids.patient);
  await a.screenshot({path:test.info().outputPath('online-walking-wound-mobile.png')});expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
