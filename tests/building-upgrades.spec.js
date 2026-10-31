const {readyPlayers}=require('./helpers/online-ready.js');
const {test,expect}=require('@playwright/test');
const {createServer}=require('../server/index.js');
test.use({trace:'off'});

test('a selected tower upgrades through three levels on mobile, charges once and keeps real combat stats',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/play.html?view=iso&test=tower&gpu=off');
    await page.waitForFunction(()=>!!window.__WATCHTOWER_V1__&&!!window.__COMMAND_GATEWAY_V1__);
    const initial=await page.evaluate(()=>{
      const home=buildings.find(b=>b.side==='france'&&b.type==='towncenter');
      const t=createBuilding('france','tower',home.x+160,home.y+140,true);
      window.__towerTest=t;selectedUnits.clear();selectedBuilding=t;
      economies.france.wood=1000;economies.france.iron=0;updateHud(true);
      camera.x=t.x;camera.y=t.y;camera.zoom=2;
      return {id:t.id,hp:t.maxHp,range:__WATCHTOWER_V1__.levelOf(t).range,unaffordable:__WATCHTOWER_V1__.upgradeTower(t)};
    });
    expect(initial).toMatchObject({hp:1100,range:240,unaffordable:false});
    const button=page.locator('[data-action="tower-upgrade"]');
    await expect(button).toBeVisible();await expect(button).toBeDisabled();
    await page.evaluate(()=>{economies.france.iron=500;__towerTest.hp=550;updateHud(true);});
    await expect(button).toBeEnabled();await button.click();
    await expect(button).toBeDisabled();await expect(button).toContainText('Versterken');
    const halfway=await page.evaluate(()=>{
      const t=__towerTest,api=__WATCHTOWER_V1__,wood=economies.france.wood,iron=economies.france.iron;
      const repeat=api.upgradeTower(t);
      // No wall-clock timer or renderer is allowed to complete an upgrade.
      for(let i=0;i<200;i++)updateBuildings(.05);
      updateHud(true);
      return {repeat,wood,iron,progress:t.towerUpgradeProgress,level:t.towerLevel||1,hp:t.maxHp};
    });
    expect(halfway).toEqual({repeat:false,wood:820,iron:460,progress:expect.closeTo(.5,5),level:1,hp:1100});
    await expect(button).toContainText('50%');
    await page.evaluate(()=>{for(let i=0;i<200;i++)updateBuildings(.05);updateHud(true);});
    const level2=await page.evaluate(()=>({level:__towerTest.towerLevel,hp:__towerTest.hp,maxHp:__towerTest.maxHp,vision:visionRadius(__towerTest),baseVision:visionRadius({...__towerTest,towerLevel:1})}));
    expect(level2).toMatchObject({level:2,hp:800,maxHp:1600});
    expect(level2.vision / level2.baseVision).toBeCloseTo(450/420,5);
    await expect(button).toContainText('niveau 3/3');await expect(button).toBeEnabled();
    await button.click();
    const firing=await page.evaluate(()=>{
      const t=__towerTest;
      for(const u of units)if(u.side==='britain')u.dead=true;
      const enemy=createUnit('britain','infantry',t.x+260,t.y);
      t.towerReload=0;projectiles.length=0;updateBuildings(.05);
      const during=projectiles.map(p=>({damage:p.damage,target:p.target.id}));
      for(let i=0;i<600;i++)updateBuildings(.05);
      projectiles.length=0;enemy.x=t.x+290;t.towerReload=0;updateBuildings(.05);
      updateHud(true);
      return {during,after:projectiles.map(p=>({damage:p.damage,target:p.target.id})),enemy:enemy.id,
        level:t.towerLevel,hp:t.hp,maxHp:t.maxHp,range:__WATCHTOWER_V1__.levelOf(t).range,vision:visionRadius(t),baseVision:visionRadius({...t,towerLevel:1}),
        wood:economies.france.wood,iron:economies.france.iron,rejected:__WATCHTOWER_V1__.upgradeTower(t)};
    });
    expect(firing.during).toEqual(Array(3).fill({damage:18,target:firing.enemy}));
    expect(firing.after).toEqual(Array(3).fill({damage:22,target:firing.enemy}));
    expect(firing).toMatchObject({level:3,hp:1100,maxHp:2200,range:300,wood:560,iron:370,rejected:false});
    expect(firing.vision / firing.baseVision).toBeCloseTo(480/420,5);
    await expect(button).toContainText('maximaal');await expect(button).toBeDisabled();
    await page.screenshot({path:test.info().outputPath('tower-level-3-mobile.png')});
    const invalid=await page.evaluate(()=>{
      const api=__WATCHTOWER_V1__,t=__towerTest;
      const pending=createBuilding('france','tower',t.x+200,t.y+100,false);
      const enemy=createBuilding('britain','tower',t.x+300,t.y+100,true);
      const house=createBuilding('france','house',t.x+400,t.y+100,true);
      const doomed=createBuilding('france','tower',t.x+500,t.y+100,true);
      const results=[api.upgradeTower(pending),api.upgradeTower(enemy),api.upgradeTower(house)];
      api.upgradeTower(doomed);doomed.dead=true;
      for(let i=0;i<500;i++)updateBuildings(.05);
      results.push(doomed.towerLevel||1,api.upgradeTower(doomed));
      resetGame();results.push(api.upgradeTower(t));return results;
    });
    expect(invalid).toEqual([false,false,false,1,false,false]);expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('desktop and mobile upgrade only their own towers over real multiplayer transport and recover progress on reload',async({browser})=>{
  test.setTimeout(120000);
  let app,simulationPage;
  const contexts=[],errors=[];
  // Test-only starting fixtures. The server still executes the real shared
  // authority, gateway, physics and per-connection delta transport unchanged.
  const host={healthy:()=>true,close:async()=>{},create:async()=>{
    const context=await browser.newContext();contexts.push(context);
    await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
    simulationPage=await context.newPage();simulationPage.on('pageerror',e=>errors.push(e.message));
    await simulationPage.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=tower&gpu=off`);
    await simulationPage.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);
    await simulationPage.evaluate(()=>{
      for(const side of ['france','britain']){
        const home=buildings.find(b=>b.side===side&&b.type==='towncenter');
        createBuilding(side,'tower',home.x+(side==='france'?160:-160),home.y+140,true);
        economies[side].wood=1000;economies[side].iron=500;
      }
    });
    return {close:()=>context.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulationPage.evaluate(
      ({commands,running,snapshot,seconds,epochs})=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(commands,running,snapshot,seconds,epochs))),
      {commands,running,snapshot,seconds,epochs})};
  }};
  try{
    app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
    const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`;
    const desktop=await browser.newContext(),mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(desktop,mobile);
    const a=await desktop.newPage(),b=await mobile.newPage();for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
    await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(endpoint));await a.click('#startMultiplayer');await a.click('#onlineHost');
    await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:30000}).toMatch(/^[A-Z2-9]{8}$/);
    const invite=await a.inputValue('#onlineInvite');await b.goto(invite);
    await readyPlayers(a,b);
    for(const p of [a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
    const select=async p=>p.evaluate(()=>{selectedUnits.clear();selectedBuilding=buildings.find(b=>b.type==='tower'&&b.side==='france');updateHud(true);return selectedBuilding.id;});
    const ownA=await select(a),ownB=await select(b);
    await a.locator('[data-action="tower-upgrade"]').click();
    await expect.poll(()=>a.evaluate(()=>__ONLINE_MATCH_V1__.view.state.buildings.find(b=>b.type==='tower').towerUpgradeTo)).toBe(2);
    expect(await b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.buildings.find(b=>b.type==='tower').towerUpgradeTo||0)).toBe(0);
    await b.evaluate(id=>__ONLINE_MATCH_V1__.send({v:1,seq:1,type:'action',unitIds:[],buildingId:id,data:{action:'tower-upgrade'}}),ownA);
    await expect(b.locator('#onlineStatus')).toContainText('geweigerd');
    await b.locator('[data-action="tower-upgrade"]').click();
    await expect.poll(()=>b.evaluate(()=>__ONLINE_MATCH_V1__.view.state.buildings.find(b=>b.id===selectedBuilding.id).towerUpgradeProgress)).toBeGreaterThan(0);
    await b.reload();await b.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await b.click('#onlineClose');await select(b);
    await expect(b.locator('[data-action="tower-upgrade"]')).toBeDisabled();await expect(b.locator('[data-action="tower-upgrade"]')).toContainText('Versterken');
    for(const p of [a,b])await expect.poll(()=>p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.buildings.find(b=>b.type==='tower').towerLevel),{timeout:30000}).toBe(2);
    for(const p of [a,b]){await select(p);await p.locator('[data-action="tower-upgrade"]').click();}
    for(const p of [a,b])await expect.poll(()=>p.evaluate(()=>__ONLINE_MATCH_V1__.view.state.buildings.find(b=>b.type==='tower').towerLevel),{timeout:45000}).toBe(3);
    const views=await Promise.all([a,b].map(p=>p.evaluate(()=>({native:__ONLINE_MATCH_V1__.side,t:__ONLINE_MATCH_V1__.view.state.buildings.find(b=>b.type==='tower')}))));
    expect(views.map(v=>v.t.id)).toEqual([ownA,ownB]);
    for(const v of views){expect(v.t.nativeSide).toBe(v.native);expect(v.t.maxHp).toBe(2200);expect(v.t.towerUpgradeTo).toBe(0);}
    const privacy=await simulationPage.evaluate(()=>{
      const a=buildings.find(b=>b.type==='tower'&&b.side==='france'),b=buildings.find(b=>b.type==='tower'&&b.side==='britain');
      b.x=a.x+50;b.y=a.y;
      const enemy=__ONLINE_SIM_V1__.advance([],false).views.france.state.buildings.find(v=>v.id===b.id);
      return {level:enemy.towerLevel,progress:enemy.towerUpgradeProgress,to:enemy.towerUpgradeTo};
    });
    expect(privacy).toEqual({level:3,progress:undefined,to:undefined});expect(errors).toEqual([]);
  }finally{await app?.close();await Promise.all(contexts.map(c=>c.close()));}
});
