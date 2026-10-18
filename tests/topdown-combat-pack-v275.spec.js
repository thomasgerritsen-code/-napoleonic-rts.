const {test,expect}=require('@playwright/test');

test('v271 coordinated 2D volley aims, registers actual 12-musket shot group, and does not move a soldier when drawn',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_VOLLEY_V271__&&window.__TOPDOWN_CASUALTIES_V272__&&window.__BATTLEFIELD_3D_V1__));
  const r=await page.evaluate(()=>{
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    resetGame();gameOver=false;v05PeaceMode=true;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const reg={id:271777,side:'france',formation:'line',facing:0,destroyed:false,
      engagementV069:{mode:'fire'},memberIds:[],morale:95};
    regiments.push(reg);
    const shooters=[];
    for(let i=0;i<12;i++){
      const u=createUnit('france','infantry',800+i*18,750);
      u.regimentId=reg.id;reg.memberIds.push(u.id);u.reload=-1;
      shooters.push(u);
    }
    const target=createUnit('britain','infantry',1100,750);target.reload=999;
    const waiting=shooters[0];
    waiting.reload=.13;volleyClock=2.95;
    const aiming=window.__TOPDOWN_VOLLEY_V271__.preFirePose(waiting);
    const drawPose=window.__CHARACTER_VISUALS_V2__.musketPose(waiting);
    const before={x:waiting.x,y:waiting.y};
    drawUnit(waiting);
    const after={x:waiting.x,y:waiting.y};
    for(const u of shooters){u.reload=-1;fire(u,target);u.reload=999;}
    drawParticles();
    const groups=window.__TOPDOWN_VOLLEY_V271__.groups();
    const stats=window.__TOPDOWN_VOLLEY_V271__.stats();
    const smoke=window.__COMBAT_ANIMATIONS_V1__.smokeSnapshot();
    return{aiming,drawPose,before,after,groups,stats,smokeCount:smoke.filter(s=>s.kind==='musket').length,
      smokeGroup:Math.max(...smoke.map(s=>s.count)),mainVersion:window.RTS_VERSION};
  });
  console.log('V271_REGIMENT_VOLLEY',JSON.stringify(r));
  expect(errors).toEqual([]);
  expect(r.aiming?.phase).toBe('aim');
  expect(r.aiming.shoulder).toBeGreaterThan(.35);
  expect(r.drawPose.phase).toBe('aim');
  expect(r.before).toEqual(r.after);
  expect(r.groups.find(g=>g.id===271777)?.count).toBe(12);
  expect(r.stats.grouped).toBeGreaterThanOrEqual(11);
  expect(r.smokeGroup).toBeGreaterThanOrEqual(12);
  expect(r.mainVersion).toBe('1.3.24');
});

test('v272 death poses and hit flinches are varied, capped and render-only',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_CASUALTIES_V272__&&window.__BATTLEFIELD_3D_V1__));
  const result=await page.evaluate(()=>{
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    const api=window.__TOPDOWN_CASUALTIES_V272__;
    const hit=createUnit('france','infantry',camera.x,camera.y);
    hit.morale=95;applyDamage(hit,7,8);
    const before={x:hit.x,y:hit.y,hp:hit.hp};
    drawUnit(hit);
    const after={x:hit.x,y:hit.y,hp:hit.hp};
    const victim=[];
    for(let i=0;i<9;i++){
      const u=createUnit(i%2?'britain':'france','infantry',camera.x+i*12,camera.y+25);
      u.hp=1;applyDamage(u,2,1);victim.push(u);
    }
    drawParticles();
    return{before,after,dead:victim.every(u=>u.dead),variants:new Set(victim.map(u=>api.variant({id:u.id}))).size,
      stats:api.stats()};
  });
  console.log('V272_FALL_STYLES',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.dead).toBe(true);
  expect(result.before).toEqual(result.after);
  expect(result.variants).toBeGreaterThanOrEqual(2);
  expect(result.stats.hitFlinches).toBeGreaterThan(0);
  expect(result.stats.fallsDrawn).toBeGreaterThan(0);
  expect(result.stats.cap).toBeLessThanOrEqual(160);
});

