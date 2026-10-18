const {test,expect}=require('@playwright/test');

test('v270 pale black-powder smoke changes from warm ivory to neutral and cool grey, with three layers',async({page})=>{
  test.setTimeout(100000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__COMBAT_ANIMATIONS_V1__&&!!window.__BATTLEFIELD_3D_V1__);
  const result=await page.evaluate(()=>{
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    const api=window.__COMBAT_ANIMATIONS_V1__;
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const shooter=createUnit('france','infantry',1000,700);
    const target=createUnit('britain','infantry',1060,700);
    shooter.reload=-1;target.reload=999;
    const before={x:shooter.x,y:shooter.y,hp:shooter.hp,facing:shooter.facing};
    fire(shooter,target);shooter.reload=999;
    const palettes=[0,.12,.25,.65,1.2,2.3,3,4.5,6.1,8].map(age=>({
      age,...api.smokePalette(age)
    }));
    const colorsSeen=new Set();
    const oldFill=ctx.fill;
    ctx.fill=function(...args){
      if(typeof ctx.fillStyle==='string'&&ctx.fillStyle.startsWith('#'))colorsSeen.add(ctx.fillStyle);
      return oldFill.apply(this,args);
    };
    drawParticles();
    let firstColors=[...colorsSeen];
    for(let i=0;i<44;i++)window.RTS_SIM.step(.05);
    colorsSeen.clear();drawParticles();
    let middleColors=[...colorsSeen];
    for(let i=0;i<46;i++)window.RTS_SIM.step(.05);
    colorsSeen.clear();drawParticles();
    let laterColors=[...colorsSeen];
    ctx.fill=oldFill;
    const after={x:shooter.x,y:shooter.y,hp:shooter.hp,facing:shooter.facing};
    const stats=api.smokeStats();
    const smoke=api.smokeSnapshot().at(-1);
    return{
      palettes,firstColors,middleColors,laterColors,stats,
      before,after,drift:smoke?.drift,life:smoke?.life,
      features:[...api.features],stops:[...api.smokeColorStops]
    };
  });
  console.log('V270_SMOKE_COLOUR',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.stops.map(x=>x.at)).toEqual([0,.25,1.2,3,6.5]);
  expect(result.palettes[0].core).toBe('#d7d2c5');
  expect(result.palettes[0].middle).toBe('#e9e4d9');
  expect(result.palettes[0].rim).toBe('#f4f1e8');
  expect(result.palettes[4].core).toBe('#c7c7c2');
  expect(result.palettes[6].core).toBe('#b7b9b7');
  expect(result.palettes[9].rim).toBe('#d9dfe3');
  expect(result.palettes[1].middle).not.toBe(result.palettes[0].middle);
  const channels=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const luminance=hex=>{const [r,g,b]=channels(hex);return r*.2126+g*.7152+b*.0722;};
  for(const p of result.palettes){
    expect(luminance(p.rim)).toBeGreaterThan(luminance(p.middle));
    expect(luminance(p.middle)).toBeGreaterThan(luminance(p.core));
    expect(channels(p.core).every(v=>v>155)).toBe(true);
  }
  const warm=channels(result.palettes[0].rim),cool=channels(result.palettes[9].rim);
  expect(warm[0]-warm[2]).toBeGreaterThan(8);
  expect(cool[2]-cool[0]).toBeGreaterThan(0);
  expect(result.firstColors).toContain(result.palettes[0].rim);
  expect(result.middleColors).toContain(result.palettes[5].rim);
  expect(result.laterColors).toContain(result.palettes[7].rim);
  expect(result.before).toEqual(result.after);
  expect(Math.hypot(result.drift.x,result.drift.y)).toBeGreaterThan(20);
  expect(result.life).toBeGreaterThanOrEqual(6);
  expect(result.stats.active).toBeLessThanOrEqual(result.stats.cap);
  expect(result.features).toContain('age-interpolated-three-layer-smoke-colors');
});

test('v270 both single-musket and 18-musket pooled salvo use same palette without spawning extra banks',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__COMBAT_ANIMATIONS_V1__));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const api=window.__COMBAT_ANIMATIONS_V1__;
    const target=createUnit('britain','infantry',1180,750);target.reload=999;
    for(let i=0;i<18;i++){
      const u=createUnit('france','infantry',980,650+i*13);
      u.regimentId=88881;
      u.reload=-1;fire(u,target);u.reload=999;
    }
    const snapshot=api.smokeSnapshot();
    const pooled=snapshot.find(s=>s.count===18&&s.kind==='musket');
    for(let i=0;i<25;i++)window.RTS_SIM.step(.05);
    drawParticles();
    const palette=api.smokePalette(elapsed-pooled.born);
    return {pooled:pooled?.count,banks:snapshot.filter(s=>s.kind==='musket').length,
      palette,active:api.smokeStats().active,cap:api.smokeStats().cap};
  });
  expect(errors).toEqual([]);
  expect(result.pooled).toBe(18);
  expect(result.banks).toBe(1);
  expect(result.active).toBeLessThanOrEqual(result.cap);
  expect(result.palette.rim).toMatch(/^#[0-9a-f]{6}$/);
});
