const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('two connected players build logging camps through the UI and receive wood deliveries',async({browser})=>{
  test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
  const host={healthy:()=>true,close:async()=>{},create:async()=>{
    const context=await browser.newContext();contexts.push(context);await context.addInitScript(()=>window.__NRTS_SERVER__=true);
    simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
    await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=logging-authority`);await simulation.waitForFunction(()=>window.__LUMBER_V1__&&window.__ONLINE_SIM_V1__);
    return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
  }};
  try{
    app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
    const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),cb=await browser.newContext();contexts.push(ca,cb);
    const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
    await a.goto('/?view=iso&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));await readyPlayers(a,b);
    const sites=await simulation.evaluate(()=>Object.fromEntries(['france','britain'].map(side=>[side,__LUMBER_V1__.findSite(side)])));
    for(const [p,side]of[[a,'france'],[b,'britain']]){
      await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');
      await p.evaluate(()=>{selectedUnits.clear();selectedBuilding=null;for(const u of livingUnits('france'))selectedUnits.add(u);updateHud(true);});
      await p.locator('[data-action="build-lumbercamp"]').click();
      await p.evaluate(d=>placeBuilding('lumbercamp',d.x,d.y),sites[side]);
    }
    for(const p of[a,b]){
      await expect.poll(()=>p.evaluate(()=>buildings.find(b=>b.type==='lumbercamp'&&b.side==='france')?.complete),{timeout:45000}).toBe(true);
      await p.evaluate(()=>{selectedUnits.clear();for(const u of livingUnits('france'))selectedUnits.add(u);selectedBuilding=null;updateHud(true);});
      await p.locator('[data-action="lumber-assign"]').click();
    }
    for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>economies.france.wood),{timeout:40000}).toBeGreaterThan(980);
    const authority=await simulation.evaluate(()=>['france','britain'].map(side=>({side,wood:economies[side].wood,camps:livingBuildings(side).filter(b=>b.type==='lumbercamp').map(b=>({id:b.id,complete:b.complete})),loggers:livingUnits(side).filter(u=>u.lumberCampId).length})));
    const clients=await Promise.all([a,b].map(p=>p.evaluate(()=>({native:__ONLINE_MATCH_V1__.side,wood:economies.france.wood,camp:buildings.find(b=>b.type==='lumbercamp'&&b.side==='france')?.id,raw:resources.filter(r=>r.type==='iron'&&!r.deposit).length}))));
    for(let i=0;i<2;i++){expect(authority[i].camps).toHaveLength(1);expect(authority[i].camps[0].complete).toBe(true);expect(authority[i].wood).toBeGreaterThan(980);expect(clients[i].camp).toBe(authority[i].camps[0].id);expect(clients[i].raw).toBe(0);}
    console.log('LOGGING_ONLINE',JSON.stringify({authority,clients}));expect(errors).toEqual([]);
  }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
