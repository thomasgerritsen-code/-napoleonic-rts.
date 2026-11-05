const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('both online parties receive actual collision reactions and keep enemy orders private',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const context=await browser.newContext();contexts.push(context);
  await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
  await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?test=real-melee&view=iso`);
  await simulation.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__MELEE_REALISM_V1__);
  await simulation.evaluate(()=>{
   window.__duelIds={france:[],britain:[]};
   for(const side of['france','britain'])for(let i=0;i<4;i++){
    const u=createUnit(side,'cavalry',side==='france'?3900:4130,1600+i*65);
    u.hp=u.maxHp=4000;u.morale=100;u.targetX=u.x;u.targetY=u.y;u.facing=side==='france'?0:Math.PI;__duelIds[side].push(u.id);
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
  const ids=await simulation.evaluate(()=>__duelIds);
  for(const p of[a,b])await p.evaluate(ids=>{
   const all=[...ids.france,...ids.britain];window.__realMeleeObserved=[];camera.x=4015;camera.y=1700;camera.zoom=1.5;
   function observe(){for(const u of units)if(all.includes(u.id)&&u.meleeActionUntil>elapsed){
    const frame=__ISO_VIEW_V1__.frameOf(u.id);
    if(frame)__realMeleeObserved.push({id:u.id,at:u.meleeActionAt,kind:u.meleeAction,anim:frame[1],side:u.side});
   }requestAnimationFrame(observe);}requestAnimationFrame(observe);
  },ids);
  for(const[p,side]of[[a,'france'],[b,'britain']])await p.evaluate(({ids,goal})=>{
   selectedUnits.clear();for(const u of units)if(ids.includes(u.id))selectedUnits.add(u);
   issueMoveWithFacingV06(goal,1700,goal>4000?0:Math.PI);cavalryCharge();
  },{ids:ids[side],goal:side==='france'?4170:3860});
  await expect.poll(()=>simulation.evaluate(()=>__MELEE_REALISM_V1__.stats().impacts),{timeout:20000}).toBeGreaterThan(0);
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__realMeleeObserved.filter(x=>['recoil','parry','brace'].includes(x.kind)&&/^(rear|slash)_/.test(x.anim)).length),{timeout:15000}).toBeGreaterThan(0);
  const own=await a.evaluate(()=>__realMeleeObserved),other=await b.evaluate(()=>__realMeleeObserved);
  const same=own.find(x=>['recoil','parry','brace'].includes(x.kind)&&other.some(y=>x.id===y.id&&x.at===y.at&&x.kind===y.kind));expect(same).toBeTruthy();
  for(const[p,enemyIds]of[[a,ids.britain],[b,ids.france]])expect(await p.evaluate(enemyIds=>{
   const row=__ONLINE_MATCH_V1__.view.state.units.find(u=>enemyIds.includes(u.id));
   return row&&row.targetX===row.x&&row.targetY===row.y&&!Object.hasOwn(row,'cavalryTargetId');
  },enemyIds)).toBe(true);
  await b.screenshot({path:test.info().outputPath('real-melee-online-mobile.png')});expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