test('v273 artillery crew phases follow actual gunshot; v274 panic states and v275 galloping/carré remain physical-authority-safe',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_GUN_CREW_V273__&&window.__TOPDOWN_MORALE_V274__&&window.__TOPDOWN_CAVALRY_V275__&&window.__BATTLEFIELD_3D_V1__));
  const result=await page.evaluate(()=>{
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const artillery=window.__TOPDOWN_GUN_CREW_V273__,
      morale=window.__TOPDOWN_MORALE_V274__,cavalry=window.__TOPDOWN_CAVALRY_V275__;
    const target=createUnit('britain','infantry',camera.x+75,camera.y);
    const cannon=createUnit('france','artillery',camera.x,camera.y);
    // A cannon without both live crew is correctly forbidden to fire.
    // Create a real battery, then complete the visual staging approach.
    const crew=[createUnit('france','infantry',camera.x-18,camera.y-19),
      createUnit('france','infantry',camera.x-18,camera.y+19)];
    const battery=createArtilleryBatteryV06('france',cannon,crew);
    battery.crewApproachV1.active=false;
    cannon.crewReadyV1=true;
    cannon.reload=-1;target.reload=999;
    const orig={x:cannon.x,y:cannon.y};
    fire(cannon,target);cannon.reload=999;
    const recoil=artillery.phaseFor(cannon);
    drawBatteryCompositeV061(cannon,battery);
    for(let i=0;i<10;i++)window.RTS_SIM.step(.05);
    const sponge=artillery.phaseFor(cannon);
    cannon.artilleryVisualV273.reloadDuration=4;
    cannon.artilleryVisualV273.started=elapsed-1.5;
    const charge=artillery.phaseFor(cannon);
    cannon.artilleryVisualV273.started=elapsed-2.7;
    const ram=artillery.phaseFor(cannon);
    const after={x:cannon.x,y:cannon.y};
    const soldier=createUnit('france','infantry',camera.x+20,camera.y+40);
    soldier.morale=32;const wavering=morale.stateFor(soldier);
    soldier.morale=20;const panic=morale.stateFor(soldier);drawUnit(soldier);
    soldier.routing=true;const routing=morale.stateFor(soldier);drawUnit(soldier);
    const horse=createUnit('france','cavalry',camera.x-70,camera.y);
    horse.chargeTimer=4;horse.chargeMomentumV1=.72;
    drawUnit(horse);
    const first={x:horse.x,y:horse.y};
    for(let i=0;i<4;i++)window.RTS_SIM.step(.05);
    horse.x+=14;drawUnit(horse);
    drawParticles();
    const second={x:horse.x,y:horse.y};
    // Genuine square formation with existing defender multiplier, untouched.
    const unit=createUnit('britain','infantry',camera.x+60,camera.y+55);
    const squareDefence=cavalry.existingSquareDefence;
    return{recoil,sponge,charge,ram,orig,after,wavering,panic,routing,
      horseMoved:second.x-first.x,chargeShown:cavalry.chargeFor(horse),
      artilleryStats:artillery.stats(),moraleStats:morale.stats(),
      cavalryStats:cavalry.stats(),squareDefence,renderedUnit:!unit.dead};
  });
  console.log('V273_275_COMBAT',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.orig).toEqual(result.after);
  expect(result.recoil.stage).toBe('recoil');
  expect(result.sponge.stage).toBe('sponge');
  expect(result.charge.stage).toBe('charge');
  expect(result.ram.stage).toBe('ram');
  expect(result.artilleryStats.cannonShots).toBeGreaterThan(0);
  expect([result.wavering,result.panic,result.routing]).toEqual(['wavering','panicking','routing']);
  expect(result.horseMoved).toBe(14);
  expect(result.chargeShown).toBe(true);
  expect(result.cavalryStats.galloping).toBeGreaterThan(0);
  expect(result.cavalryStats.dustEmitted).toBeGreaterThan(0);
  expect(result.cavalryStats.dustCount).toBeLessThanOrEqual(result.cavalryStats.maxDust);
  expect(result.squareDefence).toBeCloseTo(.35,5);
});

