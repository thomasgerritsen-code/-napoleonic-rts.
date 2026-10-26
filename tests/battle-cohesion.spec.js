const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__NRTS_HUMAN_BRITAIN__=true;let seed=1815;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
 await page.goto('/?test=battle-cohesion&view=iso&gpu=off');
 await page.waitForFunction(()=>window.__BATTLE_COHESION_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
const setup=()=>{
 const men=Array.from({length:12},()=>createUnit('france','infantry',3900,1800));
 const reg=createRegiment('france',[...men,createUnit('france','officer',3900,1800),createUnit('france','drummer',3900,1800)]);
 arrangeFacingRegimentV146(reg,3900,1800,'line',0);
 const m=regimentMembers(reg);m.forEach(u=>{u.x=u.targetX;u.y=u.targetY;u.hp=u.maxHp=100;u.morale=54;u.reload=100;});
 const enemy=createUnit('britain','infantry',4050,1800);enemy.hp=enemy.maxHp=10000;enemy.reload=100;enemy.targetX=enemy.x;enemy.targetY=enemy.y;
 window.__cohesionFixture={reg,m,men,enemy};
 return reg.id;
};
test('real morale shocks cause hesitation, a physical withdrawal and safe officer-led reformation',async({page})=>{
 const errors=await open(page);await page.evaluate(setup);
 const r=await page.evaluate(()=>{
  const{reg,m,men,enemy}=__cohesionFixture;const start=centroid(m),phases=[];
  for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,8,3);
  RTS_SIM.step(.3);const first=__BATTLE_COHESION_V1__.state(reg);
  for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,8,5);
  let maxStep=0,spread=0;
  for(let i=0;i<2400;i++){
   const old=m.map(u=>({x:u.x,y:u.y}));RTS_SIM.step(1/60);
   m.forEach((u,j)=>maxStep=Math.max(maxStep,Math.hypot(u.x-old[j].x,u.y-old[j].y)));
   const s=__BATTLE_COHESION_V1__.state(reg);if(!phases.includes(s.phase))phases.push(s.phase);
   spread=Math.max(spread,100-s.cohesion);
   if(s.phase==='ready')break;
  }
  return{first,phases,spread,maxStep,travel:start.x-centroid(m).x,final:__BATTLE_COHESION_V1__.state(reg),stats:__BATTLE_COHESION_V1__.stats(),intact:!reg.destroyed&&m.every(u=>u.regimentId===reg.id&&!u.dead),formation:reg.formation,officer:m.find(u=>u.id===reg.officerId)?.morale};
 });console.log('COHESION_WITHDRAWAL',JSON.stringify(r));
 expect(r.phases).toContain('withdrawing');expect(r.phases).toContain('regrouping');expect(r.phases).toContain('reforming');expect(r.final.phase).toBe('ready');expect(r.travel).toBeGreaterThan(140);expect(r.maxStep).toBeLessThan(3.5);expect(r.intact).toBe(true);expect(r.formation).toBe('line');expect(r.stats.withdrawals).toBe(1);expect(r.spread).toBeGreaterThan(50);expect(errors).toEqual([]);
});
test('an explicit ground order overrides recovery and keeps its destination',async({page})=>{
 const errors=await open(page);await page.evaluate(setup);
 const r=await page.evaluate(()=>{
  const{reg,m,men,enemy}=__cohesionFixture;
  for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,12,7);
  RTS_SIM.step(.4);const before=__BATTLE_COHESION_V1__.state(reg);
  selectWholeRegiment(reg);issueMove(3700,2100);RTS_SIM.step(1);
  return{before,after:__BATTLE_COHESION_V1__.state(reg),target:reg.finalTarget,stats:__BATTLE_COHESION_V1__.stats(),intact:!reg.destroyed};
 });console.log('COHESION_MANUAL',JSON.stringify(r));expect(r.before.goal).toBeTruthy();expect(r.target.x).toBe(3700);expect(r.target.y).toBe(2100);expect(r.stats.interrupted).toBe(1);expect(r.intact).toBe(true);expect(errors).toEqual([]);
});
test('a protected bridge column never receives a new fallback or scattered slots',async({page})=>{
 const errors=await open(page);await page.evaluate(setup);
 const r=await page.evaluate(()=>{
  const{reg,men,enemy}=__cohesionFixture;
  reg.crossingTrafficV068={forcedColumn:true,state:'crossing',crossingId:'pont-crete'};
  for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,10,4);
  elapsed+=.3;refreshRegiment(reg);
  return{state:__BATTLE_COHESION_V1__.state(reg),stats:__BATTLE_COHESION_V1__.stats()};
 });expect(r.stats.withdrawals).toBe(0);expect(r.state.goal).toBeNull();expect(errors).toEqual([]);
});
test('renewed danger interrupts the safe rally and a missing officer cannot restore cohesion',async({page})=>{
 const errors=await open(page);await page.evaluate(setup);
 const r=await page.evaluate(()=>{
  const{reg,m,men,enemy}=__cohesionFixture;
  for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,12,7);
  for(let i=0;i<1200&&__BATTLE_COHESION_V1__.state(reg)?.phase!=='regrouping';i++)RTS_SIM.step(1/60);
  const before=__BATTLE_COHESION_V1__.state(reg),c=centroid(m);
  enemy.x=c.x+100;enemy.y=c.y;enemy.targetX=enemy.x;enemy.targetY=enemy.y;
  RTS_SIM.step(2);const threatened=__BATTLE_COHESION_V1__.state(reg);
  applyDamage(enemy,20000,0);RTS_SIM.step(.3);
  const officer=m.find(u=>u.id===reg.officerId);applyDamage(officer,1000,0);
  m.filter(u=>!u.dead).forEach(u=>u.morale=80);
  RTS_SIM.step(10);
  return{before,threatened,after:__BATTLE_COHESION_V1__.state(reg),stats:__BATTLE_COHESION_V1__.stats(),officerDead:officer.dead};
 });console.log('COHESION_INTERRUPTED_RALLY',JSON.stringify(r));expect(r.before.phase).toBe('regrouping');expect(r.threatened.phase).toBe('threatened');expect(r.threatened.rallyAt).toBeNull();expect(r.after.phase).not.toBe('ready');expect(r.stats.reformed).toBe(0);expect(r.officerDead).toBe(true);expect(errors).toEqual([]);
});
test('a recoverable formation break awards no victory and real destruction still does',async({page})=>{
 const errors=await open(page);await page.evaluate(setup);
 const r=await page.evaluate(()=>{
  const{reg,men,enemy}=__cohesionFixture;
  const attackers=Array.from({length:12},()=>createUnit('britain','infantry',4400,1800));
  const attacking=createRegiment('britain',[...attackers,createUnit('britain','officer',4400,1800),createUnit('britain','drummer',4400,1800)]);
  const source=combatSourceFor(attackers[0]);
  for(const u of men)dealCombatDamage(source,u,12,7);
  RTS_SIM.step(.4);const broken={state:__BATTLE_COHESION_V1__.state(reg),destroyed:reg.destroyed,wins:attacking.victories||0};
  for(const u of regimentMembers(reg))dealCombatDamage(source,u,10000,0);
  refreshRegiment(reg);refreshRegiment(attacking);
  return{broken,destroyed:reg.destroyed,wins:attacking.victories||0};
 });expect(r.broken.state.phase).toBe('broken');expect(r.broken.destroyed).toBe(false);expect(r.broken.wins).toBe(0);expect(r.destroyed).toBe(true);expect(r.wins).toBe(1);expect(errors).toEqual([]);
});
test('a cavalry regiment withdraws and reforms around its mounted officer',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const officer=createUnit('france','officer',3900,1800);__TROOPS_V1__.applyTroop(officer,'mounted');
  const riders=Array.from({length:4},()=>createUnit('france','cavalry',3900,1800));
  const reg=createCavalryRegimentV06('france',[officer,...riders]);arrangeRegiment(reg,3900,1800,'line');
  const m=regimentMembers(reg);m.forEach(u=>{u.x=u.targetX;u.y=u.targetY;u.morale=54;u.reload=100;});
  const enemy=createUnit('britain','infantry',4050,1800);enemy.hp=enemy.maxHp=10000;enemy.reload=100;
  for(const u of riders)dealCombatDamage(combatSourceFor(enemy),u,14,8);
  const phases=[];let maxStep=0;
  for(let i=0;i<1800;i++){
   const old=m.map(u=>({x:u.x,y:u.y}));RTS_SIM.step(1/60);
   m.forEach((u,j)=>maxStep=Math.max(maxStep,Math.hypot(u.x-old[j].x,u.y-old[j].y)));
   const s=__BATTLE_COHESION_V1__.state(reg);if(s&&!phases.includes(s.phase))phases.push(s.phase);if(s?.phase==='ready')break;
  }
  return{phases,maxStep,stats:__BATTLE_COHESION_V1__.stats(),formation:reg.formation,intact:!reg.destroyed&&m.every(u=>!u.dead&&u.regimentId===reg.id),mounted:officer.troop==='mounted'};
 });console.log('CAVALRY_COHESION',JSON.stringify(r));expect(r.phases).toContain('withdrawing');expect(r.phases).toContain('ready');expect(r.formation).toBe('line');expect(r.intact).toBe(true);expect(r.mounted).toBe(true);expect(r.maxStep).toBeLessThan(4);expect(errors).toEqual([]);
});
test('an AI order cannot cancel a recovering regiment',async({page})=>{
 const errors=await open(page);await page.evaluate(setup);
 const r=await page.evaluate(()=>{
  const{reg,men,enemy}=__cohesionFixture;
  for(const u of men)dealCombatDamage(combatSourceFor(enemy),u,12,7);RTS_SIM.step(.4);
  const before={...reg.finalTarget};aiOrderReg(reg,{x:4400,y:1800},'line',0);RTS_SIM.step(.2);
  return{before,after:reg.finalTarget,stats:__BATTLE_COHESION_V1__.stats()};
 });expect(r.after).toEqual(r.before);expect(r.stats.interrupted).toBe(0);expect(errors).toEqual([]);
});
