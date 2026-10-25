const {readyPlayers}=require('./helpers/online-ready.js');
const {test,expect}=require('@playwright/test');
const {createServer}=require('../server/index.js');
const WebSocket=require('ws');
let app,endpoint;
test.describe.configure({mode:'serial',timeout:120000});
// Recording every continuous server snapshot in an action trace can dominate
// the simulated clock. Keep explicit state assertions and failure screenshots.
test.use({trace:'off'});
test.beforeAll(async()=>{
  process.env.CHROMIUM_EXECUTABLE_PATH=test.info().project.use.launchOptions?.executablePath||process.env.CHROMIUM_EXECUTABLE_PATH||'';
  if(test.info().project.use.launchOptions?.args?.includes('--no-sandbox'))process.env.CHROMIUM_NO_SANDBOX='1';
  app=await createServer({port:0,bind:'127.0.0.1',allowedOrigins:'http://127.0.0.1:4173'});
  endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`;
});
test.afterAll(async()=>{await app?.close();});
async function poll(page,fn){await expect.poll(()=>page.evaluate(fn),{timeout:20000}).toBeTruthy();}
async function players(browser){
  const france=await browser.newContext({viewport:{width:1280,height:900}}),britain=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const a=await france.newPage(),b=await britain.newPage();
  const errors=[];for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(endpoint));await a.click('#startMultiplayer');await expect(a.locator('#onlineServer')).toHaveValue(endpoint,{timeout:30000});await a.click('#onlineHost');
  await poll(a,()=>window.__ONLINE_MATCH_V1__.stats().room);
  const room=await a.inputValue('#onlineRoom');
  await b.goto(`/?view=iso&test=net&gpu=off&server=${encodeURIComponent(endpoint)}&room=${room}`);
  await readyPlayers(a,b);
  await Promise.all([poll(a,()=>window.__ONLINE_MATCH_V1__.phase==='playing'),poll(b,()=>window.__ONLINE_MATCH_V1__.phase==='playing')]);
  await Promise.all([a.click('#onlineClose'),b.click('#onlineClose')]);
  return {a,b,room,errors,close:async()=>{await app.closeRoom(room);await Promise.all([france.close(),britain.close()]);}};
}

test('two isolated devices host and join a real server; private sides, movement, production and rejected enemy orders',async({browser})=>{
  const p=await players(browser);const {a,b}=p;
  try{
    const initial=await Promise.all([a.evaluate(()=>({side:__ONLINE_MATCH_V1__.side,s:__ONLINE_MATCH_V1__.view.state})),b.evaluate(()=>({side:__ONLINE_MATCH_V1__.side,s:__ONLINE_MATCH_V1__.view.state}))]);
    expect(initial.map(v=>v.side)).toEqual(['france','britain']);
    for(const v of initial){expect(v.s.units.every(u=>u.side==='france'&&u.nativeSide===v.side)).toBe(true);expect(v.s.economy.food).toBeGreaterThan(0);expect(v.s.economies).toBeUndefined();}
    const ownA=initial[0].s.units.find(u=>u.type==='infantry'),ownB=initial[1].s.units.find(u=>u.type==='infantry');
    await a.evaluate(id=>{selectedUnits.clear();selectedUnits.add(units.find(u=>u.id===id));issueMove(units.find(u=>u.id===id).x+90,units.find(u=>u.id===id).y+20);},ownA.id);
    await b.evaluate(id=>{selectedUnits.clear();selectedUnits.add(units.find(u=>u.id===id));issueMove(units.find(u=>u.id===id).x-90,units.find(u=>u.id===id).y+20);},ownB.id);
    await expect.poll(()=>a.evaluate(id=>__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id)?.x,ownA.id),{timeout:15000}).toBeGreaterThan(ownA.x+8);
    await expect.poll(()=>b.evaluate(id=>__ONLINE_MATCH_V1__.view.state.units.find(u=>u.id===id)?.x,ownB.id),{timeout:15000}).toBeLessThan(ownB.x-8);
    // Guessing an unseen enemy's ID does not grant command authority.
    await a.evaluate(id=>__ONLINE_MATCH_V1__.send({v:1,seq:1,type:'move',unitIds:[id],buildingId:null,data:{x:100,y:100}}),ownB.id);
    await expect(a.locator('#onlineStatus')).toContainText('eigen soldaten');
    const before=await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.economy.food);
    await a.evaluate(()=>{selectedUnits.clear();selectedBuilding=buildings.find(b=>b.side==='france'&&b.type==='towncenter');queuePlayerUnit('worker');});
    await poll(a,()=>__ONLINE_MATCH_V1__.view.state.buildings.some(b=>b.queue.some(q=>q.type==='worker')));
    // Workers can deliver food while packets are in flight. The French order
    // must not debit or enqueue production for the British player.
    expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.economy.food)).toBeGreaterThanOrEqual(before);
    expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.buildings.every(b=>b.queue.length===0))).toBe(true);
    await b.evaluate(()=>{selectedUnits.clear();selectedBuilding=buildings.find(b=>b.side==='france'&&b.type==='towncenter');queuePlayerUnit('worker');});
    await poll(b,()=>__ONLINE_MATCH_V1__.view.state.buildings.some(b=>b.queue.some(q=>q.type==='worker')));
    const counts=initial.map(v=>v.s.units.length);
    await expect.poll(()=>a.evaluate(()=>__ONLINE_MATCH_V1__.view.state.units.length),{timeout:20000}).toBeGreaterThan(counts[0]);
    await expect.poll(()=>b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.units.length),{timeout:20000}).toBeGreaterThan(counts[1]);
    expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.units.every(u=>u.nativeSide==='britain'))).toBe(true);
    expect(await b.evaluate(()=>__ISO_GPU_V1__?.stats().active??false)).toBe(false);
    expect(p.errors).toEqual([]);
    await b.screenshot({path:test.info().outputPath('online-iphone.png')});
  }finally{await p.close();}
});

test('a lost connection pauses both players, resumes the same side and refreshes the baseline; reload and safe invitation',async({browser})=>{
  const p=await players(browser),{a,b,room}=p;
  try{
    const ids=await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.units.map(u=>u.id));
    const invite=await a.locator('#onlineInvite').inputValue();expect(invite).toContain(`room=${room}`);expect(invite).not.toContain('token');
    await b.context().setOffline(true);app.rooms.get(room).players.britain.ws.terminate();
    await poll(a,()=>__ONLINE_MATCH_V1__.phase==='paused');
    // Let the already-running bounded batch and its final packet settle first.
    await a.waitForTimeout(750);
    const tick=await a.evaluate(()=>__ONLINE_MATCH_V1__.stats().tick),pausedTime=await a.evaluate(()=>elapsed);await a.waitForTimeout(700);
    expect(await a.evaluate(()=>__ONLINE_MATCH_V1__.stats().tick)).toBe(tick);
    expect(await a.evaluate(()=>elapsed)).toBeCloseTo(pausedTime,8);
    await b.context().setOffline(false);
    await Promise.all([poll(a,()=>__ONLINE_MATCH_V1__.phase==='playing'),poll(b,()=>__ONLINE_MATCH_V1__.phase==='playing')]);
    expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.units.map(u=>u.id))).toEqual(ids);
    await b.reload();await poll(b,()=>__ONLINE_MATCH_V1__.phase==='playing');expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.side)).toBe('britain');
    await b.click('#onlineClose');
    await b.evaluate(()=>{selectedUnits.clear();const u=units.find(u=>u.type==='infantry');selectedUnits.add(u);issueMove(u.x-60,u.y);});
    await poll(b,()=>__ONLINE_MATCH_V1__.view.acknowledgements.some(a=>a.ok));
    await expect.poll(async()=>{const [ta,tb]=await Promise.all([a.evaluate(()=>__ONLINE_MATCH_V1__.stats().tick),b.evaluate(()=>__ONLINE_MATCH_V1__.stats().tick)]);return Math.abs(ta-tb);}).toBeLessThanOrEqual(2);
    await b.evaluate(()=>document.getElementById('resetBtn').click());
    await expect(b.locator('#onlineLobby')).toBeVisible();
    expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.side)).toBe('britain');
    await b.click('#onlineClose');await b.click('#mobileMenuBtn');await b.click('#mainMenuButton');await expect(b.locator('#startMultiplayer')).toBeVisible();
    expect(app.rooms.has(room)).toBe(false);
    expect(p.errors).toEqual([]);
  }finally{await p.close();}
});

async function request(message,origin='http://127.0.0.1:4173'){
  return new Promise((resolve,reject)=>{const ws=new WebSocket(endpoint,{origin});const timer=setTimeout(()=>{ws.terminate();reject(Error('No server response'));},10000);ws.on('open',()=>ws.send(JSON.stringify(message)));ws.on('message',data=>{clearTimeout(timer);const msg=JSON.parse(data);ws.close();resolve(msg);});ws.on('error',e=>{clearTimeout(timer);reject(e);});});
}
test('snapshot visibility follows movement and changed sight range without sharing cached results between sides',async({browser})=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
    const page=await context.newPage();
    await page.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=net&gpu=off`);
    await page.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
    const result=await page.evaluate(()=>{
      for(const u of units){u.x=u.side==='france'?100:900;u.y=100;}
      for(const b of buildings)b.complete=false;
      const enemy=units.find(u=>u.side==='britain'),resource=resources[0];
      enemy.x=190;resource.x=190;resource.y=100;resource.amount=17;resource.maxAmount=99;
      let radius=100;visionRadius=()=>radius;
      const read=()=>__ONLINE_SIM_V1__.advance([],false).views;
      const near=read();enemy.x=210;resource.x=210;const far=read();radius=200;const wider=read();
      return {id:enemy.id,resourceId:resource.id,near,far,wider};
    });
    const visible=view=>view.state.units.some(u=>u.id===result.id);
    const amount=view=>view.state.resources.find(r=>r.id===result.resourceId).amount;
    expect(visible(result.near.france)).toBe(true);
    expect(visible(result.far.france)).toBe(false);
    expect(visible(result.far.britain)).toBe(true);
    expect(visible(result.wider.france)).toBe(true);
    expect([amount(result.near.france),amount(result.far.france),amount(result.wider.france)]).toEqual([17,99,17]);
  }finally{await context.close();}
});
test('simulation transport preserves full views and resets only the resumed connection baseline',async({browser})=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=net&gpu=off`);
    await page.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
    const result=await page.evaluate(()=>{
      const api=__ONLINE_SIM_V1__,codec=NRTS_STATE_DELTA,views={};
      const same=()=>JSON.stringify(views)===JSON.stringify(api.advance([],false).views);
      const first=api.advanceTransport([],false,true,0,{france:1,britain:1});
      for(const side of ['france','britain'])views[side]=codec.merge(null,first.packets[side].packet);
      const fullSame=same();
      const next=api.advanceTransport([],true,true,.1,{france:1,britain:1});
      for(const side of ['france','britain'])views[side]=codec.merge(views[side],next.packets[side].packet);
      const deltaSame=same();
      const resume=api.advanceTransport([],false,true,0,{france:2,britain:1});
      const absent=api.advanceTransport([],false,true,0,{france:2,britain:0});
      const rejoin=api.advanceTransport([],false,true,0,{france:2,britain:2});
      return {fullSame,deltaSame,first:Object.values(first.packets).map(p=>p.packet.type),next:Object.values(next.packets).map(p=>p.packet.type),
        resume:[resume.packets.france.packet.type,resume.packets.britain.packet.type],absent:Object.keys(absent.packets),rejoin:rejoin.packets.britain.packet.type};
    });
    expect(result).toEqual({fullSame:true,deltaSame:true,first:['snapshot','snapshot'],next:['delta','delta'],resume:['snapshot','delta'],absent:['france'],rejoin:'snapshot'});
  }finally{await context.close();}
});
test('indexed combat targeting skips empty map regions while preserving range, tie order, buildings and rebuilt indexes',async({browser})=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
    const page=await context.newPage();
    // Capture the actual index layer before later terrain/LOS decorators. The
    // separate battle test below exercises those decorators in the full game.
    await page.route('**/src/systems/performance/large-army-v1.js*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text())+'\nwindow.__INDEXED_TARGET_TEST__=nearestEnemyEntity;'});
    });
    await page.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=net&gpu=off`);
    await page.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
    const result=await page.evaluate(()=>{
      units.length=buildings.length=regiments.length=0;
      const unit=(id,side,x,y,extra={})=>({id,side,kind:'unit',type:'infantry',x,y,dead:false,routing:false,...extra});
      const query=unit(10,'france',500,500);
      const south=unit(2,'britain',500,660),east=unit(1,'britain',660,500);
      units.push(query,south,east,unit(3,'britain',501,500,{type:'worker'}),unit(4,'britain',502,500,{routing:true}),unit(5,'britain',503,500,{dead:true}));
      buildings.push({id:20,side:'britain',kind:'building',x:700,y:500,complete:true,dead:false},{id:21,side:'britain',kind:'building',x:504,y:500,complete:false,dead:false});
      const rebuild=()=>__LARGE_ARMY_PERFORMANCE_V1__.prepareFrameIndexes();
      const target=(q,r)=>window.__INDEXED_TARGET_TEST__(q,r)?.id??null;
      rebuild();const tie=target(query,250),edge=target(query,160),outside=target(unit(0,'france',-1000,-1000),50),reverse=target(unit(0,'britain',500,510),100);
      south.dead=east.dead=true;rebuild();const building=target(query,250);
      east.dead=false;east.x=510;rebuild();const moved=target(query,250);
      NRTS.events.emit('game:reset');const reset=target(query,250);rebuild();const rebuilt=target(query,250);
      return {tie,edge,outside,reverse,building,moved,reset,rebuilt};
    });
    expect(result).toEqual({tie:1,edge:null,outside:null,reverse:10,building:20,moved:1,reset:20,rebuilt:1});
  }finally{await context.close();}
});
test('real transport rejects foreign origins, invalid sessions, full rooms and protocol mismatch',async({browser})=>{
  const p=await players(browser);
  try{
    await expect(request({type:'join',protocol:1,room:p.room},'https://untrusted.invalid')).rejects.toThrow('403');
    expect((await request({type:'join',protocol:1,room:p.room})).reason).toBe('room-full');
    expect((await request({type:'resume',protocol:1,room:p.room,token:'invalid'})).reason).toBe('invalid-session');
    expect((await request({type:'resume',protocol:1,room:p.room})).reason).toBe('invalid-session');
    // Missing credentials must also fail while the British seat is still empty.
    const waiting=await request({type:'create',protocol:1});expect(waiting.type).toBe('welcome');
    expect((await request({type:'resume',protocol:1,room:waiting.room})).reason).toBe('invalid-session');
    await app.closeRoom(waiting.room);
    expect((await request({type:'join',protocol:999,room:p.room})).reason).toBe('version-mismatch');
    const response=await p.a.request.get(`http://127.0.0.1:${app.address.port}/server/index.js`);expect(response.status()).toBe(404);
    const routeModule=await p.a.request.get(`http://127.0.0.1:${app.address.port}/vendor/yuka/Path.mjs`);expect(routeModule.status()).toBe(200);
    expect(routeModule.headers()['content-type']).toContain('javascript');
  }finally{await p.close();}
});

