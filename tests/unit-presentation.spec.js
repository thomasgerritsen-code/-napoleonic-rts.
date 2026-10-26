const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function open(page,query=''){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__NRTS_HUMAN_BRITAIN__=true;let seed=1815;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};});
 await page.goto('/?test=unit-presentation&view=iso'+query);
 await page.waitForFunction(()=>window.__UNIT_PRESENTATION_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
for(const mobile of[false,true])test(`real marching, turning and stopping use continuous poses on ${mobile?'mobile Canvas':'desktop GPU'}`,async({browser})=>{
 const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1280,height:900}});
 try{
  const page=await context.newPage(),errors=await open(page,mobile?'':'&gpu=on');
  const r=await page.evaluate(async()=>{
   resetGame();const foot=createUnit('france','infantry',3900,1740),horse=createUnit('france','cavalry',3900,1830);
   for(const u of[foot,horse]){u.targetX=4250;u.targetY=u.y;u.reload=100;}
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   camera.x=3980;camera.y=1800;camera.zoom=1.8;const records=[];
   for(let i=0;i<160;i++){
    if(i===80){horse.targetX=horse.x;horse.targetY=horse.y+200;}
    RTS_SIM.step(1/60);await new Promise(requestAnimationFrame);
    records.push({foot:__ISO_VIEW_V1__.frameOf(foot.id),horse:__ISO_VIEW_V1__.frameOf(horse.id),pose:__ISO_VIEW_V1__.presentationOf(horse.id)});
   }
   for(const u of[foot,horse]){u.targetX=u.x;u.targetY=u.y;}
   for(let i=0;i<60;i++){RTS_SIM.step(1/60);await new Promise(requestAnimationFrame);}
   const rest=__ISO_VIEW_V1__.presentationOf(horse.id),goals=[foot,horse].map(u=>[u.targetX,u.targetY]);
   const before=JSON.stringify([foot,horse]);await new Promise(requestAnimationFrame);const readonly=JSON.stringify([foot,horse])===before;
   const beforeInfo=__ISO_VIEW_V1__.stats().info;
   const result={records,rest,readonly,goals,beforeInfo,stats:__ISO_VIEW_V1__.stats()};
   resetGame();await new Promise(requestAnimationFrame);result.resetInfo=__ISO_VIEW_V1__.stats().info;
   return result;
  });
  const dirs=r.records.map(x=>x.pose.dir),footFrames=new Set(r.records.map(x=>x.foot?.[2])),horseFrames=new Set(r.records.map(x=>x.horse?.[2]));
  expect(r.readonly).toBe(true);expect(footFrames.size).toBeGreaterThan(3);expect(horseFrames.size).toBeGreaterThan(3);
  expect(new Set(dirs).size).toBeGreaterThanOrEqual(3);
  for(let i=1;i<dirs.length;i++)expect([0,1,7]).toContain((dirs[i]-dirs[i-1]+8)%8);
  expect(r.rest.moving).toBe(false);expect(r.rest.weight).toBeLessThan(.02);expect(r.stats.missingNames).toEqual([]);
  if(!mobile)expect(r.stats.gpu.sprites).toBeGreaterThan(0);
  expect(r.resetInfo).toBeLessThan(r.beforeInfo);expect(errors).toEqual([]);
  console.log('LIVE_PRESENTATION',JSON.stringify({mobile,footFrames:[...footFrames],horseFrames:[...horseFrames],directions:[...new Set(dirs)],rest:r.rest,renderMs:r.stats.renderMs,reset:r.resetInfo}));
 }finally{await context.close();}
});
test('actual duels show different strike timing, guards and recoil with bounded body motion',async({page})=>{
 const errors=await open(page,'&gpu=off');
 const r=await page.evaluate(async()=>{
  const actors=[];
  for(let i=0;i<8;i++){
   const type=i<4?'infantry':'cavalry';
   for(const side of['france','britain']){
    const u=createUnit(side,type,side==='france'?3900:type==='infantry'?3914:3920,1500+i*65);
    u.hp=u.maxHp=10000;u.morale=100;u.attackMode='bayonet';u.targetX=u.x;u.targetY=u.y;u.reload=.1;u.facing=side==='france'?0:Math.PI;actors.push(u);
   }
  }
  camera.x=3910;camera.y=1700;camera.zoom=1.65;const actions=new Set(),variants=new Set(),frames=new Set();let largest=0,offsets=new Set();
  for(let i=0;i<300;i++){
   actors.forEach(u=>u.morale=100);RTS_SIM.step(1/60);await new Promise(requestAnimationFrame);
   for(const u of actors){const p=__ISO_VIEW_V1__.presentationOf(u.id),f=__ISO_VIEW_V1__.frameOf(u.id);if(!p||!f)continue;
    if(u.meleeActionUntil>elapsed){actions.add(p.action);frames.add(f[1]);if(p.action==='strike')variants.add(u.meleeVariant);}
    offsets.add(p.dx.toFixed(2));largest=Math.max(largest,Math.hypot(p.dx,p.dy));
   }
  }
  const score=__MELEE_REALISM_V1__.stats();return{actions:[...actions],variants:[...variants],frames:[...frames],largest,offsets:offsets.size,score,missing:__ISO_VIEW_V1__.stats().missingNames,intact:actors.every(u=>!u.dead)};
 });
 console.log('LIVE_DUEL_PRESENTATION',JSON.stringify(r));expect(r.actions).toEqual(expect.arrayContaining(['strike','parry','recoil']));expect(r.variants.sort()).toEqual([0,1]);
 expect(r.offsets).toBeGreaterThan(30);expect(r.largest).toBeLessThan(5);expect(r.score.parries).toBeGreaterThan(0);expect(r.intact).toBe(true);expect(r.missing).toEqual([]);
 await page.screenshot({path:test.info().outputPath('varied-duel-poses.png')});expect(errors).toEqual([]);
});
