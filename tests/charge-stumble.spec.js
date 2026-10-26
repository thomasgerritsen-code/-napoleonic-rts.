const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
async function open(page,server=false){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(server=>{window.__NRTS_HUMAN_BRITAIN__=true;if(server)window.__NRTS_SERVER__=true;},server);
 await page.goto('/?test=charge-stumble&view=iso&gpu=off');
 await page.waitForFunction(server=>window.__CHARGE_STUMBLE_V1__&&(server?window.__ONLINE_SIM_V1__:window.__ISO_VIEW_V1__?.stats().assets.ready),server);
 return errors;
}
for(const type of ['infantry','cavalry'])test(`${type}: only some running chargers fall, remain alive, recover and resume their order`,async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(type=>{
  const group=Array.from({length:36},(_,i)=>{
   const u=createUnit('france',type,3900,1500+i*25);u.targetX=4700;u.targetY=u.y;u.chargeTimer=7;u.morale=100;return u;
  });
  const fallen=new Map();let heldFrames=0,maxHeldMove=0;
  for(let i=0;i<420;i++){
   const old=group.map(u=>({x:u.x,y:u.y,down:__CHARGE_STUMBLE_V1__.down(u)}));RTS_SIM.step(1/60);
   group.forEach((u,j)=>{if(__CHARGE_STUMBLE_V1__.down(u)){
    if(!fallen.has(u.id))fallen.set(u.id,{x:u.x,y:u.y,hp:u.hp});
    if(old[j].down){heldFrames++;maxHeldMove=Math.max(maxHeldMove,Math.hypot(u.x-old[j].x,u.y-old[j].y));}
   }});
  }
  return{count:fallen.size,heldFrames,maxHeldMove,stats:__CHARGE_STUMBLE_V1__.stats(),
   alive:group.every(u=>!u.dead&&u.hp===u.maxHp),goals:group.every(u=>u.targetX===4700),
   resumed:[...fallen].every(([id,p])=>{const u=group.find(u=>u.id===id);return !__CHARGE_STUMBLE_V1__.down(u)&&u.x>p.x+90;}),
   clean:group.every(u=>!Object.hasOwn(u,'chargeFallAt'))};
 },type);
 console.log('CHARGE_FALL',type,JSON.stringify(r));
 expect(r.count).toBeGreaterThan(0);expect(r.count).toBeLessThan(10);expect(r.stats.falls).toBe(r.count);
 expect(r.stats.recovered).toBe(r.count);expect(r.heldFrames).toBeGreaterThan(80);expect(r.maxHeldMove).toBeLessThan(.01);
 expect(r).toMatchObject({alive:true,goals:true,resumed:true,clean:true});expect(errors).toEqual([]);
});
test('ordinary marching and stationary charges never fall',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  for(let i=0;i<48;i++){const u=createUnit('france',i%2?'infantry':'cavalry',3900,1500+i*20);u.targetX=i<24?4600:u.x;u.targetY=u.y;u.chargeTimer=i<24?0:7;}
  RTS_SIM.step(7);return __CHARGE_STUMBLE_V1__.stats();
 });expect(r.falls).toBe(0);expect(errors).toEqual([]);
});
test('a fallen regiment member keeps its membership and catches up without being pushed while down',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const men=Array.from({length:24},()=>createUnit('france','infantry',3900,1800));
  const reg=createRegiment('france',[...men,createUnit('france','officer',3900,1800),createUnit('france','drummer',3900,1800)]);
  arrangeFacingRegimentV146(reg,3900,1800,'line',0);
  regimentMembers(reg).forEach(u=>{u.x=u.targetX;u.y=u.targetY;});
  orderGroupPathV06(reg,4500,1800,'line',0);men.forEach(u=>{u.chargeTimer=7;u.attackMode='bayonet';});
  const fallen=new Set();let maxHeldMove=0;
  for(let i=0;i<420;i++){
   const old=men.map(u=>({x:u.x,y:u.y,down:__CHARGE_STUMBLE_V1__.down(u)}));RTS_SIM.step(1/60);
   men.forEach((u,j)=>{if(__CHARGE_STUMBLE_V1__.down(u)){
    fallen.add(u.id);if(old[j].down)maxHeldMove=Math.max(maxHeldMove,Math.hypot(u.x-old[j].x,u.y-old[j].y));
   }});
  }
  return{falls:fallen.size,maxHeldMove,intact:men.every(u=>!u.dead&&u.regimentId===reg.id),recovered:men.every(u=>!__CHARGE_STUMBLE_V1__.down(u)),goal:reg.finalTarget.x};
 });expect(r.falls).toBeGreaterThan(0);expect(r.maxHeldMove).toBeLessThan(.01);expect(r).toMatchObject({intact:true,recovered:true,goal:4500});expect(errors).toEqual([]);
});
test('a fallen charger shows fall and rise frames and cannot attack',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const group=Array.from({length:36},(_,i)=>{const u=createUnit('france','cavalry',3900,1500+i*25);u.targetX=4700;u.targetY=u.y;u.chargeTimer=7;return u;});
  let u;
  for(let i=0;i<240&&!u;i++){RTS_SIM.step(1/60);u=group.find(q=>__CHARGE_STUMBLE_V1__.down(q));}
  if(!u)throw Error('No naturally selected charger fell');
  window.__fallenTest=u;camera.x=u.x;camera.y=u.y;camera.zoom=1.7;
  const e=createUnit('britain','worker',u.x+40,u.y);e.hp=e.maxHp=1000;
  u.reload=0;const hp=e.hp;fire(u,e);
  return{id:u.id,until:u.chargeFallUntil,at:u.chargeFallAt,hp:u.hp,notAttacked:e.hp===hp};
 });
 expect(r.notAttacked).toBe(true);expect(r.until-r.at).toBeCloseTo(1.9);
 await page.waitForFunction(id=>!!__ISO_VIEW_V1__.frameOf(id),r.id);
 const sampleFrames=async count=>page.evaluate(async count=>{
  const u=__fallenTest,frames=[];
  for(let i=0;i<count;i++){RTS_SIM.step(1/60);await new Promise(requestAnimationFrame);frames.push(__ISO_VIEW_V1__.frameOf(u.id));}
  return frames;
 },count);
 const frames=await sampleFrames(48);
 await page.screenshot({path:test.info().outputPath('charge-fallen.png')});
 frames.push(...await sampleFrames(60));
 const fall=frames.filter(f=>f?.[1].startsWith('die_'));
 expect(new Set(fall.map(f=>f[2])).size).toBe(4);
 expect(fall[0][2]).toBeLessThan(fall[Math.floor(fall.length/2)][2]);expect(fall.at(-1)[2]).toBeLessThan(3);
 await page.screenshot({path:test.info().outputPath('charge-rising.png')});expect(errors).toEqual([]);
});
