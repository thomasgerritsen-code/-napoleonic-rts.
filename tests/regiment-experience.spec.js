const {test,expect}=require('@playwright/test');
const {createServer}=require('../server/index.js');
test.use({trace:'off'});
// Only local test pages install fixtures; no extra command/API exists in the game.
function installFixtures(){
 const group=(side,kind='infantry')=>{
  const home=buildings.find(b=>b.side===side&&b.type==='towncenter'),x=home.x+(side==='france'?220:-220),y=home.y+250;
  const add=(type,i=0)=>createUnit(side,type,x+i*6,y);
  if(kind==='cavalry'){
   const officer=add('officer');__TROOPS_V1__.applyTroop(officer,'mounted');
   return createCavalryRegimentV06(side,[...Array.from({length:4},(_,i)=>add('cavalry',i)),officer]);
  }
  if(kind==='artillery'){
   const r=createArtilleryBatteryV06(side,add('artillery'),[add('infantry',1),add('infantry',2)]);
   r.crewApproachV1.active=false;return r;
  }
  return createRegiment(side,[...Array.from({length:12},(_,i)=>add('infantry',i)),add('officer',13),add('drummer',14)]);
 };
 function defeat(winner,method='bullet'){
  const enemy=group(opposite(winner.side)),victims=regimentMembers(enemy).slice();
  const shooter=regimentMembers(winner).find(u=>u.type===(method==='cavalry'?'cavalry':method==='shell'||method==='grape'?'artillery':'infantry'));
  for(const [i,u]of victims.entries()){u.hp=1;u.x=shooter.x+80;u.y=shooter.y+(method==='grenade'?i%3:i*.1);u.morale=100;}
  if(method==='grenade'){
   __TROOPS_V1__.setTroop(shooter,'grenadier');__GRENADES_V1__.throwAt(shooter,victims[0]);
   const g=__GRENADES_V1__.flying().at(-1);g.x1=victims[0].x;g.y1=victims[0].y;g.t0=elapsed-g.flight;updateProjectiles(.05);
  }else{
   shooter.artilleryMode=method==='grape'?'grape':'round';shooter.chargeTimer=method==='cavalry'?5:0;
   for(const target of victims){
    if(target.dead)continue;
    fire(shooter,target);
    for(const p of projectiles){p.x=p.target.x;p.y=p.target.y;}
    updateProjectiles(.05);
   }
  }
  refreshRegiment(enemy);refreshRegiment(enemy);
  if(!enemy.destroyed)throw Error('Fixture battle did not defeat regiment');
  return {id:enemy.id,dead:victims.filter(u=>u.dead).length};
 }
 window.__rankFixture={group,defeat};
}

test('real musket, cavalry, artillery and grenade casualties promote regiments and reinforcement keeps the rank',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/play.html?view=iso&test=ranks&gpu=off');
 await page.waitForFunction(()=>!!window.__REGIMENT_EXPERIENCE__&&!!window.__GRENADES_V1__);
 await page.evaluate(installFixtures);
 const r=await page.evaluate(()=>{
  const f=__rankFixture,army=f.group('france'),progress=[];
  for(let i=0;i<6;i++){f.defeat(army);progress.push({wins:army.victories,rank:__REGIMENT_EXPERIENCE__.rankOf(army).label});}
  selectedUnits.clear();for(const u of regimentMembers(army))selectedUnits.add(u);
  const recruit=createUnit('france','infantry',regimentMembers(army)[0].x,regimentMembers(army)[0].y);selectedUnits.add(recruit);
  const joined=__REGIMENT_ORDERS_V1__.reinforce();updateHud(true);
  const inherited=combatSourceFor(recruit).damageFactor;
  const cavalry=f.group('france','cavalry');f.defeat(cavalry,'cavalry');
  const cannon=f.group('france','artillery');f.defeat(cannon,'shell');f.defeat(cannon,'grape');
  const grenadiers=f.group('france');f.defeat(grenadiers,'grenade');
  selectedUnits.clear();for(const u of regimentMembers(army))selectedUnits.add(u);updateHud(true);
  window.__rankArmy=army;
  return {progress,joined,inherited,wins:army.victories,cavalry:cavalry.victories,cannon:cannon.victories,grenadiers:grenadiers.victories,title:selectionTitleEl.textContent,details:selectionDetailsEl.textContent};
 });
 expect(r.progress).toEqual(['Ervaren','Ervaren','Veteraan','Veteraan','Veteraan','Elite'].map((rank,i)=>({wins:i+1,rank})));
 expect(r).toMatchObject({joined:1,inherited:1.15,wins:6,cavalry:1,cannon:2,grenadiers:1});
 expect(r.title).toContain('Elite');expect(r.details).toContain('6 regimenten verslagen');expect(r.details).toContain('schade +15%');
 await page.screenshot({path:test.info().outputPath('regiment-elite.png')});expect(errors).toEqual([]);
 const reset=await page.evaluate(()=>{resetGame();const r=__rankFixture.group('france');return {rank:__REGIMENT_EXPERIENCE__.rankOf(r).label,wins:r.victories||0};});expect(reset).toEqual({rank:'Recruut',wins:0});
});

