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
test('v339 iso scene loads both Blender atlases and draws every soldier',async({page})=>{
  const errors=await open(page);
  await frames(page);
  const s=await page.evaluate(()=>({...window.__GRAPHICS_LAB_ISO__.getStats(),version:window.__GRAPHICS_LAB_ISO__.version}));
  expect(s.version).toBe('339.0');
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
test('v339 octagon march shows all 8 sprite directions; pause freezes the frame',async({page})=>{
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
test('v339 Vuur! deploys both columns into line, then the ranks fire in turn once each',async({page})=>{
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
test('v339 casualties fall, the rank behind closes up, the fallen stay and Herstel restores',async({page})=>{
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
test('v339 French front rank kneels, some muskets misfire and smoke hangs over the line',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=0;s.misfireChance=0.5;});
  await page.getByRole('button',{name:'Vuur!'}).click();
  await page.evaluate(DEPLOY);
  const r=await advance(page,6);
  expect(r.seen).toEqual(expect.arrayContaining(['kaim','kfire','misfire']));
  expect(r.stats.misfires).toBeGreaterThan(0);
  // Misfiring men fire no ball: fewer shots than muskets presented.
  expect(r.stats.shooters).toBeLessThan(64);
  // Nearby shots feed shared bank clouds, so a handful of clouds covers the line.
  expect(r.stats.bank).toBeGreaterThan(2);
  expect(r.stats.missing).toBe(0);
  expect(errors).toEqual([]);
});
test('v339 men at rest look around, set their shako or lean on the musket',async({page})=>{
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
test('v339 Bajonet! charges, the front ranks fight, the beaten side routs and the victors cheer',async({page})=>{
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
test('v339 the wounded go down and crawl to the rear',async({page})=>{
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
test('v339 sound is off by default; switched on, shots, drums and commands play',async({page})=>{
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
test('v339 batteries: the crews work the guns, the guns fire, recoil and are run back up',async({page})=>{
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
test('v339 round shot grazes and bounces through the enemy line',async({page})=>{
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
test('v339 Cavalerie!: the squadron walks, trots, gallops in, cuts at the line and rallies back',async({page})=>{
  const errors=await open(page);
  // Without the British reaction: the squadron reaches the line itself.
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=0;s.reaction=false;});
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
// Steps through a French cavalry charge with the British reaction, logging phases.
const REACTION_RUN=`(async()=>{
  const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
  api.state.paused=true;
  const fr=[],br=[],forms=new Set();
  for(let i=0;i<900;i++){api.state.time+=0.05;await step();
    const s=api.getStats();
    if(s.cavCharge&&fr[fr.length-1]!==s.cavCharge)fr.push(s.cavCharge);
    if(s.cavCounter&&br[br.length-1]!==s.cavCounter)br.push(s.cavCounter);
    forms.add(s.formations[1]);
    if(i>40&&!s.cavCharge&&!s.cavCounter&&s.formations[1]!=='square')break;}
  return{fr,br,forms:[...forms],stats:api.getStats()};
})()`;
test('v339 the British form square and their squadron rides out to meet the French',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{window.__GRAPHICS_LAB_ISO__.state.hitChance=0;});
  await page.getByRole('button',{name:'Cavalerie!'}).click();
  const r=await page.evaluate(REACTION_RUN);
  expect(r.forms).toContain('square');
  expect(r.br).toEqual(['gallop','clash','rally']);
  expect(r.fr.slice(0,4)).toEqual(['walk','trot','gallop','clash']);
  expect(r.stats.clashes).toBe(1);
  expect(r.stats.squareShots).toBeGreaterThan(0);
  // Afterwards everyone is home, the square has become a line again.
  expect(r.stats.cavCharge).toBe(null);
  expect(r.stats.cavCounter).toBe(null);
  expect(r.stats.formations[1]).toBe('line');
  expect(r.stats.riders+r.stats.riderFalls).toBe(16);
  expect(r.stats.missing).toBe(0);
  expect(errors).toEqual([]);
});
test('v339 winning the clash, the French ride on at the square, where the horses refuse',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{
    const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=0;
    // A weakened British squadron loses the clash.
    s.squadrons[1].riders.slice(0,4).forEach(m=>{m.dead=true;});
  });
  await page.getByRole('button',{name:'Cavalerie!'}).click();
  const r=await page.evaluate(REACTION_RUN);
  expect(r.fr).toEqual(['walk','trot','gallop','clash','gallop','melee','rally']);
  expect(r.stats.cavStates).toBeDefined();
  expect(r.stats.formations[1]).toBe('line');
  expect(r.stats.missing).toBe(0);
  expect(errors).toEqual([]);
});
test('v339 larger field: minimap shows it all, a tap there moves the camera, Volg follows a regiment',async({page})=>{
  const errors=await open(page);
  await frames(page);
  const s=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
  expect(s.half).toBe(64);
  expect(s.minimap).toBe(true);
  expect(s.props).toBeGreaterThan(50);
  expect(s.propsDrawn).toBe(s.props);
  // A click near the minimap's top-left corner looks at the north-west of the field.
  const box=await page.locator('#iso-view').boundingBox();
  const mm=await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.state.minimapRect);
  await page.mouse.click(box.x+mm.x+mm.w*0.1,box.y+mm.y+mm.h*0.1);
  const cam=(await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).cam;
  expect(cam.x).toBeCloseTo(-0.4*2*64*20,0);
  expect(cam.y).toBeCloseTo(-0.4*64*20,0);
  // Volg: the camera glides to the French regiment and stays with it.
  await page.getByRole('button',{name:'Volg: uit'}).click();
  await expect(page.locator('#iso-follow')).toHaveText('🎥 Volg: Frans regiment');
  const r=await advance(page,4);
  const c=await page.evaluate(()=>{
    const api=window.__GRAPHICS_LAB_ISO__,reg=api.state.regiments[0],men=reg.men.filter(m=>!m.dead);
    return{x:men.reduce((a,m)=>a+m.gx,0)/men.length*20,y:-men.reduce((a,m)=>a+m.gy,0)/men.length*10};
  });
  expect(r.stats.follow).toBe('fr');
  expect(Math.abs(r.stats.cam.x-c.x)).toBeLessThan(40);
  expect(Math.abs(r.stats.cam.y-c.y)).toBeLessThan(40);
  expect(errors).toEqual([]);
});
test.describe('phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  test('v339 iso scene pinch-zooms on a phone',async({page})=>{
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
test('v339 the explanation is hidden until Uitleg is pressed',async({page})=>{
  const errors=await open(page);
  await expect(page.locator('#iso-info')).toBeHidden();
  await page.getByRole('button',{name:'Uitleg'}).click();
  await expect(page.locator('#iso-info')).toBeVisible();
  await page.getByRole('button',{name:'Uitleg'}).click();
  await expect(page.locator('#iso-info')).toBeHidden();
  expect(errors).toEqual([]);
});
const screen=(page,id)=>page.evaluate(id=>window.__GRAPHICS_LAB_ISO__.groupScreen(id),id);
const ground=(page,x,y)=>page.evaluate(([x,y])=>window.__GRAPHICS_LAB_ISO__.screenOfGround(x,y),[x,y]);
const stats=page=>page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats());
test('v339 click a regiment, click the field: it marches there in column, forms line and fires',async({page})=>{
  const errors=await open(page);
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state;s.hitChance=0;});
  await page.getByRole('button',{name:'Halt'}).click();
  await frames(page);
  // Nothing selected: the order buttons stay hidden.
  await expect(page.locator('#iso-o-line')).toBeHidden();
  const p=await screen(page,'fr');
  await page.mouse.click(p.x,p.y);
  let s=await stats(page);
  expect(s.selected).toEqual(['fr']);
  await expect(page.locator('#iso-sel')).toHaveText('Frans regiment');
  await expect(page.locator('#iso-o-line')).toBeVisible();
  const from=s.centres[0],dest={x:from.x+6,y:from.y-6};
  const q=await ground(page,dest.x,dest.y);
  await page.mouse.click(q.x,q.y);
  s=await stats(page);
  expect(s.flags).toBe(1);
  expect(s.commands[0]).toEqual({form:'column',fire:false,moving:true});
  expect(s.formations[0]).toBe('fcolumn');
  // The British, unordered and halted, stay where they are.
  expect(s.commands[1]).toBeNull();
  const r=await advance(page,10);
  expect(r.stats.commands[0].moving).toBe(false);
  expect(Math.hypot(r.stats.centres[0].x-dest.x,r.stats.centres[0].y-dest.y)).toBeLessThan(1.5);
  expect(r.stats.flags).toBe(0);
  await page.locator('#iso-o-line').click();
  expect((await stats(page)).formations[0]).toBe('line');
  await page.locator('#iso-o-fire').click();
  await expect(page.locator('#iso-o-fire')).toHaveText('✋ Staakt vuren');
  const f=await advance(page,6);
  expect(f.stats.commands[0]).toEqual({form:'line',fire:true,moving:false});
  expect(f.stats.shots).toBeGreaterThan(10);
  // Only the ordered regiment fires.
  expect(f.stats.firing).toBe(false);
  // Esc clears the selection; Voorwaarts mars sends everyone back to the road.
  await page.keyboard.press('Escape');
  expect((await stats(page)).selected).toEqual([]);
  await page.getByRole('button',{name:'Voorwaarts mars'}).click();
  s=await stats(page);
  expect(s.commands).toEqual([null,null]);
  expect(s.formations[0]).toBe('column');
  expect(errors).toEqual([]);
});
test('v339 a box picks the French guns and horse; right-click sends them, the guns fire, the horse charges',async({page})=>{
  const errors=await open(page);
  await page.getByRole('button',{name:'Halt'}).click();
  await frames(page);
  // Look at the squadron and the guns.
  await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state,m=s.squadrons[0].riders[0];s.camX=m.gx*20;s.camY=-m.gy*10;});
  await frames(page);
  const a=await screen(page,'frcav'),b=await screen(page,'frbat');
  await page.locator('#iso-box').click();
  await page.mouse.move(Math.min(a.x,b.x)-50,Math.min(a.y,b.y)-30);
  await page.mouse.down();
  await page.mouse.move(Math.max(a.x,b.x)+50,Math.max(a.y,b.y)+30,{steps:5});
  expect((await stats(page)).box).toBe(true);
  await page.mouse.up();
  let s=await stats(page);
  expect(s.selected).toEqual(expect.arrayContaining(['frbat','frcav']));
  await expect(page.locator('#iso-box')).toHaveAttribute('aria-pressed','false');
  // Only the guns and horse: Shift-click the regiment off again if the box caught it.
  if(s.selected.includes('fr')){const p=await screen(page,'fr');await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');}
  expect((await stats(page)).selected.sort()).toEqual(['frbat','frcav']);
  await expect(page.locator('#iso-o-line')).toBeDisabled();
  const c=s.centres[0],q=await ground(page,c.x-4,c.y-14);
  await page.mouse.click(q.x,q.y,{button:'right'});
  s=await stats(page);
  expect(s.batteryAt[0]).not.toBeNull();
  expect(s.squadronAt[0]).not.toBeNull();
  const r=await advance(page,8);
  const near=await page.evaluate(()=>{const st=window.__GRAPHICS_LAB_ISO__.state,reg=st.regiments[0];
    return st.batteries.filter(g=>g.prefix==='fr').map(g=>Math.hypot(g.home.x-reg.batCmd.x,g.home.y-reg.batCmd.y));});
  near.forEach(d=>expect(d).toBeLessThan(3));
  expect(r.stats.firing).toBe(false);
  await page.locator('#iso-o-fire').click();
  const f=await advance(page,8);
  expect(f.stats.batteryFire).toEqual([true,false]);
  expect(f.stats.cannonShots).toBeGreaterThan(0);
  await page.locator('#iso-o-charge').click();
  expect((await stats(page)).cavCharge).toBe('walk');
  expect(errors).toEqual([]);
});
test.describe('phone orders',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  test('v339 tap a regiment, tap the field: the order is given by touch',async({page})=>{
    const errors=await open(page);
    await page.getByRole('button',{name:'Halt'}).click();
    await page.evaluate(()=>{const s=window.__GRAPHICS_LAB_ISO__.state,m=s.regiments[1].men[0];s.camX=m.gx*20;s.camY=-m.gy*10;});
    await frames(page);
    const p=await screen(page,'br');
    await page.touchscreen.tap(p.x,p.y);
    let s=await stats(page);
    expect(s.selected).toEqual(['br']);
    // Open grass below and left of the column.
    await page.touchscreen.tap(p.x-100,p.y+180);
    s=await stats(page);
    expect(s.commands[1]).toEqual({form:'column',fire:false,moving:true});
    expect(s.flags).toBe(1);
    await page.locator('#iso-o-line').click();
    expect((await stats(page)).formations[1]).toBe('line');
    await page.locator('#iso-o-clear').click();
    expect((await stats(page)).selected).toEqual([]);
    expect(errors).toEqual([]);
  });
});
