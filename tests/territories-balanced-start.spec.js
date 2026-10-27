const {readyPlayers}=require('./helpers/online-ready.js');
const {test,expect}=require('@playwright/test');
const {createServer}=require('../server/index.js');
test.use({trace:'off'});
test('balanced authoritative starts, fair supply positions, capture and contested income survive pause and reset',async({browser})=>{
 const c=await browser.newContext();await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
 const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/play.html?view=iso&test=territories&gpu=off');await page.waitForFunction(()=>!!window.__ONLINE_SIM_V1__&&!!window.__TERRITORIES__);
  const result=await page.evaluate(()=>{
   const api=__ONLINE_SIM_V1__,read=()=>api.advance([],false).views,initial=read();
   const start=Object.fromEntries(['france','britain'].map(side=>[side,{economy:initial[side].state.economy,
    roster:initial[side].state.units.map(u=>({type:u.type,troop:u.troop||null,hp:u.hp,maxHp:u.maxHp,task:u.task})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    building:initial[side].state.buildings.map(b=>({type:b.type,hp:b.hp,maxHp:b.maxHp,complete:b.complete}))}]));
   const zones=__TERRITORIES__.state(),homes=['france','britain'].map(side=>buildings.find(b=>b.type==='towncenter'&&b.side===side));
   const placements=zones.points.map(p=>({dry:!waterAtV067(p.x,p.y),open:__UNIT_PLACEMENT__.clear(p,'cavalry'),gap:Math.abs(Math.hypot(p.x-homes[0].x,p.y-homes[0].y)-Math.hypot(p.x-homes[1].x,p.y-homes[1].y))}));
   const separation=Math.min(...zones.points.flatMap((p,i)=>zones.points.slice(i+1).map(q=>Math.hypot(p.x-q.x,p.y-q.y))));
   const frontSpan=zones.points[2].y-zones.points[0].y;
   const move=(u,p)=>{Object.assign(u,{x:p.x,y:p.y,targetX:p.x,targetY:p.y,reload:99999});};
   const f=createUnit('france','infantry',zones.points[0].x,zones.points[0].y),b=createUnit('britain','infantry',zones.points[2].x,zones.points[2].y);
   move(f,zones.points[0]);move(b,zones.points[2]);
   const advance=t=>{for(let i=0;i<Math.round(t/.25);i++)api.advance([],true,false,.25);};
   advance(14.75);const before=__TERRITORIES__.state();advance(.25);const captured=read();advance(2);const earned=read();
   const challenger=createUnit('britain','cavalry',zones.points[0].x,zones.points[0].y);move(challenger,zones.points[0]);advance(2);const contested=read();
   move(f,{x:zones.points[0].x+500,y:zones.points[0].y});advance(15);const recaptured=read();advance(1);const britishIncome=read();
   const pausedBefore=JSON.stringify(read());api.advance([],false,true,.25);const pausedSame=JSON.stringify(read())===pausedBefore;
   resetGame();const reset={zones:__TERRITORIES__.state(),counts:['france','britain'].map(side=>units.filter(u=>u.side===side&&!u.dead).length),economies:JSON.parse(JSON.stringify(economies))};
   return{start,placements,separation,frontSpan,before,captured,earned,contested,recaptured,britishIncome,pausedSame,reset};
  });
  expect(result.start.france).toEqual(result.start.britain);expect(result.start.france.economy).toEqual({food:1100,wood:1100,iron:100,popCap:45});
  expect(result.start.france.roster).toHaveLength(6);expect(result.start.france.roster.every(u=>u.type==='worker')).toBe(true);
  expect(result.start.france.roster.every(u=>u.task===null)).toBe(true);for(const p of result.placements){expect(p.dry).toBe(true);expect(p.open).toBe(true);expect(p.gap).toBeLessThan(.001);}
  expect(result.separation).toBeGreaterThanOrEqual(1700);expect(result.frontSpan).toBeGreaterThan(3500);
  console.log('SUPPLY_FRONTS',JSON.stringify({placements:result.placements,separation:result.separation,frontSpan:result.frontSpan}));
  expect(result.before.points.every(p=>p.owner===null)).toBe(true);
  expect(result.captured.france.state.territories.points.map(p=>p.owner)).toEqual(['france',null,'britain']);
  expect(result.captured.france.state.territories).toEqual(result.captured.britain.state.territories);
  expect(result.earned.france.state.economy.food-result.captured.france.state.economy.food).toBeCloseTo(6,5);
  expect(result.earned.britain.state.economy.iron-result.captured.britain.state.economy.iron).toBeCloseTo(2,5);
  expect(result.contested.france.state.territories.points[0].contested).toBe(true);expect(result.contested.france.state.economy.food).toBe(result.earned.france.state.economy.food);
  expect(result.recaptured.france.state.territories.points[0].owner).toBe('britain');
  expect(result.britishIncome.britain.state.economy.food-result.recaptured.britain.state.economy.food).toBeCloseTo(3,5);
  expect(result.pausedSame).toBe(true);expect(result.reset.counts).toEqual([6,6]);expect(result.reset.zones.points.every(p=>p.owner===null)).toBe(true);
  expect(result.reset.economies.france).toEqual(result.reset.economies.britain);expect(errors).toEqual([]);
 }finally{await c.close();}
});

