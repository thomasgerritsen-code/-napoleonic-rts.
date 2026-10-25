const{test,expect}=require('@playwright/test');
const{createServer}=require('../server/index.js');
const{readyPlayers}=require('./helpers/online-ready.js');
test.use({trace:'off'});
async function setup(browser){
 let app,sim;const contexts=[],errors=[],metrics={created:0,live:0,maxLive:0,closed:0};
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  metrics.created++;metrics.live++;metrics.maxLive=Math.max(metrics.maxLive,metrics.live);
  const c=await browser.newContext();contexts.push(c);await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  const page=await c.newPage();sim=page;page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=lobby&gpu=off`);await page.waitForFunction(()=>window.__ONLINE_SIM_V1__);
  return{close:async()=>{metrics.closed++;metrics.live--;await c.close();},advance:(commands,running,snapshot,seconds,epochs)=>page.evaluate(a=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(a.commands,a.running,a.snapshot,a.seconds,a.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173',maxRooms:1});
 const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`,ca=await browser.newContext(),cb=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(ca,cb);const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
 await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(endpoint));await a.click('#startMultiplayer');await a.fill('#onlineName','Napoleon');await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:30000}).toMatch(/^[A-Z2-9]{8}$/);
 const invite=await a.inputValue('#onlineInvite');
 // Save the guest name before following the invitation, which joins directly.
 await b.goto('/?view=iso');await b.evaluate(()=>localStorage.removeItem('nrts-player-name'));await b.goto(invite);await expect(b.locator('#onlineName')).toBeEnabled({timeout:30000});await b.fill('#onlineName','  Wellington  ');await b.locator('#onlineTitle').click();await expect(b.locator('#onlineName')).toHaveValue('Wellington');
 await Promise.all([a,b].map(p=>expect(p.locator('#onlineReady')).toBeEnabled({timeout:30000})));
 return{a,b,app,errors,metrics,invite,sim:()=>sim,async close(){await app.close();await Promise.all(contexts.map(c=>c.close()));}};
}
test('named mobile players explicitly ready and cancel, see real ping and reconnect without starting a new match',async({browser})=>{
 test.setTimeout(120000);const s=await setup(browser),{a,b}=s;try{
  for(const p of[a,b]){await expect(p.locator('#onlinePlayers')).toContainText('Napoleon');await expect(p.locator('#onlinePlayers')).toContainText('Wellington');expect(await p.evaluate(()=>__ONLINE_MATCH_V1__.phase)).toBe('waiting');expect(await p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.elapsed)).toBe(0);await expect.poll(()=>p.evaluate(()=>__ONLINE_MATCH_V1__.ping)).not.toBeNull();}
  await a.click('#onlineReady');await expect(a.locator('#onlineReady')).toHaveText('Niet gereed');expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.phase)).toBe('waiting');await a.click('#onlineReady');await expect(a.locator('#onlineReady')).toHaveText('Gereed');
  await b.screenshot({path:test.info().outputPath('named-mobile-lobby.png')});await readyPlayers(a,b);for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  await expect.poll(()=>a.evaluate(()=>__ONLINE_MATCH_V1__.view.state.elapsed)).toBeGreaterThan(0);
  const room=await a.inputValue('#onlineRoom');await b.context().setOffline(true);s.app.rooms.get(room).players.britain.ws.terminate();await a.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='paused');await expect(a.locator('#onlinePlayers')).toContainText('Niet verbonden');await expect(a.locator('#onlineStatus')).toContainText('Wellington');
  await b.context().setOffline(false);for(const p of[a,b])await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');expect(s.metrics.created).toBe(1);await expect(b.locator('#onlineName')).toHaveValue('Wellington');await expect.poll(()=>b.evaluate(()=>__ONLINE_MATCH_V1__.ping)).not.toBeNull();expect(s.errors).toEqual([]);
 }finally{await s.close();}
});
test('both real players vote for a fresh match in the same room, keep names and invitation, and ready again',async({browser})=>{
 test.setTimeout(120000);const s=await setup(browser),{a,b}=s;try{
  await readyPlayers(a,b);for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  const oldRoom=await a.inputValue('#onlineRoom');
  await a.evaluate(()=>{selectedUnits.clear();for(const u of units)if(u.side==='france'&&['infantry','officer','drummer'].includes(u.type)&&u.troop!=='mounted')selectedUnits.add(u);makePlayerRegiment();});
  await expect.poll(()=>a.evaluate(()=>__ONLINE_MATCH_V1__.view.state.groups.length)).toBe(1);
  await s.sim().evaluate(()=>{
   const p=__TERRITORIES__.state().points[0],u=units.find(u=>u.side==='france'&&u.type==='cavalry');Object.assign(u,{x:p.x,y:p.y,targetX:p.x,targetY:p.y,reload:99999});
   for(let i=0;i<60;i++)__ONLINE_SIM_V1__.advance([],true,false,.25);
   for(const r of regiments)if(r.side==='france'){r.victories=3;r.rank=2;}
   for(const u of units)if(u.side==='france'&&u.type!=='worker'){u.dead=true;u.hp=0;}for(const b of buildings)if(b.side==='france'&&b.type==='towncenter'){b.dead=true;b.hp=0;}
  });
  for(const p of[a,b])await expect(p.locator('#battleResult')).toBeVisible();await expect(a.locator('#battleRematch')).toBeEnabled();await expect(b.locator('#battleResultTitle')).toHaveText('Overwinning!');
  await a.click('#battleRematch');await expect(a.locator('#battleRematch')).toBeDisabled();await expect(b.locator('#battleRematchStatus')).toContainText('Napoleon');expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.round)).toBe(1);expect(s.metrics.created).toBe(1);
  await b.click('#battleRematch');for(const p of[a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.round===2&&__ONLINE_MATCH_V1__.view?.state.elapsed===0);await expect(p.locator('#onlineLobby')).toBeVisible();await expect(p.locator('#battleResult')).not.toBeVisible();}
  expect(s.metrics).toEqual({created:2,live:1,maxLive:1,closed:1});expect(await a.inputValue('#onlineRoom')).toBe(oldRoom);expect(await a.inputValue('#onlineInvite')).toBe(s.invite);
  for(const p of[a,b]){const fresh=await p.evaluate(()=>({phase:__ONLINE_MATCH_V1__.phase,economy:__ONLINE_MATCH_V1__.view.state.economy,count:__ONLINE_MATCH_V1__.view.state.units.filter(u=>u.side==='france').length,groups:__ONLINE_MATCH_V1__.view.state.groups.length,owners:__ONLINE_MATCH_V1__.view.state.territories.points.map(p=>p.owner),selected:selectedUnits.size,result:__BATTLE__.state().result,corpses:__ISO_VIEW_V1__.stats().corpses}));expect(fresh).toEqual({phase:'waiting',economy:{food:1100,wood:1100,iron:100,popCap:45},count:25,groups:0,owners:[null,null,null],selected:0,result:null,corpses:0});}
  await b.reload();await expect(b.locator('#onlineReady')).toBeEnabled({timeout:30000});expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.round)).toBe(2);await expect(b.locator('#onlineName')).toHaveValue('Wellington');expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.phase)).toBe('waiting');
  await b.screenshot({path:test.info().outputPath('rematch-mobile-lobby.png')});await readyPlayers(a,b);for(const p of[a,b])await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');
  const before=await b.evaluate(()=>{const u=units.find(u=>u.side==='france'&&u.type==='infantry');selectedUnits.clear();selectedUnits.add(u);issueMove(u.x-90,u.y+20);return{id:u.id,x:u.x};});await expect.poll(()=>b.evaluate(id=>__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id)?.x,before.id)).toBeLessThan(before.x-8);expect(s.errors).toEqual([]);
 }finally{await s.close();}
});
