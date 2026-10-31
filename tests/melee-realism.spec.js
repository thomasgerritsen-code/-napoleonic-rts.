const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__NRTS_HUMAN_BRITAIN__=true;let seed=1815;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
 await page.goto('/?test=melee-realism&view=iso&gpu=off');
 await page.waitForFunction(()=>window.__MELEE_REALISM_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
test('a running charge transfers bounded momentum; fatigue, supporting ranks and square reduce its force',async({page})=>{
 const errors=await open(page);
 const results=await page.evaluate(()=>{
  function run(kind){
   resetGame();__WEATHER_V1__.setWetness(0);
   const u=createUnit('france','cavalry',3900,1800),e=createUnit('britain','infantry',4080,1800);
   for(const a of[u,e]){a.hp=a.maxHp=10000;a.morale=100;a.reload=100;}u.reload=0;u.chargeTimer=7;u.targetX=4300;u.targetY=1800;u.facing=0;u.staminaV1=kind==='tired'?8:100;
   e.facing=Math.PI;e.targetX=e.x;e.targetY=e.y;
   if(kind==='dense'||kind==='square'){
    const members=Array.from({length:11},(_,i)=>createUnit('britain','infantry',4080,1800));
    const reg=createRegiment('britain',[e,...members,createUnit('britain','officer',4080,1800),createUnit('britain','drummer',4080,1800)]);
    reg.formation=kind==='square'?'square':'line';
    regimentMembers(reg).forEach((a,i)=>{a.x=a.targetX=4080+(i%3)*15;a.y=a.targetY=1800+Math.floor(i/3)*15;a.hp=a.maxHp=10000;a.reload=100;a.morale=100;});
   }
   let maxStep=0,maxPush=0,observed=false,frames=0,damage=0,power=0,speed=0;
   const start=e.x;
   for(let i=0;i<360;i++){
    u.morale=e.morale=100;const p={x:e.x,y:e.y};RTS_SIM.step(1/60);
    maxStep=Math.max(maxStep,Math.hypot(e.x-p.x,e.y-p.y));maxPush=Math.max(maxPush,e.x-start);
    if(__MELEE_REALISM_V1__.stats().impacts){if(!observed){observed=true;power=__MELEE_REALISM_V1__.stats().lastPower;speed=__MELEE_REALISM_V1__.stats().lastSpeed;damage=10000-e.hp;}frames++;if(frames>45)break;}
   }
   return{kind,power,speed,maxStep,maxPush,damage,impacts:__MELEE_REALISM_V1__.stats().impacts,charge:u.chargeTimer,goal:u.targetX,alive:!e.dead};
  }
  return['fresh','tired','dense','square'].map(run);
 });console.log('REAL_CHARGE_IMPACTS',JSON.stringify(results));
 const[fresh,tired,dense,square]=results;
 for(const r of results){expect(r.impacts).toBe(1);expect(r.charge).toBe(0);expect(r.damage).toBeGreaterThan(0);expect(r.maxStep).toBeLessThan(3.5);expect(r.goal).toBe(4300);expect(r.alive).toBe(true);}
 expect(fresh.maxPush).toBeGreaterThan(1);expect(fresh.power).toBeGreaterThan(tired.power);expect(fresh.power).toBeGreaterThan(dense.power);expect(dense.power).toBeGreaterThan(square.power);expect(errors).toEqual([]);
});
test('bayonets strike immediately without musket projectiles and repeated real duels include parries',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const actors=[];
  for(let i=0;i<8;i++){
   const type=i<4?'infantry':'cavalry';
   const a=createUnit('france',type,3900,1600+i*65),b=createUnit('britain',type,type==='infantry'?3914:3920,1600+i*65);
   for(const u of[a,b]){u.hp=u.maxHp=10000;u.morale=100;u.attackMode='bayonet';u.targetX=u.x;u.targetY=u.y;u.reload=.1;}
   a.facing=0;b.facing=Math.PI;actors.push(a,b);
  }
  const shots=projectiles.length,smoke=__ISO_VIEW_V1__.stats().smoke;
  const victim=actors[1],hp=victim.hp;fire(actors[0],victim);
  const immediate=hp-victim.hp,noBall=projectiles.length===shots;
  let guard=0,recoil=0,variants=new Set();
  for(let i=0;i<600;i++){
   actors.forEach(u=>u.morale=100);RTS_SIM.step(1/60);
   for(const u of actors){if(u.meleeAction==='parry')guard++;if(u.meleeAction==='recoil')recoil++;if(u.meleeAction==='strike')variants.add(u.meleeVariant);}
  }
  window.__realDuel=actors;camera.x=3910;camera.y=1750;camera.zoom=1.6;
  return{immediate,noBall,guard,recoil,variants:[...variants],stats:__MELEE_REALISM_V1__.stats(),musketSmoke:__ISO_VIEW_V1__.stats().smoke-smoke,goals:actors.every(u=>Number.isFinite(u.targetX)),alive:actors.every(u=>!u.dead)};
 });console.log('REAL_MELEE_DUELS',JSON.stringify(r));expect(r.immediate).toBeGreaterThan(0);expect(r.noBall).toBe(true);expect(r.guard).toBeGreaterThan(0);expect(r.recoil).toBeGreaterThan(0);expect(r.stats.parries).toBeGreaterThan(0);expect(r.variants.sort()).toEqual([0,1]);expect(r.goals).toBe(true);expect(r.alive).toBe(true);
 await page.screenshot({path:test.info().outputPath('melee-duels.png')});expect(errors).toEqual([]);
});
test('a stationary cavalry charge has no invented collision momentum',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const u=createUnit('france','cavalry',3900,1800),e=createUnit('britain','infantry',3917,1800);for(const a of[u,e]){a.hp=a.maxHp=10000;a.morale=100;a.targetX=a.x;a.targetY=a.y;}u.chargeTimer=7;
  RTS_SIM.step(.1);return __MELEE_REALISM_V1__.stats();
 });expect(r.impacts).toBe(0);expect(errors).toEqual([]);
});
test('a bayonet reaches a horse at its physical contact distance',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const u=createUnit('france','infantry',3900,1800),e=createUnit('britain','cavalry',3917.2,1800);
  for(const q of[u,e]){q.hp=q.maxHp=10000;q.morale=100;q.targetX=q.x;q.targetY=q.y;q.reload=100;}
  u.attackMode='bayonet';u.reload=0;u.facing=0;e.facing=Math.PI;
  RTS_SIM.step(.1);return{damage:10000-e.hp,action:u.meleeAction,bullets:projectiles.filter(p=>p.source?.side==='france').length};
 });expect(r.damage).toBeGreaterThan(0);expect(r.action).toBe('strike');expect(r.bullets).toBe(0);expect(errors).toEqual([]);
});
test('hard contacts can knock opponents down and wall clearance stops the recoil',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const victims=[],all=[];
  for(let i=0;i<16;i++){
   const u=createUnit('france','cavalry',3900,1500+i*65),e=createUnit('britain','infantry',4080,1500+i*65);
   for(const q of[u,e]){q.hp=q.maxHp=10000;q.morale=100;q.targetX=q.x;q.targetY=q.y;q.reload=100;}
   u.targetX=4300;u.chargeTimer=7;u.reload=0;u.facing=0;e.facing=Math.PI;victims.push(e);all.push(u,e);
  }
  const fallen=new Set();let maxStep=0;
  for(let i=0;i<360;i++){
   const old=all.map(u=>({x:u.x,y:u.y}));all.forEach(u=>u.morale=100);RTS_SIM.step(1/60);
   all.forEach((u,j)=>maxStep=Math.max(maxStep,Math.hypot(u.x-old[j].x,u.y-old[j].y)));
   victims.forEach(u=>{if(__CHARGE_STUMBLE_V1__.down(u))fallen.add(u.id);});
  }
  const result={falls:fallen.size,stats:__MELEE_REALISM_V1__.stats(),maxStep,intact:all.every(u=>!u.dead)};
  resetGame();const u=createUnit('france','cavalry',3900,1800),e=createUnit('britain','infantry',4080,1800);
  for(const q of[u,e]){q.hp=q.maxHp=10000;q.morale=100;q.reload=100;q.targetX=q.x;q.targetY=q.y;}
  u.targetX=4300;u.chargeTimer=7;u.reload=0;u.facing=0;e.facing=Math.PI;
  const wall=createBuilding('britain','house',4200,1800,true);wall.x=e.x+wall.w/2+10;
  let maxPush=0;for(let i=0;i<240;i++){u.morale=e.morale=100;RTS_SIM.step(1/60);maxPush=Math.max(maxPush,e.x-4080);}
  return{...result,wall:{maxPush,blocked:__MELEE_REALISM_V1__.stats().blockedSteps,impacts:__MELEE_REALISM_V1__.stats().impacts}};
 });console.log('CONTACT_KNOCKDOWNS',JSON.stringify(r));expect(r.falls).toBeGreaterThan(0);expect(r.stats.knockdowns).toBe(r.falls);expect(r.maxStep).toBeLessThan(3.5);expect(r.intact).toBe(true);expect(r.wall.impacts).toBe(1);expect(r.wall.blocked).toBeGreaterThan(0);expect(r.wall.maxPush).toBeLessThan(3.1);expect(errors).toEqual([]);
});
