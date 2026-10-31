const{test,expect}=require('@playwright/test');
const{readyPlayers}=require('./helpers/online-ready');
const{createServer}=require('../server/index');
test.use({trace:'off'});
test('both online players see real construction phases and builder work from server snapshots',async({browser})=>{
 test.setTimeout(120000);let app,simulation;const contexts=[],errors=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const c=await browser.newContext();contexts.push(c);await c.addInitScript(()=>window.__NRTS_SERVER__=true);simulation=await c.newPage();simulation.on('pageerror',e=>errors.push(e.message));await simulation.goto(`http://127.0.0.1:${app.address.port}/play.html?view=iso&test=construction-authority`);await simulation.waitForFunction(()=>window.__ONLINE_SIM_V1__);
  return{close:()=>c.close(),advance:(commands,running,snapshot,seconds,epochs)=>simulation.evaluate(v=>JSON.parse(JSON.stringify(__ONLINE_SIM_V1__.advanceTransport(v.commands,v.running,v.snapshot,v.seconds,v.epochs))),{commands,running,snapshot,seconds,epochs})};
 }};
 try{
  app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host,allowedOrigins:'http://127.0.0.1:4173'});
  const ca=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),cb=await browser.newContext();contexts.push(ca,cb);const a=await ca.newPage(),b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
  await a.goto('/?view=iso&server='+encodeURIComponent(`ws://127.0.0.1:${app.address.port}/multiplayer`));await a.click('#startMultiplayer');await a.click('#onlineHost');await expect.poll(()=>a.inputValue('#onlineRoom'),{timeout:40000}).toMatch(/^[A-Z2-9]{8}$/);await b.goto(await a.inputValue('#onlineInvite'));await readyPlayers(a,b);
  const sites=await simulation.evaluate(()=>Object.fromEntries(['france','britain'].map(side=>{
   const home=livingBuildings(side).find(b=>b.type==='towncenter');let site;
   for(let r=180;r<650&&!site;r+=50)for(let i=0;i<24&&!site;i++){const p={x:home.x+Math.cos(i/24*Math.PI*2)*r,y:home.y+Math.sin(i/24*Math.PI*2)*r};if(validBuildingSpot('house',p.x,p.y)&&__UNIT_PLACEMENT__.clear(p,'worker')&&!resources.some(r=>!r.dead&&Math.hypot(r.x-p.x,r.y-p.y)<100))site=p;}
   if(!site)throw Error('No house site '+side);return[side,site];
  })));
  for(const[p,side]of[[a,'france'],[b,'britain']]){
   await p.waitForFunction(()=>__ONLINE_MATCH_V1__.phase==='playing');await p.click('#onlineClose');
   await p.evaluate(site=>{
    window.constructionSeen={phases:[],builders:0};
    const sample=()=>{const b=buildings.find(b=>b.type==='house'&&b.side==='france');if(b){const s=__BUILDING_PRESENTATION_V1__.inspect(b);if(!constructionSeen.phases.includes(s.stage))constructionSeen.phases.push(s.stage);constructionSeen.builders=Math.max(constructionSeen.builders,s.builders);}requestAnimationFrame(sample);};requestAnimationFrame(sample);
    selectedUnits.clear();selectedUnits.add(livingUnits('france')[0]);selectedBuilding=null;updateHud(true);camera.x=site.x;camera.y=site.y;camera.zoom=1.8;
   },sites[side]);
   await p.locator('[data-action="build-house"]').click();await p.evaluate(s=>placeBuilding('house',s.x,s.y),sites[side]);
  }
  for(const p of[a,b])await expect.poll(()=>p.evaluate(()=>constructionSeen.phases.includes('complete')),{timeout:45000}).toBe(true);
  const seen=await Promise.all([a,b].map(p=>p.evaluate(()=>constructionSeen)));
  for(const s of seen){for(const phase of['foundation','frame','walls','roof','complete'])expect(s.phases).toContain(phase);expect(s.builders).toBe(1);}
  const authority=await simulation.evaluate(()=>({noRenderer:!window.__BUILDING_PRESENTATION_V1__,sides:['france','britain'].map(side=>({side,wood:economies[side].wood,house:livingBuildings(side).find(b=>b.type==='house')?.complete}))}));
  expect(authority.noRenderer).toBe(true);for(const s of authority.sides){expect(s.wood).toBe(980);expect(s.house).toBe(true);}expect(errors).toEqual([]);console.log('CONSTRUCTION_ONLINE',JSON.stringify({seen,authority}));
 }finally{await app?.close();await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
});
