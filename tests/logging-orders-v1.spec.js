const{test,expect}=require('@playwright/test');
test.describe.configure({timeout:180000});
// A player's right-click on a tree in a wood without a camp: the selected
// peasants build a logging camp at its edge, then fell trees there.
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:760});
 await page.goto('/play.html?view=iso&mode=singleplayer&test=logging-orders');
 await page.waitForFunction(()=>window.__LOGGING_ORDERS_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
async function rightClickNearestTree(page,count){
 const at=await page.evaluate(count=>{
  const ws=livingUnits('france').filter(u=>u.type==='worker').slice(0,count),w=ws[0];
  // A tree the right-click will hit: nearest to the peasants with a site in reach.
  const trees=resources.filter(r=>r.type==='wood'&&!r.dead).sort((a,b)=>Math.hypot(a.x-w.x,a.y-w.y)-Math.hypot(b.x-w.x,b.y-w.y));
  const tree=trees.find(t=>__LOGGING_ORDERS_V1__.siteFor(t,w));
  selectedUnits.clear();ws.forEach(u=>selectedUnits.add(u));selectedBuilding=null;updateHud(true);
  camera.x=tree.x;camera.y=tree.y;camera.zoom=1.2;window.__tree=tree;window.__ws=ws;
  return null;
 },count);
 await page.waitForTimeout(400);
 const p=await page.evaluate(()=>{const s=__ISO_VIEW_V1__.screenOf(__tree.x,__tree.y);const w=screenToWorld(s.x,s.y);return{...s,hit:resourceAt(w.x,w.y)?.id===__tree.id};});
 await page.mouse.click(p.x,p.y,{button:'right'});
 return p;
}
test('peasants sent to a wood without a camp build one there, then fell trees',async({page})=>{
 const errors=await open(page);
 const wood0=await page.evaluate(()=>economies.france.wood);
 const p=await rightClickNearestTree(page,2);
 expect(p.hit).toBe(true);
 const r=await page.evaluate(()=>{
  const camp=buildings.find(b=>b.type==='lumbercamp'&&b.side==='france'),ws=__ws;
  const first={camp:!!camp,covers:!!camp&&Math.hypot(camp.x-__tree.x,camp.y-__tree.y)<=__LUMBER_V1__.radius,tasks:ws.map(u=>u.task),status:statusEl.textContent,paid:camp?120:0};
  window.__RTS_DEBUG__.tick(60);
  return{...first,complete:camp?.complete,felling:ws.filter(u=>u.lumberCampId===camp?.id&&['gather','lumber-deliver'].includes(u.task)).length,wood:economies.france.wood};
 });
 console.log('LOGGING_ORDERS',JSON.stringify(r));
 expect(r.camp).toBe(true);expect(r.covers).toBe(true);expect(r.tasks).toEqual(['build','build']);
 expect(r.status).toContain('houthakkerskamp');expect(r.complete).toBe(true);expect(r.felling).toBe(2);
 expect(r.wood).toBeGreaterThan(wood0-120);expect(errors).toEqual([]);
});
test('without the wood for a camp the click says what is missing',async({page})=>{
 const errors=await open(page);
 await page.evaluate(()=>{economies.france.wood=50;});
 await rightClickNearestTree(page,1);
 const r=await page.evaluate(()=>({status:statusEl.textContent,camps:buildings.filter(b=>b.type==='lumbercamp'&&b.side==='france').length}));
 expect(r.camps).toBe(0);expect(r.status).toContain('120 hout');expect(errors).toEqual([]);
});
test('the gather command itself still needs a finished camp',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{const w=livingUnits('france').find(u=>u.type==='worker'),t=resources.find(r=>r.type==='wood'&&!r.dead);selectedUnits.clear();selectedUnits.add(w);
  return{ok:assignGather(t),camps:buildings.filter(b=>b.type==='lumbercamp'&&b.side==='france').length};});
 expect(r.ok).toBe(false);expect(r.camps).toBe(0);expect(errors).toEqual([]);
});
