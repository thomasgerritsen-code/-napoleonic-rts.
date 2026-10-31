const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('desktop France and mobile Britain form mounted regiments through real server commands and keep them on reload',async({browser})=>{
 test.setTimeout(150000);
 let app,simulationPage;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const c=await browser.newContext();contexts.push(c);await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  simulationPage=await c.newPage();simulationPage.on('pageerror',e=>errors.push(e.message));
  await simulationPage.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=mounted-online&gpu=off`);
  await simulationPage.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
  await simulationPage.evaluate(()=>{
   window.__mountedFixture={};
   for(const side of ['france','britain']){
    const h=buildings.find(b=>b.side===side&&b.type==='towncenter'),x=h.x+(side==='france'?500:-500),y=h.y+550;
    const officer=createUnit(side,'officer',x,y);__TROOPS_V1__.applyTroop(officer,'mounted');
    const riders=Array.from({length:4},(_,i)=>{const u=createUnit(side,'cavalry',x+35+i*28,y);__TROOPS_V1__.applyTroop(u,'hussar');return u;});
    __mountedFixture[side]={officer:officer.id,riders:riders.map(u=>u.id)};
   }
  });
  return{close:()=>c.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulationPage.evaluate(args=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(args.commands,args.running,args.snapshot,args.seconds,args.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:1280,height:900}}),cb=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');await expect(a.locator('#onlineServer')).toBeVisible({timeout:30000});await a.click('#onlineHost');
  await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));
  await readyPlayers(a,b);for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  const fixture=await simulationPage.evaluate(()=>__mountedFixture);
  for(const [p,side]of[[a,'france'],[b,'britain']]){
   if(side==='britain'){
    await p.evaluate(()=>{selectedUnits.clear();selectedBuilding=null;units.filter(u=>u.side==='france'&&u.type==='infantry').forEach(u=>selectedUnits.add(u));updateHud(true);});
    expect(await p.locator('#actions').evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft;})).toBeGreaterThan(0);
   }
   await p.evaluate(id=>{selectedUnits.clear();selectedBuilding=null;selectedUnits.add(units.find(u=>u.id===id));updateHud(true);},fixture[side].officer);
   const button=p.locator('[data-action="create-cavalry-regiment"]');await expect(button).toBeEnabled();
   if(side==='britain'){
    const box=await button.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
    await p.screenshot({path:test.info().outputPath('mounted-officer-mobile.png')});
   }
   await button.click();await p.waitForFunction(id=>units.find(u=>u.id===id)?.regimentId,fixture[side].officer);
   const u=await p.evaluate(id=>{const officer=units.find(u=>u.id===id),r=getRegiment(officer.regimentId);selectWholeRegiment(r);issueMove(officer.x+(window.__ONLINE_MATCH_V1__.side==='france'?160:-160),officer.y+60);return{x:officer.x,y:officer.y};},fixture[side].officer);
   await p.waitForFunction(({id,x,y})=>{const officer=units.find(u=>u.id===id);return Math.hypot(officer.x-x,officer.y-y)>8;},{id:fixture[side].officer,...u},{timeout:25000});
  }
  const authoritative=await simulationPage.evaluate(()=>Object.entries(__mountedFixture).map(([side,f])=>{const officer=units.find(u=>u.id===f.officer),r=getRegiment(officer.regimentId);return{side:r.side,kind:r.kind,officer:r.officerId===officer.id,mounted:officer.troop,riders:f.riders.every(id=>r.memberIds.includes(id)),allOwn:regimentMembers(r).every(u=>u.side===side)};}));
  expect(authoritative).toEqual(['france','britain'].map(side=>({side,kind:'cavalry',officer:true,mounted:'mounted',riders:true,allOwn:true})));
  await b.reload();await b.waitForFunction(id=>__ONLINE_MATCH_V1__?.phase==='playing'&&!!units.find(u=>u.id===id)?.regimentId,fixture.britain.officer,{timeout:45000});expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.side)).toBe('britain');expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
