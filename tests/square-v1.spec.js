const{test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
// A cavalry regiment charges a British battalion in square (steady or shaken).
async function charge(page,morale){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let seed=7;Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};});
 await page.goto('/?test=square',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__RTS_DEBUG__?.runScenario&&window.RTS_SIM?.step&&window.__SQUARE_V1__);
 const r=await page.evaluate(morale=>{
  window.__RTS_DEBUG__.runScenario('cavalry-charge');window.__RTS_DEBUG__.setPeaceMode(false);
  aiDevelop=()=>{};aiMilitaryOrder=()=>{};
  const inf=regiments.find(r=>!r.destroyed&&r.side==='britain'),cav=regiments.find(r=>!r.destroyed&&r.side==='france');
  const c=centroid(regimentMembers(inf));arrangeRegiment(inf,c.x,c.y,'square');RTS_SIM.step(4);
  regimentMembers(inf).forEach(u=>{u.x=u.targetX;u.y=u.targetY;u.morale=morale;});
  const men=()=>regimentMembers(inf).filter(u=>!u.dead),n0=men().length,horses=regimentMembers(cav).filter(u=>u.type==='cavalry');
  regimentMembers(cav).forEach(u=>{u.chargeTimer=12;});orderGroupPathV06(cav,c.x,c.y,'line',0);
  let closest=Infinity;
  for(let i=0;i<600;i++){RTS_SIM.step(1/60);for(const h of horses)if(!h.dead)for(const s of men())closest=Math.min(closest,Math.hypot(h.x-s.x,h.y-s.y));}
  // A horse is inside when it is nearer the centre than the man of the hedge nearest to it.
  const left=men(),mid=left.length?centroid(left):c,dc=p=>Math.hypot(p.x-mid.x,p.y-mid.y);
  const within=h=>{let near=null,best=Infinity;for(const s of left.filter(u=>u.type==='infantry')){const d=Math.hypot(h.x-s.x,h.y-s.y);if(d<best){best=d;near=s;}}return near&&dc(h)<dc(near)-4;};
  return{routing:regimentMembers(inf).filter(u=>u.routing).length,destroyed:inf.destroyed,formation:inf.formation,lost:n0-left.length,closest,inside:horses.filter(h=>!h.dead&&within(h)).length,stats:__SQUARE_V1__.stats()};
 },morale);
 console.log('SQUARE',morale,JSON.stringify(r));return{r,errors};
}
test('a steady square holds: the charge breaks on the bayonets and no horse rides into it',async({page})=>{
 const{r,errors}=await charge(page,100);
 expect(r.formation).toBe('square');expect(r.destroyed).toBe(false);expect(r.routing).toBe(0);expect(r.stats.held).toBeGreaterThan(0);
 expect(r.stats.refusals).toBeGreaterThan(3*r.stats.closed);
 // Only a horse that chose to close (never one that refused) can be inside.
 expect(r.inside).toBeLessThanOrEqual(r.stats.closed);expect(r.closest).toBeGreaterThan(12);expect(r.lost).toBeLessThan(4);
 expect(errors).toEqual([]);
});
test('a shaken square can be ridden into',async({page})=>{
 const{r,errors}=await charge(page,30);
 expect(r.stats.closed).toBeGreaterThan(0);expect(r.lost).toBeGreaterThan(5);
 expect(errors).toEqual([]);
});