test('mobile players can find supply flags, capture them and inspect their resource income',async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/play.html?view=iso&test=territories-ui&gpu=off');await page.waitForFunction(()=>window.__TERRITORIES__&&window.__BALANCED_START__&&window.__ISO_ASSETS_READY__===true);
  expect(await page.evaluate(()=>aiStrategicTarget().kind)).toBe('control-point');
  const button=page.locator('#territoriesButton');await expect(button).toBeVisible();await button.click();await expect(page.locator('#territoriesPanel')).toBeVisible();
  await expect(page.locator('#territoriesPanel article')).toHaveCount(3);await page.click('[data-territory="estate"]');await expect(page.locator('#territoriesPanel')).not.toBeVisible();
  await expect.poll(()=>page.evaluate(()=>__ISO_VIEW_V1__.stats().territories)).toBeGreaterThan(0);
  const captured=await page.evaluate(()=>{
   const p=__TERRITORIES__.state().points[0],u=createUnit('france','infantry',p.x,p.y);
   Object.assign(u,{x:p.x,y:p.y,targetX:p.x,targetY:p.y,reload:99999});__RTS_DEBUG__.tick(15);
   return __TERRITORIES__.state().points[0].owner;
  });expect(captured).toBe('france');await expect(button).toContainText('1–0');await button.click();
  await expect(page.locator('#territoriesPanel article').first()).toContainText('Frankrijk');await expect(page.locator('#territoriesPanel article').first()).toContainText('+3');
  await page.screenshot({path:test.info().outputPath('territories-mobile-panel.png')});await page.click('#territoriesClose');
  await page.screenshot({path:test.info().outputPath('territory-mobile-flag.png')});expect(errors).toEqual([]);
 }finally{await c.close();}
});

test('two real online players capture supplies by movement orders, see canonical owners and keep territories after reconnect',async({browser})=>{
 test.setTimeout(120000);let app,sim;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const c=await browser.newContext();contexts.push(c);await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  sim=await c.newPage();sim.on('pageerror',e=>errors.push(e.message));await sim.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=territories-net&gpu=off`);
  await sim.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
  await sim.evaluate(()=>{
   const points=__TERRITORIES__.state().points;
   const move=(u,p,dx)=>Object.assign(u,{x:p.x+dx,y:p.y,targetX:p.x+dx,targetY:p.y,reload:99999});
   move(createUnit('france','infantry',points[0].x+230,points[0].y),points[0],230);
   move(createUnit('britain','infantry',points[2].x+230,points[2].y),points[2],230);
   // Stage the challenger on the other side: placing it only 170 units from
   // the first capturer makes that infantry stop to aim before entering the post.
   move(createUnit('britain','cavalry',points[0].x-400,points[0].y),points[0],-400);
  });
  return{close:()=>c.close(),advance:(commands,running,snapshot,seconds,epochs)=>sim.evaluate(a=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(a.commands,a.running,a.snapshot,a.seconds,a.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`,ca=await browser.newContext(),cb=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(ca,cb);
  const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(endpoint));await a.click('#startMultiplayer');await a.click('#onlineHost');
  await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:30000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));
  await readyPlayers(a,b);
  for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  const order=(page,index,type)=>page.evaluate(({index,type})=>{
   const p=__ONLINE_MATCH_V1__.view.state.territories.points[index];
   const u=units.filter(u=>u.side==='france'&&u.type===type).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
   selectedUnits.clear();selectedUnits.add(u);issueMove(p.x,p.y);
  },{index,type});
  await order(a,0,'infantry');await order(b,2,'infantry');
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.territories.points.map(p=>p.owner)),{timeout:35000}).toEqual(['france',null,'britain']);
  await expect.poll(()=>a.evaluate(()=>__ONLINE_MATCH_V1__.view.state.economy.food),{timeout:10000}).toBeGreaterThan(1103);
  await expect.poll(()=>b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.economy.iron),{timeout:10000}).toBeGreaterThan(101);
  await order(b,0,'cavalry');
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.territories.points[0].contested),{timeout:12000}).toBe(true);
  const before=await a.evaluate(()=>({food:__ONLINE_MATCH_V1__.view.state.economy.food,elapsed:__ONLINE_MATCH_V1__.view.state.elapsed}));
  await expect.poll(()=>a.evaluate(t=>__ONLINE_MATCH_V1__.view.state.elapsed-t,before.elapsed)).toBeGreaterThan(1);
  expect(await a.evaluate(()=>__ONLINE_MATCH_V1__.view.state.economy.food)).toBe(before.food);
  await b.reload();await b.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await b.click('#onlineClose');
  const views=await Promise.all([a,b].map(p=>p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.territories)));
  expect(views[0]).toEqual(views[1]);expect(views[1].points.map(p=>p.owner)).toEqual(['france',null,'britain']);
  await b.click('#territoriesButton');await expect(b.locator('#territoriesPanel article').last()).toContainText('Groot-Brittannië');
  await b.screenshot({path:test.info().outputPath('territories-online-mobile.png')});
  expect(await b.evaluate(()=>NRTS_COMMAND_PROTOCOL.normalize({v:1,seq:999,type:'capture-territory',unitIds:[1],buildingId:null,data:{owner:'britain'}}).ok)).toBe(false);
  expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close()));}
});
