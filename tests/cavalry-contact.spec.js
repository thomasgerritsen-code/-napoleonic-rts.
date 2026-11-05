const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__NRTS_HUMAN_BRITAIN__=true;let seed=1815;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
 await page.goto('/?test=cavalry-contact&view=iso&gpu=off');
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready&&window.__TROOPS_V1__);
 return errors;
}
test('an attack click with a mounted commander approaches melee rather than musket distance',async({page})=>{
 const errors=await open(page);
 const click=await page.evaluate(()=>{
  const officer=createUnit('france','officer',3900,1800);__TROOPS_V1__.applyTroop(officer,'mounted');
  const horse=Array.from({length:4},(_,i)=>createUnit('france','cavalry',3900,1760+i*27));
  const reg=createCavalryRegimentV06('france',[...horse,officer]);selectWholeRegiment(reg);
  const foe=createUnit('britain','infantry',4140,1800);foe.hp=foe.maxHp=10000;
  camera.x=4020;camera.y=1800;camera.zoom=1.2;
  window.__cavAttackTest={reg,foe};return __ISO_VIEW_V1__.screenOf(foe.x,foe.y);
 });
 await page.mouse.click(click.x,click.y,{button:'right'});
 const distance=await page.evaluate(()=>Math.hypot(__cavAttackTest.reg.finalTarget.x-__cavAttackTest.foe.x,__cavAttackTest.reg.finalTarget.y-__cavAttackTest.foe.y));
 expect(distance).toBeLessThan(30);expect(errors).toEqual([]);
});
for(const foeType of ['infantry','cavalry'])test(`a rider sustains close combat against ${foeType} with continuous movement and no repeated facing flips`,async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(type=>{
  const rider=createUnit('france','cavalry',3900,1800),foe=createUnit('britain',type,4030,1800);
  for(const u of[rider,foe]){u.hp=u.maxHp=10000;u.morale=100;u.reload=.1;}
  rider.targetX=4190;rider.targetY=1800;rider.chargeTimer=7;rider.facing=0;
  foe.targetX=foe.x;foe.targetY=foe.y;foe.facing=Math.PI;
  let hits=0,previousHp=foe.hp,maxStep=0,maxTurn=0,closeFrames=0;const distances=[];
  for(let i=0;i<360;i++){
   // Keep this sustained-contact fixture from turning into a rout after three
   // ordinary charge shocks. Damage, reloads, attacks and movement remain real.
   rider.morale=foe.morale=100;
   const p={x:rider.x,y:rider.y,facing:rider.facing};RTS_SIM.step(1/60);
   if(foe.hp<previousHp){hits++;previousHp=foe.hp;}
   maxStep=Math.max(maxStep,Math.hypot(rider.x-p.x,rider.y-p.y));maxTurn=Math.max(maxTurn,Math.abs(normalizeFacing(rider.facing-p.facing)));
   const d=Math.hypot(rider.x-foe.x,rider.y-foe.y);if(i>120){distances.push(d);if(d<25)closeFrames++;}
  }
  return{hits,maxStep,maxTurn,closeFrames,minDistance:Math.min(...distances),maxDistance:Math.max(...distances),riderAlive:!rider.dead};
 },foeType);
 console.log('CAVALRY_CONTACT',foeType,JSON.stringify(r));
 expect(r.hits).toBeGreaterThanOrEqual(4);expect(r.closeFrames).toBeGreaterThan(180);expect(r.maxStep).toBeLessThan(3.5);expect(r.maxTurn).toBeLessThan(.35);expect(r.minDistance).toBeGreaterThan(foeType==='cavalry'?18:16);expect(r.maxDistance).toBeLessThan(28);expect(r.riderAlive).toBe(true);expect(errors).toEqual([]);
});
test('a rider retains a living opponent, retargets a fallen man and obeys an immediate retreat',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const u=createUnit('france','cavalry',3970,1800),e=createUnit('britain','infantry',4010,1800);
  for(const q of[u,e]){q.hp=q.maxHp=10000;q.morale=100;}u.targetX=4170;u.targetY=1800;u.chargeTimer=7;
  RTS_SIM.step(.8);const first=__CAVALRY_CONTACT_V1__.state(u)?.enemyId;
  const second=createUnit('britain','infantry',e.x,e.y+8);second.hp=second.maxHp=10000;
  RTS_SIM.step(.1);const retained=__CAVALRY_CONTACT_V1__.state(u)?.enemyId;
  applyDamage(e,20000,0);RTS_SIM.step(.1);const switched=__CAVALRY_CONTACT_V1__.state(u)?.enemyId;
  selectedUnits.clear();selectedBuilding=null;selectedUnits.add(u);const before=u.x;
  issueMove(3820,1800);RTS_SIM.step(1.2);
  return{first:first===e.id,retained:retained===e.id,switched:switched===second.id,retreat:before-u.x,clear:__CAVALRY_CONTACT_V1__.state(u)===null,goal:u.targetX};
 });expect(r).toMatchObject({first:true,retained:true,switched:true,clear:true,goal:3820});expect(r.retreat).toBeGreaterThan(60);expect(errors).toEqual([]);
});
test('a routed opponent is released and a combat halt never triggers stuck-recovery nudges',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const u=createUnit('france','cavalry',3970,1800),e=createUnit('britain','infantry',4010,1800);
  for(const q of[u,e]){q.hp=q.maxHp=10000;q.morale=100;}u.targetX=4170;u.targetY=1800;u.chargeTimer=7;
  const before=__STUCK_RECOVERY_V2__.stats().unitNudges;
  for(let i=0;i<360;i++){u.morale=100;RTS_SIM.step(1/60);}
  return{routed:e.routing,released:__CAVALRY_CONTACT_V1__.state(u)===null,nudges:__STUCK_RECOVERY_V2__.stats().unitNudges-before,goal:u.targetX};
 });expect(r).toEqual({routed:true,released:true,nudges:0,goal:4170});expect(errors).toEqual([]);
});
test('contact steps respect wet ground, a trench and building and river barriers',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  function approach(wet,trench=false){
   __WEATHER_V1__.setWetness(wet);const u=createUnit('france','cavalry',3940,1800),e=createUnit('britain','infantry',4000,1800);
   for(const q of[u,e]){q.hp=q.maxHp=10000;q.morale=100;}u.targetX=4140;u.targetY=1800;u.chargeTimer=7;
   if(trench)__REGIMENT_ORDERS_V1__.trenches().push({id:99999,x:3970,y:1800,facing:0,width:30,length:120,progress:1,level:1});
   for(let i=0;i<20;i++){u.morale=e.morale=100;RTS_SIM.step(1/60);}
   const result={travel:u.x-3940,charge:u.chargeTimer};u.dead=e.dead=true;__REGIMENT_ORDERS_V1__.trenches().length=0;return result;
  }
  const dry=approach(0),wet=approach(1),trench=approach(0,true);
  const b=createBuilding('france','house',4000,1800,true),u=createUnit('france','cavalry',b.x-b.w/2-25,b.y),e=createUnit('britain','infantry',b.x+b.w/2+25,b.y);
  u.targetX=e.x;u.targetY=e.y;u.chargeTimer=7;rebuildCombatSpatialHashV062();updateUnit(u,1/60);
  const houseClear=__CAVALRY_CONTACT_V1__.state(u)===null;
  u.dead=e.dead=true;
  const y=300,x=riverCenterXAtYV067(y),a=createUnit('france','cavalry',x-RIVER_NAV_HALF_WIDTH_V067-8,y),foe=createUnit('britain','infantry',x+RIVER_NAV_HALF_WIDTH_V067+8,y);
  a.targetX=foe.x;a.targetY=foe.y;a.chargeTimer=7;rebuildCombatSpatialHashV062();updateUnit(a,1/60);
  return{dry,wet,trench,houseClear,riverClear:__CAVALRY_CONTACT_V1__.state(a)===null,chargesBroken:__REGIMENT_ORDERS_V1__.stats().chargesBroken||0};
 });expect(r.wet.travel).toBeLessThan(r.dry.travel);expect(r.trench.travel).toBeLessThan(r.dry.travel);expect(r.trench.charge).toBe(0);expect(r.chargesBroken).toBeGreaterThan(0);expect(r.houseClear).toBe(true);expect(r.riverClear).toBe(true);expect(errors).toEqual([]);
});
test('a real sword strike completes its frames while stepping and a waiting charge does not slash the air',async({page})=>{
 const errors=await open(page);
 const id=await page.evaluate(()=>{
  const u=createUnit('france','cavalry',4000,1800),e=createUnit('britain','infantry',4017,1800);
  u.chargeTimer=7;u.reload=0;u.targetX=u.x;u.targetY=u.y;window.__cavalryAnimation={u,e};camera.x=4000;camera.y=1800;camera.zoom=1.6;return u.id;
 });
 await expect.poll(()=>page.evaluate(id=>__ISO_VIEW_V1__.frameOf(id)?.[1],id)).toMatch(/^idle_/);
 await page.evaluate(()=>{const {u,e}=__cavalryAnimation;fire(u,e);u.x+=1;});
 await expect.poll(()=>page.evaluate(id=>__ISO_VIEW_V1__.frameOf(id)?.[1],id)).toMatch(/^slash_/);
 // Sample consecutive display frames inside the page; host/proxy scheduling
 // must not turn a 200 ms test delay into a wait past the whole 540 ms strike.
 const frames=await page.evaluate(id=>new Promise(resolve=>{const frames=[];let start=null;function sample(now){start??=now;const frame=__ISO_VIEW_V1__.frameOf(id);if(frame?.[1].startsWith('slash_'))frames.push(frame[2]);if(now-start<300)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);}),id);
 expect(frames.length).toBeGreaterThan(0);expect(frames.every((f,i)=>f>=0&&f<=2&&(!i||f>=frames[i-1]))).toBe(true);expect(await page.evaluate(()=>__cavalryAnimation.e.hp)).toBeLessThan(100);
 await page.screenshot({path:test.info().outputPath('cavalry-sword-contact.png')});expect(errors).toEqual([]);
});
test('mounted regiments hold a real melee without formation replans or large corrective jumps',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const officer=createUnit('france','officer',3900,1800);__TROOPS_V1__.applyTroop(officer,'mounted');
  const riders=Array.from({length:4},()=>createUnit('france','cavalry',3900,1800));
  const cavalry=createCavalryRegimentV06('france',[...riders,officer]);
  const men=Array.from({length:12},()=>createUnit('britain','infantry',4120,1800));
  const foot=createRegiment('britain',[...men,createUnit('britain','officer',4120,1800),createUnit('britain','drummer',4120,1800)]);
  arrangeRegiment(cavalry,3900,1800,'line');arrangeFacingRegimentV146(foot,4120,1800,'line',Math.PI);
  const all=[...regimentMembers(cavalry),...regimentMembers(foot)];
  for(const u of all){u.x=u.targetX;u.y=u.targetY;u.hp=u.maxHp=10000;u.morale=100;}
  orderGroupPathV06(cavalry,4120,1800,'line',0);riders.forEach(u=>u.chargeTimer=7);
  const before=__STUCK_RECOVERY_V2__.stats();let maxStep=0,contactFrames=0;
  for(let i=0;i<720;i++){
   const old=riders.map(u=>({x:u.x,y:u.y}));all.forEach(u=>u.morale=100);RTS_SIM.step(1/60);
   riders.forEach((u,j)=>maxStep=Math.max(maxStep,Math.hypot(u.x-old[j].x,u.y-old[j].y)));
   if(__CAVALRY_CONTACT_V1__.engaged(cavalry))contactFrames++;
  }
  const groupReplans=__STUCK_RECOVERY_V2__.stats().groupReplans-before.groupReplans,start=centroid(regimentMembers(cavalry));
  selectWholeRegiment(cavalry);issueMove(3820,1800);RTS_SIM.step(1.2);
  const end=centroid(regimentMembers(cavalry));
  return{contactFrames,maxStep,groupReplans,intact:!cavalry.destroyed&&riders.every(u=>u.regimentId===cavalry.id),strikes:__CAVALRY_CONTACT_V1__.stats().strikes,retreat:start.x-end.x,released:!__CAVALRY_CONTACT_V1__.engaged(cavalry)};
 });console.log('MOUNTED_REGIMENT_MELEE',JSON.stringify(r));expect(r.contactFrames).toBeGreaterThan(300);expect(r.maxStep).toBeLessThan(4.5);expect(r.groupReplans).toBe(0);expect(r.intact).toBe(true);expect(r.strikes).toBeGreaterThan(12);expect(r.retreat).toBeGreaterThan(50);expect(r.released).toBe(true);expect(errors).toEqual([]);
});
