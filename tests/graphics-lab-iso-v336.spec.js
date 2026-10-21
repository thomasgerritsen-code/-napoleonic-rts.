const {test,expect}=require('@playwright/test');
// The full scene (28 atlases, infantry, guns and cavalry) runs long battle sequences in steps.
test.describe.configure({timeout:90_000});
async function open(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/graphics-lab/iso.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_ISO__?.getStats().loaded===28);
  return errors;
}
const frames=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
test('v336 iso scene loads both Blender atlases and draws every soldier',async({page})=>{
  const errors=await open(page);
  await frames(page);
  const s=await page.evaluate(()=>({...window.__GRAPHICS_LAB_ISO__.getStats(),version:window.__GRAPHICS_LAB_ISO__.version}));
  expect(s.version).toBe('336.0');
  // Five looks per nation (incl. grenadiers and voltigeurs), all on the field.
  expect(s.loaded).toBe(28);
  // Officer, drummer and ensign lead each regiment.
  expect(s.roles).toBe(6);
  expect(s.looks).toBe(10);
  expect(s.terrain).toBe(true);
  expect(s.props).toBeGreaterThan(30);
  expect(s.propsDrawn).toBe(s.props);
  expect(s.units).toBe(64);
  expect(s.drawn).toBe(64);
  expect(await page.locator('#iso-status').textContent()).toContain('gebouwen en terrein');
  expect(errors).toEqual([]);
});
test('v336 octagon march shows all 8 sprite directions; pause freezes the frame',async({page})=>{
  const errors=await open(page);
  const seen=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(r=>requestAnimationFrame(r));
    api.state.paused=true;
    for(let d=0;d<api.getStats().perimeter;d+=2){api.state.travelled=d;await step();}
    return api.getStats().directionsSeen;
  });
  expect(seen).toBe(8);
  const hash=()=>page.evaluate(()=>{const c=document.getElementById('iso-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let h=0;for(let i=0;i<d.length;i+=101)h=(h*31+d[i])>>>0;return h;});
  await frames(page);const a=await hash();await frames(page);const b=await hash();
  expect(a).toBe(b);
  await page.getByRole('button',{name:'Halt'}).click();
  expect((await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).halted).toBe(true);
  expect(errors).toEqual([]);
});
// Steps the paused lab clock until both regiments stand in line.
const DEPLOY=`(async()=>{
  const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
  api.state.paused=true;
  let walking=0;
  for(let i=0;i<500&&api.getStats().deployed<2;i++){api.state.time+=0.05;await step();
    walking=Math.max(walking,api.getStats().animStates.march||0);}
  return{walking,stats:api.getStats()};
})()`;
const advance=(page,seconds)=>page.evaluate(async seconds=>{
  const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
  const seen={};let smoke=0,die=0;
  for(let t=0;t<seconds;t+=0.05){api.state.time+=0.05;await step();
    const s=api.getStats();for(const k of Object.keys(s.animStates))seen[k]=1;smoke=Math.max(smoke,s.smoke);die=Math.max(die,s.animStates.die||0);}
  return{seen:Object.keys(seen).sort(),smoke,die,stats:api.getStats()};
},seconds);
test('v336 Vuur! deploys both columns into line, then the ranks fire in turn once each',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=0;s.misfireChance=0;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  const deployed=await page.evaluate(DEPLOY);
  expect(deployed.walking).toBeGreaterThan(10);
  expect(deployed.stats.formations).toEqual(['line','line']);
  expect(deployed.stats.bands).toBe(3);
  const early=await advance(page,0.9);
  expect(early.stats.shooters).toBeGreaterThan(0);
  expect(early.stats.shooters).toBeLessThan(64);
  const r=await advance(page,2.0);
  expect(r.stats.shooters).toBe(64);
  expect(r.stats.firing).toBe(true);
  expect(r.stats.halted).toBe(true);
  expect(r.seen).toEqual(expect.arrayContaining(['aim','fire','reload','kaim','kfire']));
  expect(r.seen).not.toContain('march');
  expect(r.stats.fallen).toEqual({fr:0,br:0});
  expect(r.smoke).toBeGreaterThanOrEqual(64);
  await page.getByRole('button',{name:'Staakt het vuren'}).click();
  expect((await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).firing).toBe(false);
  expect(errors).toEqual([]);
});
test('v336 casualties fall, the rank behind closes up, the fallen stay and Herstel restores',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=1;s.woundedShare=0;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  const r=await advance(page,2.5);
  expect(r.stats.fallen.fr+r.stats.fallen.br).toBeGreaterThan(4);
  expect(r.die).toBe(r.stats.fallen.fr+r.stats.fallen.br);
  // Casualties fall in different ways, never all the same.
  expect(r.stats.fallKinds.length).toBeGreaterThanOrEqual(2);
  for(const kind of r.stats.fallKinds)expect(['die','diefwd','dieside']).toContain(kind);
  expect(r.stats.drawn).toBe(64-r.die);
  // Nobody leaves a hole in the front rank while a man stands behind it.
  expect(r.stats.frontGaps).toBe(0);
  await page.getByRole('button',{name:'Staakt het vuren'}).click();
  await page.getByRole('button',{name:'Voorwaarts mars'}).click();
  const marched=await advance(page,1.0);
  expect(marched.stats.formations).toEqual(['column','column']);
  // Shots already in the barrel still land; every fallen soldier stays on the field.
  expect(marched.stats.animStates.die).toBeGreaterThanOrEqual(r.die);
  expect(marched.stats.animStates.die).toBe(marched.stats.fallen.fr+marched.stats.fallen.br);
  expect(marched.stats.drawn+marched.stats.animStates.die).toBe(64);
  await page.getByRole('button',{name:'Herstel'}).click();
  await page.evaluate(()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res))));
  const after=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
  expect(after.fallen).toEqual({fr:0,br:0});
  expect(after.drawn).toBe(64);
  expect(errors).toEqual([]);
});
test('v336 French front rank kneels, some muskets misfire and smoke hangs over the line',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=0;s.misfireChance=0.5;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  const r=await advance(page,6);
  expect(r.seen).toEqual(expect.arrayContaining(['kaim','kfire','misfire']));
  expect(r.stats.misfires).toBeGreaterThan(0);
  // Misfiring men fire no ball: fewer shots than muskets presented.
  expect(r.stats.shooters).toBeLessThan(64);
  expect(r.stats.bank).toBeGreaterThan(20);
  expect(r.stats.missing).toBe(0);
  expect(errors).toEqual([]);
});
test('v336 men at rest look around, set their shako or lean on the musket',async({page})=>{
  const errors=await open(page);
  await page.getByRole('button',{name:'Halt'}).click();
  const r=await advance(page,16);
  const extras=['look','adjust','lean'].filter(k=>r.seen.includes(k));
  expect(extras.length).toBeGreaterThanOrEqual(2);
  // Every pose the scene asks for exists in the atlases.
  expect(r.stats.missing).toBe(0);
  expect(r.seen).toContain('idle');
  expect(errors).toEqual([]);
});
// Steps the paused clock through a bayonet charge, recording phases and animations.
const CHARGE_RUN=`(async()=>{
  const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
  api.state.paused=true;
  const phases=[],seen={};let routAt=null,maxGone=0;
  for(let i=0;i<900;i++){api.state.time+=0.05;await step();
    const s=api.getStats();if(s.charge&&phases[phases.length-1]!==s.charge)phases.push(s.charge);
    for(const k of Object.keys(s.animStates))seen[k]=1;maxGone=Math.max(maxGone,s.gone);
    if(s.charge==='rout'&&routAt===null)routAt=i;if(routAt!==null&&i-routAt>260)break;}
  return{phases,seen:Object.keys(seen).sort(),maxGone,stats:api.getStats()};
})()`;
test('v336 Bajonet! charges, the front ranks fight, the beaten side routs and the victors cheer',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{window.__GRAPHICS_LAB_ISO__.state.hitChance=0;});
  await page.getByRole('button',{name:'Bajonet!'}).click();
  const r=await page.evaluate(CHARGE_RUN);
  expect(r.phases).toEqual(['form','advance','melee','rout']);
  expect(r.seen).toEqual(expect.arrayContaining(['charge','thrust','rout','cheer']));
  // Three French ranks with momentum beat two British ones.
  expect(r.stats.loser).toBe('br');
  expect(r.stats.fallen.fr+r.stats.fallen.br).toBeGreaterThan(2);
  expect(r.maxGone).toBeGreaterThan(5);
  expect(r.stats.missing).toBe(0);
  await page.getByRole('button',{name:'Herstel'}).click();
  await page.evaluate(()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res))));
  const after=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
  expect(after.charge).toBe(null);
  expect(after.gone).toBe(0);
  expect(after.drawn).toBe(64);
  expect(errors).toEqual([]);
});
test('v336 the wounded go down and crawl to the rear',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=1;s.woundedShare=1;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  const r=await advance(page,2.5);
  const total=r.stats.fallen.fr+r.stats.fallen.br;
  expect(total).toBeGreaterThan(2);
  expect(r.stats.wounded).toBe(total);
  expect(r.seen).toContain('crawl');
  // Nobody is drawn twice: every casualty is either still falling or crawling.
  expect(r.stats.animStates.crawl+(r.stats.animStates.die||0)).toBe(total);
  expect(errors).toEqual([]);
});
test('v336 sound is off by default; switched on, shots, drums and commands play',async({page})=>{
  const errors=await open(page);
  const off=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats().sound);
  expect(off.on).toBe(false);
  expect(off.context).toBe('none');
  await page.getByRole('button',{name:'Geluid uit'}).click();
  await expect(page.locator('#iso-sound')).toHaveAttribute('aria-pressed','true');
  // Marching column: the drummers beat the step.
  const march=await advance(page,2);
  expect(march.stats.sound.on).toBe(true);
  expect(march.stats.sound.drums).toBeGreaterThan(3);
  await page.evaluate(()=>{window.__GRAPHICS_LAB_ISO__.state.hitChance=0;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  const r=await advance(page,3);
  // One spoken fire command per regiment, a report for every shot (or merged into one).
  expect(r.stats.sound.commands).toBeGreaterThanOrEqual(2);
  expect(r.stats.sound.shots+r.stats.sound.merged).toBeGreaterThanOrEqual(r.stats.shots);
  await page.getByRole('button',{name:'Geluid aan'}).click();
  const quiet=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats().sound);
  expect(quiet.on).toBe(false);
  expect(errors).toEqual([]);
});
test('v336 batteries: the crews work the guns, the guns fire, recoil and are run back up',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{window.__GRAPHICS_LAB_ISO__.state.hitChance=0;});
  const idle=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
  // Two guns a side, four gunners each, standing ready before the order.
  expect(idle.guns).toBe(4);
  expect(idle.gunsDrawn).toBe(4);
  expect(idle.crewDrawn).toBe(16);
  expect(idle.cannonShots).toBe(0);
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  // The guns are first run out to the flanks of the line, then the drill starts.
  const run=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
    const seen={};let recoiled=0,balls=0;
    for(let t=0;t<17;t+=0.05){api.state.time+=0.05;await step();
      const s=api.getStats();for(const k of Object.keys(s.crewStates))seen[k]=1;
      recoiled=Math.max(recoiled,s.recoiled);balls=Math.max(balls,s.balls);}
    return{seen:Object.keys(seen),recoiled,balls};
  });
  const {seen,recoiled,balls}=run;
  const s=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
  // Each gun fires once per 8 s cycle, the second gun of a battery 2.7 s later.
  expect(s.cannonShots).toBeGreaterThanOrEqual(4);
  expect(balls).toBeGreaterThan(0);
  expect(recoiled).toBeGreaterThan(0);
  expect(seen).toEqual(expect.arrayContaining(['ram','load','aim','ready','touch','haul']));
  expect(s.missing).toBe(0);
  expect(errors).toEqual([]);
});
test('v336 round shot grazes and bounces through the enemy line',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{window.__GRAPHICS_LAB_ISO__.state.hitChance=0;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  const r=await advance(page,20);
  // Only the balls strike men here (muskets cannot hit): every fall is a cannon casualty.
  expect(r.stats.ballHits).toBeGreaterThan(0);
  const fallen=r.stats.fallen.fr+r.stats.fallen.br;
  expect(fallen).toBeGreaterThan(0);
  expect(fallen).toBeLessThanOrEqual(r.stats.ballHits);
  expect(errors).toEqual([]);
});
test('v336 Cavalerie!: the squadron walks, trots, gallops in, cuts at the line and rallies back',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{window.__GRAPHICS_LAB_ISO__.state.hitChance=0;});
  await frames(page);
  const idle=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
  // A squadron of six troopers, an officer and a trumpeter per regiment rides with the column.
  expect(idle.riders).toBe(16);
  expect(idle.ridersDrawn).toBe(16);
  await page.getByRole('button',{name:'Cavalerie!'}).click();
  const r=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
    api.state.paused=true;
    const phases=[],seen={};
    for(let i=0;i<800;i++){api.state.time+=0.05;await step();
      const s=api.getStats();if(s.cavCharge&&phases[phases.length-1]!==s.cavCharge)phases.push(s.cavCharge);
      for(const k of Object.keys(s.cavStates))seen[k]=1;
      if(i>40&&!s.cavCharge)break;}
    return{phases,seen:Object.keys(seen),stats:api.getStats()};
  });
  expect(r.phases).toEqual(['walk','trot','gallop','melee','rally']);
  expect(r.seen).toEqual(expect.arrayContaining(['walk','trot','gallop','slash']));
  expect(r.stats.cavCharge).toBe(null);
  expect(r.stats.sabreHits).toBeGreaterThan(0);
  // Every rider is either back with the squadron or lies on the field.
  expect(r.stats.riders+r.stats.riderFalls).toBe(16);
  expect(r.stats.missing).toBe(0);
  expect(errors).toEqual([]);
});
test.describe('phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  test('v336 iso scene pinch-zooms on a phone',async({page})=>{
    const errors=await open(page);
    const before=(await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).zoom;
    const r=await page.locator('#iso-view').boundingBox();
    const cdp=await page.context().newCDPSession(page);
    const a={x:r.x+140,y:r.y+300,id:1},b={x:r.x+240,y:r.y+300,id:2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x-40},{...b,x:b.x+40}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
    const after=(await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).zoom;
    expect(after).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });
});