test('the real authoritative simulation forms both armies, applies combat once, filters enemy secrets and agrees on victory',async({browser})=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${app.address.port}/?view=iso&test=net&gpu=off`);
    await page.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
    const result=await page.evaluate(()=>{
      const api=__ONLINE_SIM_V1__,cmd=(seq,unitIds,type,data,buildingId=null)=>({v:1,seq,unitIds,type,data,buildingId});
      const squads={};
      for(const side of ['france','britain']){
        const home=buildings.find(b=>b.side===side&&b.type==='towncenter');
        squads[side]=[];
        for(let i=0;i<12;i++)squads[side].push(createUnit(side,'infantry',home.x+(side==='france'?150:-150)+i%4*18,home.y+130+Math.floor(i/4)*18).id);
        squads[side].push(createUnit(side,'officer',home.x,home.y+150).id,createUnit(side,'drummer',home.x+20,home.y+150).id);
      }
      const formed=api.advance(['france','britain'].map(side=>({side,command:cmd(1,squads[side],'create-regiment',{kind:'infantry'})})));
      const groupSides=regiments.map(r=>r.side);
      const britishReg=regiments.find(r=>r.side==='britain');
      economies.britain.wood=10000;economies.britain.iron=10000;
      api.advance([{side:'britain',command:cmd(2,britishReg.memberIds,'action',{action:'defend-stance'})}]);
      const britishHome=buildings.find(b=>b.side==='britain'&&b.type==='towncenter');
      const barracks=createBuilding('britain','barracks',britishHome.x,britishHome.y-140,true),oldIds=new Set(units.map(u=>u.id));
      api.advance([{side:'britain',command:cmd(3,[],'train',{unitType:'officer'},barracks.id)}]);
      const woodAfterOrder=economies.britain.wood;
      Math.random=()=>0; // Without the human-player guard, AI picks a mounted officer.
      const home=buildings.find(b=>b.side==='france'&&b.type==='towncenter');
      // Keep the controlled two-shooter battle clear of the starting roster.
      // Equalised spawn formations can otherwise supply a closer target.
      const a=createUnit('france','infantry',WORLD.width*.55,WORLD.height*.12),b=createUnit('britain','infantry',WORLD.width*.55+60,WORLD.height*.12);
      a.hp=a.maxHp=b.hp=b.maxHp=10000;a.reload=b.reload=0;
      const hidden=units.find(u=>u.side==='britain'&&u.id!==b.id&&!squads.britain.includes(u.id));
      b.task='private-task';b.resourceTarget=resources[0];
      // Capture the shared view while both shooters are visible. Later morale
      // loss can correctly send the British soldier back into the fog.
      let battle;
      for(let i=0;i<1200;i++){
        api.advance([],true,false);
        if(!battle&&a.hp<10000&&b.hp<10000){const candidate=api.advance([],false);if(candidate.views.france.state.units.some(u=>u.id===b.id))battle=candidate;}
      }
      const av=battle.views.france.state,bv=battle.views.britain.state;
      const enemy=av.units.find(u=>u.id===b.id),own=bv.units.find(u=>u.id===b.id);
      const damage={a:a.hp,b:b.hp};
      const newOfficer=units.find(u=>u.side==='britain'&&u.type==='officer'&&!oldIds.has(u.id));
      const humanControl={defend:britishReg.defend,wood:economies.britain.wood,woodAfterOrder,expectedWoodAfterOrder:10000-TRAINING.officer.cost.wood,officerExists:!!newOfficer,officerTroop:newOfficer?.troop||null,
        trenches:__REGIMENT_ORDERS_V1__.trenches().filter(t=>t.side==='britain').map(t=>({level:t.level,upgrade:!!t.upgrade}))};
      b.x=home.x+120;b.y=home.y+70;
      for(const u of units)if(u.side==='britain'&&u.type!=='worker')u.dead=true;
      for(const t of buildings)if(t.side==='britain'&&t.type==='towncenter')t.dead=true;
      const victory=api.advance();
      return {formed:formed.receipts.every(r=>r.ok),groupSides,damage,enemy,own,humanControl,hiddenVisible:av.units.some(u=>u.id===hidden.id),
        economyKeys:Object.keys(av).filter(k=>/econom/.test(k)),victory:[victory.views.france.state.winner,victory.views.britain.state.winner],
        deadVisible:victory.views.france.state.deaths.includes(b.id),ids:[a.id,b.id]};
    });
    expect(result.formed).toBe(true);expect(result.groupSides).toContain('france');expect(result.groupSides).toContain('britain');
    expect(result.damage.a).toBeLessThan(10000);expect(result.damage.b).toBeLessThan(10000);
    expect(result.enemy.hp).toBe(result.own.hp);expect(result.enemy.nativeSide).toBe('britain');expect(result.enemy.side).toBe('britain');expect(result.own.side).toBe('france');
    expect(result.enemy.task).toBeUndefined();expect(result.enemy.resourceTarget).toBeUndefined();expect(result.hiddenVisible).toBe(false);
    expect(result.humanControl.defend).toBe(true);
    expect(result.humanControl.woodAfterOrder).toBe(result.humanControl.expectedWoodAfterOrder);
    // Gathering continues during battle; assert the actual absence of automatic
    // upgrades rather than treating legitimate resource income as a failure.
    expect(result.humanControl.trenches.length).toBeGreaterThan(0);
    expect(result.humanControl.trenches.every(t=>t.level===1&&!t.upgrade)).toBe(true);
    expect(result.humanControl.officerExists).toBe(true);expect(result.humanControl.officerTroop).toBeNull();
    expect(result.economyKeys).toEqual(['economy']);expect(result.victory).toEqual(['france','france']);expect(result.deadVisible).toBe(true);expect(errors).toEqual([]);
  }finally{await context.close();}
});