test('v271-275 are 2D display layers and 3D engine stays in control when enabled',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__TOPDOWN_CAVALRY_V275__&&!!window.__BATTLEFIELD_3D_V1__);
  const info=await page.evaluate(()=>{
    const ids=['topdown-volley-v271','topdown-casualties-v272','topdown-gun-crew-v273','topdown-morale-v274','topdown-cavalry-v275'];
    const features=ids.map(x=>NRTS.subsystems.has(x));
    window.__BATTLEFIELD_3D_V1__.setEnabled(true);
    const unit=createUnit('france','cavalry',camera.x,camera.y);
    unit.chargeTimer=5;
    const before=__TOPDOWN_CAVALRY_V275__.stats().galloping;
    drawUnit(unit);drawParticles();drawRegimentMarkers();
    const after=__TOPDOWN_CAVALRY_V275__.stats().galloping;
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    return{features,before,after};
  });
  expect(info.features).toEqual([true,true,true,true,true]);
  expect(info.before).toBe(info.after);
  expect(errors).toEqual([]);
});

test('v275 infantry square retains the real existing mounted-charge counter, while new charge art stays 2D only',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__TOPDOWN_CAVALRY_V275__&&!!window.__CAVALRY_ARTILLERY_V1__&&!!window.__BATTLEFIELD_3D_V1__);
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const cavalry=window.__TOPDOWN_CAVALRY_V275__;
    const regiment={id:275888,side:'britain',kind:'infantry',formation:'square',
      memberIds:[],facing:0,destroyed:false,morale:100};
    regiments.push(regiment);
    const infantry=[];
    for(let i=0;i<10;i++){
      const u=createUnit('britain','infantry',camera.x+50+(i%4)*9,camera.y+70+Math.floor(i/4)*9);
      u.regimentId=regiment.id;regiment.memberIds.push(u.id);u.hp=900;
      infantry.push(u);
    }
    const victim=infantry[0];
    const horse=createUnit('france','cavalry',camera.x,camera.y+80);
    const baseHP=900;
    const originalRandom=Math.random;
    Math.random=()=>.5;
    function strike(mode,view3D){
      regiment.formation=mode;
      victim.hp=baseHP;
      horse.chargeTimer=5;horse.chargeMomentumV1=.7;horse.reload=0;
      window.__BATTLEFIELD_3D_V1__.setEnabled(view3D);
      fire(horse,victim);
      return baseHP-victim.hp;
    }
    const protection=strike('square',false);
    const unprotected=strike('line',false);
    const squareIn3D=strike('square',true);
    Math.random=originalRandom;
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    drawRegimentMarkers();
    return{
      protection,unprotected,squareIn3D,
      multiplier:cavalry.existingSquareDefence,
      originalMultiplier:window.__CAVALRY_ARTILLERY_V1__.chargeVsSquare,
      defensiveArtwork:cavalry.stats().squares,
      physicalPositions:infantry.map(u=>({x:u.x,y:u.y})),
      fireOwner:fire.name
    };
  });
  console.log('V275_GENUINE_SQUARE',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.multiplier).toBeCloseTo(.35,6);
  expect(result.originalMultiplier).toBeCloseTo(.35,6);
  expect(result.protection).toBeGreaterThan(0);
  expect(result.unprotected).toBeGreaterThan(result.protection*2);
  // The historical square's .35 factor is applied before additional
  // flanking bonuses for an unformed line, so the final ratio can be lower.
  expect(result.protection/result.unprotected).toBeGreaterThan(.2);
  expect(result.protection/result.unprotected).toBeLessThanOrEqual(.36);
  expect(result.squareIn3D).toBeCloseTo(result.protection,4);
  expect(result.defensiveArtwork).toBeGreaterThan(0);
});
