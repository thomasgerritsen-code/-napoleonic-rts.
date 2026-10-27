const{test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function authority(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.__NRTS_SERVER__=true);await page.goto('/play.html?view=iso&test=logging');await page.waitForFunction(()=>window.__LUMBER_V1__&&window.__ONLINE_SIM_V1__);return errors;}
test('logging requires a paid completed camp by the forest, delivers finite wood and preserves cargo after destruction',async({page})=>{
 const errors=await authority(page);
 const r=await page.evaluate(()=>{
  const api=__LUMBER_V1__,ws=livingUnits('france'),u=ws[0],site=api.findSite('france'),wood=economies.france.wood;
  const trees=resources.filter(r=>r.type==='wood'&&!r.dead),total=()=>trees.reduce((n,r)=>n+r.amount,0),initial=total();
  const near=trees.filter(r=>Math.hypot(r.x-site.x,r.y-site.y)<=api.radius)[0];selectedUnits.clear();selectedUnits.add(u);
  const bare=assignGather(near);u.task='gather';u.resourceTarget=near;u.x=near.x;u.y=near.y;updateWorker(u,1);const bypass=total()===initial&&u.carry===0;
  let empty=null;for(let x=200;x<WORLD.width&&!empty;x+=400)for(let y=200;y<WORLD.height&&!empty;y+=400)if(!trees.some(r=>Math.hypot(r.x-x,r.y-y)<=api.radius))empty={x,y};
  const off=empty&&constructBuilding('france','lumbercamp',empty.x,empty.y,ws),onTree=constructBuilding('france','lumbercamp',near.x,near.y,ws),beforeBuild=economies.france.wood;
  const b=constructBuilding('france','lumbercamp',site.x,site.y,ws);if(!b)throw Error('No camp');
  const paid=wood-economies.france.wood,early=api.assign(u,near),duplicate=constructBuilding('france','lumbercamp',site.x,site.y,ws);
  for(let i=0;i<800&&!b.complete;i++)RTS_SIM.step(.25);const complete=b.complete;
  const idleWood=economies.france.wood;for(const w of ws){stopWorkerAtCurrentPosition(w);w.preferredResourceType=null;}
  // A completed camp without workers produces no free wood.
  for(let i=0;i<40;i++)RTS_SIM.step(.25);const idleGain=economies.france.wood-idleWood;
  api.assign(u,near);const before=economies.france.wood;
  for(let i=0;i<800&&economies.france.wood===before;i++)RTS_SIM.step(.25);
  const gain=economies.france.wood-before,enemy=api.assign(livingUnits('britain')[0],near);
  const conserved=economies.france.wood-(wood-120)+ws.reduce((n,u)=>n+(u.carryType==='wood'?u.carry:0),0)===initial-total();
  for(let i=0;i<600&&!ws.some(w=>w.carry>0);i++)RTS_SIM.step(.25);
  b.dead=true;const stock=total(),cargo=ws.reduce((n,u)=>n+u.carry,0),beforeDestroyed=economies.france.wood;
  for(let i=0;i<800&&ws.some(w=>w.carry>0||w.task==='gather');i++)RTS_SIM.step(.25);
  const destroyed={untouched:stock===total(),delivered:economies.france.wood-beforeDestroyed,cargo,active:ws.some(w=>w.task==='gather')};
  const replacement=constructBuilding('france','lumbercamp',site.x,site.y,ws);for(let i=0;i<800&&!replacement.complete;i++)RTS_SIM.step(.25);
  for(const w of ws){stopWorkerAtCurrentPosition(w);w.preferredResourceType=null;w.carry=0;w.carryType=null;}
  const covered=trees.filter(r=>Math.hypot(r.x-site.x,r.y-site.y)<=api.radius);for(const r of covered){r.amount=0;r.dead=true;}near.amount=7;near.dead=false;
  api.assign(u,near);const beforeLast=economies.france.wood;for(let i=0;i<1000&&(near.amount>0||u.carry>0);i++)RTS_SIM.step(.25);
  const exhausted={amount:near.amount,gain:economies.france.wood-beforeLast,assign:api.assign(u,near)};
  resetGame();return{bare,bypass,empty:!!empty,off:!!off,onTree:!!onTree,beforeBuild,wood,paid,early,duplicate:!!duplicate,complete,idleGain,gain,enemy,conserved,destroyed,exhausted,reset:{camps:api.camps().length,wood:economies.france.wood,trees:resources.filter(r=>r.type==='wood'&&!r.dead&&r.amount>0).length}};
 });
 console.log('LOGGING_LIFECYCLE',JSON.stringify(r));expect(r.bare).toBe(false);expect(r.bypass).toBe(true);expect(r.empty).toBe(true);expect(r.off).toBe(false);expect(r.onTree).toBe(false);expect(r.beforeBuild).toBe(r.wood);expect(r.paid).toBe(120);expect(r.early).toBe(false);expect(r.duplicate).toBe(false);expect(r.complete).toBe(true);expect(r.idleGain).toBe(0);expect(r.gain).toBeGreaterThanOrEqual(25);expect(r.enemy).toBe(false);expect(r.conserved).toBe(true);expect(r.destroyed.untouched).toBe(true);expect(r.destroyed.delivered).toBe(r.destroyed.cargo);expect(r.destroyed.active).toBe(false);expect(r.exhausted).toEqual({amount:0,gain:7,assign:false});expect(r.reset.camps).toBe(0);expect(r.reset.wood).toBe(1100);expect(r.reset.trees).toBeGreaterThan(0);expect(errors).toEqual([]);
});
test('native server validates camp ownership, construction and deliveries for both factions',async({page})=>{
 const errors=await authority(page);
 const r=await page.evaluate(()=>{
  const api=__LUMBER_V1__,seq={france:0,britain:0},out=[];
  const command=(side,type,data,ws)=>{const command={v:1,seq:++seq[side],type,data,unitIds:ws.map(u=>u.id),buildingId:null};const v=__ONLINE_SIM_V1__.advance([{side,command}],true,true,.05).views[side];return v.acknowledgements.find(a=>a.seq===command.seq);};
  for(const side of['france','britain']){
   const ws=livingUnits(side),site=api.findSite(side),tree=resources.find(r=>r.type==='wood'&&!r.dead&&Math.hypot(r.x-site.x,r.y-site.y)<=api.radius),wood=economies[side].wood;
   const before=command(side,'gather',{resourceId:tree.id},ws),build=command(side,'build',{buildingType:'lumbercamp',...site},ws),b=api.camps(side)[0],early=command(side,'gather',{resourceId:tree.id},ws);
   for(let i=0;i<800&&!b.complete;i++)__ONLINE_SIM_V1__.advance([],true,false,.25);
   const accepted=command(side,'gather',{resourceId:tree.id},ws);
   for(let i=0;i<800&&economies[side].wood===wood-120;i++)__ONLINE_SIM_V1__.advance([],true,false,.25);
   const view=__ONLINE_SIM_V1__.advance([],false,true).views[side].state;
   out.push({side,before,build,early,accepted,complete:b.complete,canonical:b.side,gain:economies[side].wood-(wood-120),replica:view.buildings.find(v=>v.id===b.id)?.type});
  }
  const enemyTree=api.nearestTree('britain',api.camps('britain')[0].x,api.camps('britain')[0].y),enemy=command('france','gather',{resourceId:enemyTree.id},livingUnits('france'));
  return{out,enemy};
 });
 for(const v of r.out){expect(v.before.ok).toBe(false);expect(v.build.ok).toBe(true);expect(v.early.ok).toBe(false);expect(v.accepted.ok).toBe(true);expect(v.complete).toBe(true);expect(v.canonical).toBe(v.side);expect(v.gain).toBeGreaterThanOrEqual(25);expect(v.replica).toBe('lumbercamp');}expect(r.enemy.ok).toBe(false);expect(errors).toEqual([]);console.log('LOGGING_AUTHORITY',JSON.stringify(r));
});
test('AI builds a camp and actually carries and delivers wood before developing its army',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/play.html?view=iso&gpu=off&test=logging-ai');await page.waitForFunction(()=>window.__LUMBER_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 const r=await page.evaluate(()=>{let delivery=null,unsafe=false;for(let i=0;i<1200&&!delivery;i++){
  const carriers=livingUnits('britain').filter(u=>u.lumberCampId&&u.carryType==='wood'&&u.carry>0).map(u=>({u,n:u.carry}));RTS_SIM.step(.25);
  for(const u of livingUnits('britain'))if(u.task==='gather'&&u.resourceTarget?.type==='wood'&&!__LUMBER_V1__.campFor(u.resourceTarget,'britain'))unsafe=true;
  const arrival=carriers.find(v=>!v.u.dead&&v.u.carry===0);if(arrival)delivery={at:elapsed,amount:arrival.n};
 }return{delivery,unsafe,camps:__LUMBER_V1__.camps('britain').map(b=>({complete:b.complete,site:__LUMBER_V1__.validSite(b.x,b.y)}))};});
 console.log('LOGGING_AI',JSON.stringify(r));expect(r.delivery?.amount).toBeGreaterThan(0);expect(r.unsafe).toBe(false);expect(r.camps.some(b=>b.complete)).toBe(true);expect(errors).toEqual([]);
});
test('logging workers can build and work in a mine without stale camp orders',async({page})=>{
 const errors=await authority(page);const r=await page.evaluate(()=>{
  const ws=livingUnits('france'),site=__LUMBER_V1__.findSite('france'),camp=constructBuilding('france','lumbercamp',site.x,site.y,ws);
  for(let i=0;i<600&&!ws.some(u=>u.carryType==='wood'&&u.carry>0);i++)RTS_SIM.step(.25);
  const wasLogging=ws.some(u=>u.lumberCampId===camp.id),d=__MINES_V1__.deposits()[0],mine=constructBuilding('france','mine',d.x,d.y,ws);
  for(let i=0;i<1200&&economies.france.iron===100;i++)RTS_SIM.step(.25);
  return{wasLogging,complete:mine.complete,iron:economies.france.iron,workers:ws.map(u=>({mine:u.mineId,camp:u.lumberCampId||null,task:u.task})),id:mine.id};
 });expect(r.wasLogging).toBe(true);expect(r.complete).toBe(true);expect(r.iron).toBeGreaterThan(100);for(const u of r.workers){expect(u.mine).toBe(r.id);expect(u.camp).toBeNull();expect(['mine','return']).toContain(u.task);}expect(errors).toEqual([]);
});
for(const gpu of['off','on'])test(`mobile camp construction, logging action and cached art with GPU ${gpu}`,async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});try{
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>window.__NRTS_HUMAN_BRITAIN__=true);await p.goto(`/play.html?view=iso&gpu=${gpu}&test=lumber-mobile`);await p.waitForFunction(()=>window.__LUMBER_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
  const site=await p.evaluate(()=>{const s=__LUMBER_V1__.findSite('france');selectedUnits.clear();for(const u of livingUnits('france'))selectedUnits.add(u);selectedBuilding=null;updateHud(true);camera.x=s.x;camera.y=s.y;camera.zoom=2;return s;});
  await p.locator('[data-action="build-lumbercamp"]').click();expect(await p.evaluate(()=>buildMode)).toBe('lumbercamp');const xy=await p.evaluate(s=>worldToScreen(s.x,s.y),site);await p.touchscreen.tap(xy.x,xy.y);
  const built=await p.evaluate(()=>{const b=__LUMBER_V1__.camps('france')[0];if(!b)throw Error('No mobile camp');for(let i=0;i<800&&!b.complete;i++)RTS_SIM.step(.25);for(const u of livingUnits('france')){stopWorkerAtCurrentPosition(u);u.preferredResourceType=null;}selectedUnits.clear();selectedUnits.add(livingUnits('france')[0]);updateHud(true);camera.x=b.x;camera.y=b.y;camera.zoom=2.4;return b.complete;});expect(built).toBe(true);
  await p.locator('[data-action="lumber-assign"]').click();expect(await p.evaluate(()=>[...selectedUnits][0].task)).toMatch(/gather|lumber-deliver/);await p.waitForFunction(()=>__LUMBER_ART_V1__.stats().textures>0);await p.screenshot({path:test.info().outputPath(`lumber-mobile-${gpu}.png`)});
  const art=await p.evaluate(()=>__LUMBER_ART_V1__.stats());expect(art.textures).toBeLessThanOrEqual(2);expect(art.bytes).toBeLessThan(500000);expect(errors).toEqual([]);
 }finally{await c.close();}
});
