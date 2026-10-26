const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__NRTS_HUMAN_BRITAIN__=true;let seed=1815;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
 await page.goto('/?test=volley-care&view=iso&gpu=off');
 await page.waitForFunction(()=>window.__RANK_VOLLEY_V1__&&window.__FIELD_CARE_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
test('the real front rank fires before the rear rank on a regiment clock, with visible kneeling and reloading',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(async()=>{
  const men=Array.from({length:12},()=>createUnit('france','infantry',3900,1800));
  const reg=createRegiment('france',[...men,createUnit('france','officer',3900,1800),createUnit('france','drummer',3900,1800)]);reg.facing=0;
  const offsets=finalFormationOffsetsV063(reg,'line');
  for(const u of regimentMembers(reg)){const o=offsets.get(u.id);u.x=u.targetX=3900+o.ox;u.y=u.targetY=1800+o.oy;u.hp=u.maxHp=4000;u.morale=100;u.reload=u.type==='infantry'?0:100;u.facing=0;}
  for(let i=0;i<6;i++){const e=createUnit('britain','infantry',4000,1755+i*18);e.hp=e.maxHp=4000;e.reload=100;e.targetX=e.x;e.targetY=e.y;}
  const ids=new Set(men.map(u=>u.id)),shots=[],base=fire;
  fire=function(u,e){const before=projectiles.length,result=base(u,e);if(ids.has(u.id)&&projectiles.length>before)shots.push({id:u.id,rank:u.volleyRank,at:elapsed,reload:u.reload});return result;};
  volleyClock=1.2;camera.x=3950;camera.y=1800;camera.zoom=1.6;const start=elapsed;
  let kneeling=0,reloading=0;
  for(let i=0;i<480;i++){
   RTS_SIM.step(1/60);
   if(i<120){await new Promise(requestAnimationFrame);for(const u of men){const f=__ISO_VIEW_V1__.frameOf(u.id);if(f?.[1].startsWith('kfire_'))kneeling++;if(f?.[1].startsWith('reload_'))reloading++;}}
  }
  const front=shots.filter(s=>s.rank===0),rear=shots.filter(s=>s.rank===1);
  return{shots,front:first(front),rear:first(rear),kneeling,reloading,stats:__RANK_VOLLEY_V1__.stats(),variety:new Set(shots.map(s=>s.reload.toFixed(3))).size};
  function first(a){return a.slice(0,6).map(s=>s.at-start);}
 });console.log('RANK_VOLLEY',JSON.stringify(r));
 expect(r.front).toHaveLength(6);expect(r.rear).toHaveLength(6);expect(Math.max(...r.front)).toBeLessThan(.6);expect(Math.min(...r.rear)-Math.max(...r.front)).toBeGreaterThan(.35);
 expect(r.kneeling).toBeGreaterThan(0);expect(r.reloading).toBeGreaterThan(0);expect(r.variety).toBeGreaterThan(3);expect(r.stats.shots).toBeGreaterThan(20);expect(r.stats.cycles).toBeGreaterThan(1);expect(errors).toEqual([]);
});
test('walking wounds slow real motion, and a safe hospital treats the most injured first',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const healthy=createUnit('france','infantry',3900,1500),hurt=createUnit('france','infantry',3900,1700);for(const u of[healthy,hurt]){u.hp=u.maxHp=100;u.targetX=4100;u.targetY=u.y;}
  applyDamage(hurt,60,0);RTS_SIM.step(1);
  const motion={healthy:healthy.x-3900,hurt:hurt.x-3900,level:hurt.injuryLevel};
  const targets=[healthy,hurt].map(u=>{const e=createUnit('britain','infantry',u.x+70,u.y);e.hp=e.maxHp=10000;e.reload=100;return e;});
  const random=Math.random;Math.random=()=>.5;try{healthy.reload=hurt.reload=0;fire(healthy,targets[0]);fire(hurt,targets[1]);}finally{Math.random=random;}
  motion.healthyReload=healthy.reload;motion.hurtReload=hurt.reload;
  const hospital=createBuilding('france','hospital',3900,2100,true);
  const patients=[25,40,55].map((hp,i)=>{const u=createUnit('france','infantry',3984,2070+i*30);u.hp=u.maxHp=100;applyDamage(u,100-hp,0);u.targetX=u.x;u.targetY=u.y;return u;});
  RTS_SIM.step(6);const first=patients.map(u=>u.hp);
  const enemy=createUnit('britain','infantry',4050,2100);enemy.hp=enemy.maxHp=10000;enemy.reload=100;
  const before=patients.map(u=>u.hp);RTS_SIM.step(3);const underFire=patients.map(u=>u.hp);
  applyDamage(enemy,20000,0);RTS_SIM.step(40);
  return{motion,first,before,underFire,after:patients.map(u=>({id:u.id,hp:u.hp,max:u.maxHp,level:u.injuryLevel||0,bandaged:Number.isFinite(u.bandagedAt)})),stats:__FIELD_CARE_V1__.stats()};
 });console.log('WALKING_WOUNDS',JSON.stringify(r));expect(r.motion.level).toBe(1);expect(r.motion.hurtReload).toBeGreaterThan(r.motion.healthyReload*1.05);expect(r.motion.hurt).toBeLessThan(r.motion.healthy*.9);expect(r.motion.hurt).toBeGreaterThan(r.motion.healthy*.6);
 expect(r.first[0]).toBeGreaterThan(25);expect(r.first[1]).toBeGreaterThan(40);expect(r.first[2]).toBe(55);expect(r.underFire).toEqual(r.before);
 expect(r.after.every(u=>u.hp===u.max&&u.level===0&&u.bandaged)).toBe(true);expect(errors).toEqual([]);
});
test('stretcher teams go around walls, heal a casualty and preserve the regiment destination',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const men=Array.from({length:12},()=>createUnit('france','infantry',4300,1800));
  const reg=createRegiment('france',[...men,createUnit('france','officer',4300,1800),createUnit('france','drummer',4300,1800)]);arrangeFacingRegimentV146(reg,4300,1800,'line',0);
  regimentMembers(reg).forEach(u=>{u.x=u.targetX;u.y=u.targetY;u.morale=100;u.reload=100;});
  const victim=men[0],hp=victim.hp;applyDamage(victim,hp+1,0);const w=__MEDICS_V1__.byId(victim.id)||__MEDICS_V1__.wound(victim);
  const h=createBuilding('france','hospital',4150,1800,true);orderGroupPathV06(reg,4500,1800,'line',0);
  let unsafe=0,maxStep=0;const previous=new Map(),states=new Set();
  for(let i=0;i<4800&&w.state!=='healed';i++){
   RTS_SIM.step(1/60);states.add(w.state);
   for(const t of __MEDICS_V1__.teams()){
    const old=previous.get(t.id);if(old){maxStep=Math.max(maxStep,Math.hypot(t.x-old.x,t.y-old.y));if(waterAtV067(t.x,t.y)||__STUCK_RECOVERY_V2__.segmentBlocked(old,t))unsafe++;}previous.set(t.id,{x:t.x,y:t.y});
   }
  }
  const restored=units.find(u=>u.id===w.healedAs);
  return{state:w.state,states:[...states],unsafe,maxStep,goal:reg.finalTarget,targetX:reg.targetX,rejoined:restored?.regimentId===reg.id,bandaged:Number.isFinite(restored?.bandagedAt),count:regimentMembers(reg).filter(u=>u.type==='infantry').length,formed:reg.formedInfantryCount,stats:__MEDICS_V1__.stats()};
 });console.log('MEDICAL_RESCUE',JSON.stringify(r));expect(r.state).toBe('healed');expect(r.states).toContain('carried');expect(r.states).toContain('healing');expect(r.unsafe).toBe(0);expect(r.maxStep).toBeLessThan(1);expect(r.goal.x).toBe(4500);expect(r.targetX).toBe(4500);expect(r.rejoined).toBe(true);expect(r.bandaged).toBe(true);expect(r.count).toBe(12);expect(r.formed).toBe(12);expect(errors).toEqual([]);
});
test('triage sends the first team to the urgent casualty and a lost hospital does not erase its patients',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const h=createBuilding('france','hospital',3900,1800,true),near=createUnit('france','infantry',3900,1880),urgent=createUnit('france','infantry',4040,1850);
  for(const u of[near,urgent]){applyDamage(u,u.hp+1,0);if(!__MEDICS_V1__.byId(u.id))__MEDICS_V1__.wound(u);}
  const old=__MEDICS_V1__.byId(urgent.id);old.at=elapsed-55;
  RTS_SIM.step(.1);const first=__MEDICS_V1__.teams().find(t=>t.hospital===h.id)?.target?.id;
  const patient=__MEDICS_V1__.byId(near.id);
  for(let i=0;i<900&&patient.state!=='healing';i++)RTS_SIM.step(1/60);
  const before=patient.state;applyDamage(h,h.hp+1,0);RTS_SIM.step(.1);
  return{first,urgent:urgent.id,before,after:patient.state,remaining:__MEDICS_V1__.config.bleedOutSeconds-(elapsed-patient.at),records:__MEDICS_V1__.wounded().filter(w=>w.id===near.id).length,team:patient.team};
 });console.log('MEDICAL_TRIAGE',JSON.stringify(r));expect(r.first).toBe(r.urgent);expect(r.before).toBe('healing');expect(r.after).toBe('lying');expect(r.remaining).toBeGreaterThan(40);expect(r.records).toBe(1);expect(r.team).toBeNull();expect(errors).toEqual([]);
});
test('a stretcher team uses a bridge rather than crossing blocked water',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const c=WATER_CROSSINGS_V067[2],a=crossingPointV068(c,-c.length/2-110,0),b=crossingPointV068(c,c.length/2+110,0);
  const h=createBuilding('france','hospital',a.x,a.y,true),u=createUnit('france','infantry',b.x,b.y);
  applyDamage(u,u.hp+1,0);const w=__MEDICS_V1__.byId(u.id)||__MEDICS_V1__.wound(u);
  let waterSteps=0,deckFrames=0;const previous=new Map();
  for(let i=0;i<3000&&w.state!=='healing';i++){
   RTS_SIM.step(1/60);
   for(const t of __MEDICS_V1__.teams().filter(t=>t.hospital===h.id)){
    const p=previous.get(t.id);if(p&&(waterAtV067(t.x,t.y)||segmentCrossesBlockedWaterV067(p.x,p.y,t.x,t.y)))waterSteps++;
    if(crossingAtV067(t.x,t.y))deckFrames++;previous.set(t.id,{x:t.x,y:t.y});
   }
  }
  return{state:w.state,waterSteps,deckFrames,stats:__MEDICS_V1__.stats()};
 });console.log('MEDICAL_BRIDGE',JSON.stringify(r));expect(r.state).toBe('healing');expect(r.waterSteps).toBe(0);expect(r.deckFrames).toBeGreaterThan(0);expect(errors).toEqual([]);
});
test('wet powder can misfire without a ball, while a bayonet still works in rain',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  __WEATHER_V1__.set('rain',120);RTS_SIM.step(16);
  const u=createUnit('france','infantry',3900,1800),e=createUnit('britain','infantry',3914,1800);e.hp=e.maxHp=10000;e.facing=0;
  let failed=false,balls=0;
  for(let i=0;i<50&&!failed;i++){
   elapsed+=.01;u.reload=0;const count=projectiles.length,misfires=__WEATHER_V1__.stats().misfires;fire(u,e);
   if(__WEATHER_V1__.stats().misfires>misfires){failed=true;balls=projectiles.length-count;}
  }
  const prior=__WEATHER_V1__.stats().misfires,hp=e.hp;u.attackMode='bayonet';u.reload=0;fire(u,e);
  return{rain:__WEATHER_V1__.state().rain,failed,balls,bayonetDamage:hp-e.hp,extraMisfires:__WEATHER_V1__.stats().misfires-prior};
 });expect(r.rain).toBeGreaterThan(.3);expect(r.failed).toBe(true);expect(r.balls).toBe(0);expect(r.bayonetDamage).toBeGreaterThan(0);expect(r.extraMisfires).toBe(0);expect(errors).toEqual([]);
});
