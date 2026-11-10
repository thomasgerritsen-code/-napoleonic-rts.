const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function startAuthority(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__NRTS_SERVER__=true;});
  await page.goto('/play.html?view=iso&test=mining');
  await page.waitForFunction(()=>window.__MINES_V1__&&window.__ONLINE_SIM_V1__);
  return errors;
}
test('iron requires a paid mine on a deposit, completed construction and real worker deliveries',async({page})=>{
  const errors=await startAuthority(page);
  const r=await page.evaluate(()=>{
    const api=__MINES_V1__,d=api.deposits()[0],capacity=d.amount,ws=livingUnits('france'),u=ws[0],wood=economies.france.wood;
    selectedUnits.clear();selectedUnits.add(u);
    const raw=resources.filter(r=>r.type==='iron'&&!r.deposit).length,initial=assignGather(d);
    // Even a stale legacy gather task cannot bypass the geological prerequisite.
    u.task='gather';u.resourceTarget=d;u.x=d.x;u.y=d.y;updateWorker(u,1);
    const bypass={carry:u.carry,amount:d.amount};
    const offsite=constructBuilding('france','mine',300,300,ws),afterOffsite=economies.france.wood;
    const b=constructBuilding('france','mine',d.x+20,d.y+10,ws);
    if(!b)throw Error('No mine construction');
    const paid=wood-economies.france.wood,snapped=b.x===d.x&&b.y===d.y;
    const duplicate=constructBuilding('france','mine',d.x,d.y,ws),early=api.assign(u,d);
    const afterDuplicate=economies.france.wood;
    let ticks=0;for(;ticks<800&&!b.complete;ticks++)RTS_SIM.step(.25);
    const completed=b.complete,atCompletion=d.amount;
    for(let i=0;i<1200&&economies.france.iron===100;i++)RTS_SIM.step(.25);
    const delivered=economies.france.iron-100,mined=capacity-d.amount;
    const conserved=economies.france.iron-100+ws.reduce((n,u)=>n+(u.carryType==='iron'?u.carry:0),0)===mined;
    const enemy=api.assign(livingUnits('britain')[0],d);
    // Destroying the mine ends extraction, but ore already carried is delivered.
    b.dead=true;const remaining=d.amount,carried=ws.reduce((n,u)=>n+u.carry,0),before=economies.france.iron;
    for(let i=0;i<600;i++)RTS_SIM.step(.25);
    const destroyed={amount:d.amount,remaining,gain:economies.france.iron-before,carried,active:ws.some(u=>u.task==='mine'),pending:ws.filter(u=>u.carry>0).map(u=>({id:u.id,carry:u.carry,task:u.task,x:u.x,y:u.y,tx:u.targetX,ty:u.targetY,avoid:u.localAvoidanceV2}))};
    const replacement=constructBuilding('france','mine',d.x,d.y,ws);
    for(let i=0;i<600&&!replacement.complete;i++)RTS_SIM.step(.25);
    // A small final seam verifies finite reserves and delivery of a partial load.
    for(const w of ws)stopWorkerAtCurrentPosition(w);
    d.amount=7;const beforeLast=economies.france.iron;api.assign(u,d);
    for(let i=0;i<1000&&(d.amount>0||ws.some(w=>w.carry>0||w.task==='mine'));i++)RTS_SIM.step(.25);
    const exhausted={amount:d.amount,dead:d.dead,gain:economies.france.iron-beforeLast,assign:api.assign(u,d),duplicate:validBuildingSpot('mine',d.x,d.y)};
    const finalWorkers=ws.map(u=>({id:u.id,carry:u.carry,task:u.task,x:u.x,y:u.y}));
    resetGame();return{raw,initial,bypass,offsite:!!offsite,wood,afterOffsite,paid,snapped,duplicate:!!duplicate,early,afterDuplicate,completed,atCompletion,capacity,delivered,mined,conserved,enemy,destroyed,exhausted,finalWorkers,reset:{mines:api.stats().mines,raw:resources.filter(r=>r.type==='iron'&&!r.deposit).length,capacity:api.deposits().reduce((n,r)=>n+r.amount,0),workers:livingUnits('france').map(u=>u.type)}};
  });
  console.log('MINING_LIFECYCLE',JSON.stringify(r));
  expect(r.raw).toBe(0);expect(r.initial).toBe(false);expect(r.bypass).toEqual({carry:0,amount:r.capacity});expect(r.offsite).toBe(false);expect(r.afterOffsite).toBe(r.wood);
  expect(r.paid).toBe(250);expect(r.snapped).toBe(true);expect(r.duplicate).toBe(false);expect(r.early).toBe(false);expect(r.afterDuplicate).toBe(r.wood-250);
  expect(r.completed).toBe(true);expect(r.atCompletion).toBe(r.capacity);expect(r.delivered).toBeGreaterThanOrEqual(25);expect(r.conserved).toBe(true);expect(r.enemy).toBe(false);
  expect(r.destroyed.amount).toBe(r.destroyed.remaining);expect(r.destroyed.gain).toBe(r.destroyed.carried);expect(r.destroyed.active).toBe(false);
  expect(r.exhausted).toEqual({amount:0,dead:false,gain:7,assign:false,duplicate:false});expect(r.reset.mines).toBe(0);expect(r.reset.raw).toBe(0);expect(r.reset.capacity).toBeGreaterThan(0);expect(r.reset.workers).toEqual(Array(6).fill('worker'));
  expect(errors).toEqual([]);
});
test('native authority validates mines and gathering independently for both players',async({page})=>{
  const errors=await startAuthority(page);
  const r=await page.evaluate(()=>{
    const api=__MINES_V1__,seq={france:0,britain:0},results=[];
    function command(side,type,data,ws){
      const command={v:1,seq:++seq[side],type,unitIds:ws.map(u=>u.id),buildingId:null,data};
      const result=__ONLINE_SIM_V1__.advance([{side,command}],true,true,.05);
      return {receipts:result.views[side].acknowledgements.filter(a=>a.seq===command.seq)};
    }
    for(const side of['france','britain']){
      const ws=livingUnits(side),home=nearestTownCenter(side,ws[0].x,ws[0].y),d=api.deposits().filter(d=>api.buildSite(d.x,d.y)).sort((a,b)=>Math.hypot(a.x-home.x,a.y-home.y)-Math.hypot(b.x-home.x,b.y-home.y))[0];
      const gather=()=>command(side,'gather',{resourceId:d.id},ws);
      const before=gather();
      const off=command(side,'build',{buildingType:'mine',x:300,y:300},ws);
      const w=economies[side].wood,build=command(side,'build',{buildingType:'mine',x:d.x,y:d.y},ws),b=buildings.find(b=>b.type==='mine'&&b.side===side);
      const early=gather();
      for(let i=0;i<1000&&!b?.complete;i++)__ONLINE_SIM_V1__.advance([],true,false,.25);
      const start=economies[side].iron,accepted=gather();
      for(let i=0;i<1000&&economies[side].iron===start;i++)__ONLINE_SIM_V1__.advance([],true,false,.25);
      const view=__ONLINE_SIM_V1__.advance([],false,true).views[side].state;
      results.push({side,before:before.receipts,off:off.receipts,build:build.receipts,early:early.receipts,accepted:accepted.receipts,paid:w-economies[side].wood,complete:b?.complete,sideActual:b?.side,delivered:economies[side].iron-start,replica:view.buildings.find(v=>v.id===b.id),deposit:view.resources.find(v=>v.id===d.id)});
    }
    const enemyMine=buildings.find(b=>b.type==='mine'&&b.side==='britain'),enemy=command('france','gather',{resourceId:enemyMine.depositId},livingUnits('france'));
    return{results,enemy:enemy.receipts};
  });
  for(const row of r.results){
    for(const key of['before','off','early'])expect(row[key][0].ok,key+' '+row.side).toBe(false);
    expect(row.build[0].ok).toBe(true);expect(row.accepted[0].ok).toBe(true);expect(row.paid).toBe(250);expect(row.complete).toBe(true);expect(row.sideActual).toBe(row.side);expect(row.delivered).toBeGreaterThanOrEqual(25);expect(row.replica.type).toBe('mine');expect(row.replica.depositId).toBe(row.deposit.id);expect(row.deposit.deposit).toBe(true);
  }
  expect(r.enemy[0].ok).toBe(false);console.log('MINING_AUTHORITY',JSON.stringify(r));expect(errors).toEqual([]);
});
test('singleplayer AI builds its mine before any extraction and delivers ore normally',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/play.html?view=iso&gpu=off&test=mining-ai');await page.waitForFunction(()=>window.__MINES_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
  const r=await page.evaluate(()=>{let first=null,unsafe=false,delivery=null;for(let i=0;i<2000&&!delivery;i++){
    const before=economies.britain.iron,carriers=livingUnits('britain').filter(u=>u.mineId&&u.carryType==='iron'&&u.carry>0).map(u=>({u,amount:u.carry}));
    RTS_SIM.step(.25);const m=livingBuildings('britain').find(b=>b.type==='mine');if(m&&!first)first={at:elapsed,complete:m.complete};
    for(const d of __MINES_V1__.deposits())if(d.amount<d.maxAmount&&!__MINES_V1__.mineFor(d,'britain'))unsafe=true;
    const arrived=carriers.find(v=>!v.u.dead&&v.u.carry===0);if(arrived&&m?.complete)delivery={at:elapsed,amount:arrived.amount,stockBefore:before,stockAfter:economies.britain.iron};
  }return{first,unsafe,delivery,complete:livingBuildings('britain').find(b=>b.type==='mine')?.complete};});
  console.log('MINING_AI',JSON.stringify(r));expect(r.first?.at).toBeGreaterThanOrEqual(70);expect(r.first.complete).toBe(false);expect(r.unsafe).toBe(false);expect(r.complete).toBe(true);expect(r.delivery?.amount).toBeGreaterThan(0);expect(errors).toEqual([]);
});
for(const gpu of['off','on'])test(`mobile mine controls and cached artwork work with GPU ${gpu}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  try{
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.__NRTS_HUMAN_BRITAIN__=true);
    await page.goto(`/play.html?view=iso&gpu=${gpu}&test=mobile-mines`);await page.waitForFunction(()=>window.__MINES_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
    const target=await page.evaluate(()=>{
      const d=__MINES_V1__.deposits()[0];selectedUnits.clear();for(const u of livingUnits('france'))selectedUnits.add(u);selectedBuilding=null;updateHud(true);camera.x=d.x;camera.y=d.y;camera.zoom=2;
      return {id:d.id,x:d.x,y:d.y};
    });
    await page.locator('[data-action="build-mine"]').click();expect(await page.evaluate(()=>buildMode)).toBe('mine');
    const p=await page.evaluate(d=>worldToScreen(d.x,d.y),target);await page.touchscreen.tap(p.x,p.y);
    await expect.poll(()=>page.evaluate(()=>buildings.some(b=>b.type==='mine'))).toBe(true);
    const r=await page.evaluate(d=>{
      const b=buildings.find(b=>b.type==='mine');for(let i=0;i<800&&!b.complete;i++)RTS_SIM.step(.25);
      for(const u of livingUnits('france')){stopWorkerAtCurrentPosition(u);u.carry=0;u.carryType=null;}
      selectedUnits.clear();selectedUnits.add(livingUnits('france')[0]);updateHud(true);camera.x=d.x;camera.y=d.y;camera.zoom=2.8;
      return {complete:b.complete,x:b.x,y:b.y};
    },target);
    expect(r).toEqual({complete:true,x:target.x,y:target.y});await page.locator('[data-action="mine-assign"]').click();expect(await page.evaluate(()=>[...selectedUnits][0].task)).toBe('mine');
    // Mine and rocky reserve are drawn through both render paths and use a
    // bounded texture cache, without network art or per-worker canvases.
    await page.evaluate(d=>{camera.x=d.x;camera.y=d.y;camera.zoom=2.8;},target);
    await page.waitForFunction(()=>__MINING_ART_V1__.stats().textures>=2);
    await page.screenshot({path:test.info().outputPath(`mining-mobile-${gpu}.png`)});
    const s=await page.evaluate(()=>({art:__MINING_ART_V1__.stats(),frame:__ISO_VIEW_V1__.frameOf([...selectedUnits][0].id),renderer:__ISO_VIEW_V1__.stats().gpu}));
    expect(s.art.textures).toBeLessThanOrEqual(4);expect(s.art.bytes).toBeLessThan(1e6);expect(s.frame[1]).toMatch(/mine|march/);expect(errors).toEqual([]);console.log('MINING_MOBILE',gpu,JSON.stringify(s));
  }finally{await context.close();}
});
