const {test,expect}=require('@playwright/test');
const {readyPlayers}=require('./helpers/online-ready');
const {createServer}=require('../server/index');
test.use({trace:'off'});
test('two connected players build their own mines through the UI and receive authoritative deliveries',async({browser})=>{
  test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
  const host={healthy:()=>true,close:async()=>{},create:async()=>{
    const context=await browser.newContext();contexts.push(context);await context.addInitScript(()=>window.__NRTS_SERVER__=true);
    simulation=await context.newPage();simulation.on('pageerror',e=>errors.push(e.message));
    await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=mining-authority`);await simulation.waitForFunction(()=>window.__MINES_V1__&&window.__ONLINE_SIM_V1__);
    return{close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
  }};
  try{
    app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
    const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),cb=await browser.newContext();contexts.push(ca,cb);
    const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
    await a.goto('/?view=iso&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));await readyPlayers(a,b);
    const sites=await simulation.evaluate(()=>Object.fromEntries(['france','britain'].map(side=>{
      const home=livingBuildings(side).find(b=>b.type==='towncenter'),d=__MINES_V1__.deposits().filter(d=>__MINES_V1__.buildSite(d.x,d.y)).sort((a,b)=>Math.hypot(a.x-home.x,a.y-home.y)-Math.hypot(b.x-home.x,b.y-home.y))[0];return[side,{id:d.id,x:d.x,y:d.y}];
    })));
    for(const [p,side]of[[a,'france'],[b,'britain']]){
      await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');
      await p.evaluate(()=>{selectedUnits.clear();selectedBuilding=null;for(const u of livingUnits('france'))selectedUnits.add(u);updateHud(true);});
      await p.locator('[data-action="build-mine"]').click();
      await p.evaluate(d=>placeBuilding('mine',d.x,d.y),sites[side]);
    }
    for(const p of[a,b]){
      await expect.poll(()=>p.evaluate(()=>buildings.find(b=>b.type==='mine'&&b.side==='france')?.complete),{timeout:45000}).toBe(true);
      await p.evaluate(()=>{selectedUnits.clear();for(const u of livingUnits('france'))selectedUnits.add(u);selectedBuilding=null;updateHud(true);});
      await p.locator('[data-action="mine-assign"]').click();
    }
    for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>economies.france.iron),{timeout:40000}).toBeGreaterThan(100);
    const authority=await simulation.evaluate(()=>['france','britain'].map(side=>({side,iron:economies[side].iron,mines:livingBuildings(side).filter(b=>b.type==='mine').map(b=>({id:b.id,deposit:b.depositId,complete:b.complete})),miners:livingUnits(side).filter(u=>u.mineId).length})));
    const clients=await Promise.all([a,b].map(p=>p.evaluate(()=>({native:__ONLINE_MATCH_V1__.side,iron:economies.france.iron,mine:buildings.find(b=>b.type==='mine'&&b.side==='france')?.depositId,raw:resources.filter(r=>r.type==='iron'&&!r.deposit).length}))));
    for(let i=0;i<2;i++){expect(authority[i].mines).toHaveLength(1);expect(authority[i].mines[0].complete).toBe(true);expect(authority[i].iron).toBeGreaterThan(100);expect(clients[i].mine).toBe(sites[authority[i].side].id);expect(clients[i].raw).toBe(0);}
    console.log('MINING_ONLINE',JSON.stringify({authority,clients}));expect(errors).toEqual([]);
  }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