test('server-earned ranks reach both online sides, reveal no combat ledger and survive reconnect',async({browser})=>{
 test.setTimeout(90000);let app,sim;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const c=await browser.newContext();contexts.push(c);await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
  sim=await c.newPage();sim.on('pageerror',e=>errors.push(e.message));await sim.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=ranks&gpu=off`);
  await sim.waitForFunction(()=>!!window.__ONLINE_SIM_V1__);await sim.evaluate(installFixtures);
  await sim.evaluate(()=>{window.__rankArmies={};for(const side of ['france','britain'])__rankArmies[side]=__rankFixture.group(side);});
  return {close:()=>c.close(),advance:(commands,running,snapshot,seconds,epochs)=>sim.evaluate(a=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(a.commands,a.running,a.snapshot,a.seconds,a.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`;
  const c1=await browser.newContext(),c2=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(c1,c2);
  const a=await c1.newPage(),b=await c2.newPage();for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&gpu=off&server='+encodeURIComponent(endpoint));await a.click('#startMultiplayer');await a.click('#onlineHost');
  await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:30000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));
  for(const p of [a,b]){await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');}
  const ids=await sim.evaluate(()=>{
   for(const side of ['france','britain'])for(let i=0;i<3;i++)__rankFixture.defeat(__rankArmies[side]);
   return Object.fromEntries(Object.entries(__rankArmies).map(([side,r])=>[side,r.id]));
  });
  for(const [p,side]of[[a,'france'],[b,'britain']]){
   await expect.poll(()=>p.evaluate(id=>__ONLINE_MATCH_V1__.view.state.groups.find(r=>r.id===id)?.victories,ids[side])).toBe(3);
   await p.evaluate(id=>{selectedUnits.clear();for(const u of units)if(u.regimentId===id)selectedUnits.add(u);updateHud(true);},ids[side]);
   expect(await p.evaluate(()=>selectionTitleEl.textContent)).toContain('Veteraan');
  }
  const privacy=await sim.evaluate(()=>{
   const a=regimentMembers(__rankArmies.france)[0],b=__rankArmies.britain;
   for(const u of regimentMembers(b)){u.x=a.x+30;u.y=a.y+30;}
   const r=__ONLINE_SIM_V1__.advance([],false).views.france.state.groups.find(r=>r.id===b.id);
   return {rank:r.rank,victories:r.victories,keys:Object.keys(r)};
  });
  expect(privacy).toMatchObject({rank:2,victories:3});expect(privacy.keys).not.toContain('losses');expect(privacy.keys).not.toContain('source');
  await b.reload();await b.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');
  await expect.poll(()=>b.evaluate(id=>__ONLINE_MATCH_V1__.view.state.groups.find(r=>r.id===id)?.victories,ids.britain)).toBe(3);
  expect(await b.evaluate(()=>NRTS_COMMAND_PROTOCOL.normalize({v:1,seq:999,type:'promote-regiment',unitIds:[],buildingId:null,data:{rank:3,victories:999}}).ok)).toBe(false);
  await b.screenshot({path:test.info().outputPath('regiment-veteran-mobile.png')});expect(errors).toEqual([]);
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close()));}
});
