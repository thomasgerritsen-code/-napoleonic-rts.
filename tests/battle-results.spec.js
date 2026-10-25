const {readyPlayers}=require('./helpers/online-ready.js');
const {test,expect}=require('@playwright/test');
const {createServer}=require('../server/index.js');
test.use({trace:'off'});
test('actual authority captures three areas, resets challenged countdown, awards Britain and freezes final statistics',async({browser})=>{
 test.setTimeout(60000);const c=await browser.newContext();await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/play.html?view=iso&test=battle-state&gpu=off');await page.waitForFunction(()=>window.__BATTLE__&&window.__ONLINE_SIM_V1__&&window.__TERRITORIES__);
  const r=await page.evaluate(()=>{
   const api=__ONLINE_SIM_V1__,read=()=>api.advance([],false).views;
   const advance=t=>{for(let i=0;i<Math.round(t/.25);i++)api.advance([],true,false,.25);};
   const points=__TERRITORIES__.state().points,army=units.filter(u=>u.side==='britain'&&u.type==='infantry');
   const move=(u,p,dx=0)=>Object.assign(u,{x:p.x+dx,y:p.y,targetX:p.x+dx,targetY:p.y,reload:99999});
   points.forEach((p,i)=>move(army[i],p));advance(15);const captured=read();advance(60);const halfway=read();
   const f=units.find(u=>u.side==='france'&&u.type==='cavalry');move(f,points[0]);advance(.25);const challenged=read();move(f,points[0],500);advance(.25);const restarted=read();
   advance(119.75);const before=read();advance(.25);const final=read();const frozen=JSON.stringify(final.france.state.battle.result),end=elapsed;
   api.advance([],true,true,.25);api.advance([],false,true,0);const unchanged=elapsed===end&&JSON.stringify(read().france.state.battle.result)===frozen;
   const tc=buildings.find(b=>b.side==='france'&&b.type==='towncenter');const cmd=api.advance([{side:'france',command:{v:1,seq:1,type:'train',unitIds:[],buildingId:tc.id,data:{unitType:'worker'}}}],true,true,.05);const queue=tc.queue.length;
   resetGame();const reset=__BATTLE__.state();return{captured,halfway,challenged,restarted,before,final,unchanged,queue,cmd,reset};
  });
  expect(r.captured.france.state.battle.heldSeconds).toBe(0);expect(r.halfway.france.state.battle.heldSeconds).toBe(60);
  expect(r.challenged.france.state.battle.controlSide).toBeNull();expect(r.challenged.france.state.battle.heldSeconds).toBe(0);expect(r.restarted.france.state.battle.heldSeconds).toBe(0);
  expect(r.before.france.state.gameOver).toBe(false);expect(r.before.france.state.battle.heldSeconds).toBe(119.75);
  expect(r.final.france.state.winner).toBe('britain');expect(r.final.britain.state.winner).toBe('britain');expect(r.final.france.state.battle).toEqual(r.final.britain.state.battle);
  expect(r.final.france.state.battle.result.reason).toBe('territories');expect(r.final.france.state.battle.result.stats.britain).toMatchObject({trained:0,unitsLost:0,unitsRemaining:25,territories:3});
  expect(r.unchanged).toBe(true);expect(r.queue).toBe(0);expect(r.cmd.views.france.acknowledgements.at(-1).ok).toBe(false);expect(r.reset.result).toBeNull();expect(r.reset.heldSeconds).toBe(0);expect(errors).toEqual([]);
 }finally{await c.close();}
});

test('mobile singleplayer result is readable, reflects actual losses and training and starts a clean new match',async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/play.html?view=iso&test=battle-ui&gpu=off');await page.waitForFunction(()=>window.__BATTLE__&&window.__TERRITORIES__&&window.__ISO_ASSETS_READY__);
  await page.click('#territoriesButton');await expect(page.locator('#battleRules')).toContainText('2 minuten');await expect(page.locator('#battleProgress')).toContainText('alle 3');await page.click('#territoriesClose');
  await page.evaluate(()=>{
   const p=units.find(u=>u.side==='france'&&u.type==='worker');createUnit('france','worker',p.x+20,p.y);checkVictory();p.dead=true;p.hp=0;
   for(const u of units)if(u.side==='britain'&&u.type!=='worker'){u.dead=true;u.hp=0;}
   for(const b of buildings)if(b.side==='britain'&&b.type==='towncenter'){b.dead=true;b.hp=0;}
   checkVictory();
  });
  await expect(page.locator('#battleResult')).toBeVisible();await expect(page.locator('#battleResultTitle')).toHaveText('Overwinning!');await expect(page.locator('#battleResultReason')).toContainText('hoofdkwartier');
  await expect(page.locator('#battle-france-trained')).toHaveText('1');await expect(page.locator('#battle-france-unitsLost')).toHaveText('1');await expect(page.locator('#battle-britain-unitsLost')).toHaveText('19');await expect(page.locator('#battle-britain-unitsRemaining')).toHaveText('6');
  const layout=await page.locator('#battleResult').evaluate(el=>({fits:el.scrollWidth<=el.clientWidth,buttons:[...el.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>b.getBoundingClientRect().height)}));expect(layout.fits).toBe(true);expect(layout.buttons.every(h=>h>=44)).toBe(true);
  await page.screenshot({path:test.info().outputPath('battle-result-mobile.png')});await page.click('#battleAgain');await expect(page.locator('#battleResult')).not.toBeVisible();expect(await page.evaluate(()=>({over:gameOver,result:__BATTLE__.state().result,counts:['france','britain'].map(s=>livingUnits(s).length)}))).toEqual({over:false,result:null,counts:[25,25]});expect(errors).toEqual([]);
 }finally{await c.close();}
});

test('real online opponents agree on final outcome, frozen statistics and resumed British result',async({browser})=>{
 test.setTimeout(90000);let app,sim;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const c=await browser.newContext();contexts.push(c);await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});sim=await c.newPage();sim.on('pageerror',e=>errors.push(e.message));
  await sim.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=battle-net&gpu=off`);await sim.waitForFunction(()=>window.__ONLINE_SIM_V1__&&window.__BATTLE__);
  return{close:()=>c.close(),advance:(commands,running,snapshot,seconds,epochs)=>sim.evaluate(a=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(a.commands,a.running,a.snapshot,a.seconds,a.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`;
  const ca=await browser.newContext(),cb=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(ca,cb);const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(endpoint));await a.click('#startMultiplayer');await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:30000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));
  await readyPlayers(a,b);
  for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  for(const p of[a,b])expect(await p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.battle)).toEqual({holdSeconds:120,controlSide:null,heldSeconds:0,result:null});
  expect(await b.evaluate(()=>{const tc=buildings.find(b=>b.side==='france'&&b.type==='towncenter');selectedBuilding=tc;return queuePlayerUnit('worker');})).toBe(true);
  await expect.poll(()=>b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.units.filter(u=>u.side==='france').length),{timeout:15000}).toBe(26);
  await sim.evaluate(()=>{for(const u of units)if(u.side==='france'&&u.type!=='worker'){u.dead=true;u.hp=0;}for(const b of buildings)if(b.side==='france'&&b.type==='towncenter'){b.dead=true;b.hp=0;}});
  for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='finished');await expect(p.locator('#battleResult')).toBeVisible();}
  await expect(a.locator('#battleResultTitle')).toHaveText('Nederlaag');await expect(b.locator('#battleResultTitle')).toHaveText('Overwinning!');await expect(b.locator('#battleAgain')).not.toBeVisible();await expect(b.locator('#battle-britain-trained')).toHaveText('1');
  const results=await Promise.all([a,b].map(p=>p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.battle.result)));expect(results[0]).toEqual(results[1]);expect(results[1].winner).toBe('britain');
  await b.reload();await b.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='finished');await expect(b.locator('#battleResultTitle')).toHaveText('Overwinning!');expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.battle.result)).toEqual(results[1]);
  await b.screenshot({path:test.info().outputPath('battle-result-online-mobile.png')});await b.click('#battleMenu');await expect(b.locator('#startMultiplayer')).toBeVisible();await expect.poll(()=>app.rooms.size).toBe(0);expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close()));}
});
