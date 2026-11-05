const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});

// Felling: the scenery trees of a wood belong to the nearest tree peasants cut;
// they tip over one by one as that tree's wood runs out, lie a moment and are
// gone, and the tree itself falls last. Rendering only: the game is untouched.
test('woods thin out as their trees are cut: scenery trees fall, lie and disappear',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.fellClock=10000;window.fellRAF=true;performance.now=()=>fellClock;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(fellRAF)fn(fellClock);});});
 await page.goto('/play.html?view=iso&gpu=off&mode=singleplayer');
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready&&window.renderStableFrameV1);
 const r=await page.evaluate(()=>{
  window.fellRAF=false;
  const frame=(ms=0)=>{fellClock+=ms;window.renderStableFrameV1(()=>{},fellClock);return window.__ISO_VIEW_V1__.stats();};
  const inWood=t=>TERRAIN_WOODS.some(w=>t.x>w.x+80&&t.x<w.x+w.w-80&&t.y>w.y+80&&t.y<w.y+w.h-80);
  const tree=resources.find(t=>t.type==='wood'&&!t.dead&&t.amount>0&&inWood(t));
  camera.x=tree.x;camera.y=tree.y;camera.zoom=1;
  const game=()=>JSON.stringify(units.map(u=>[u.id,u.x,u.y,u.hp]));
  const before=game(),full=tree.amount;
  const standing=frame(16);
  tree.amount=Math.round(full*.3);
  const starting=frame(16).fallingTrees,mid=frame(500).fallingTrees,gone=frame(4000).fallingTrees;
  tree.amount=0;tree.dead=true;
  const lastFall=frame(16).fallingTrees,lastGone=frame(4000).fallingTrees;
  return{linked:standing.fellLinked,standing:standing.fallingTrees,starting,mid,gone,lastFall,lastGone,game:game()===before};
 });
 console.log('TREE_FELLING',JSON.stringify(r));
 expect(r.linked).toBeGreaterThan(50);
 expect(r.standing).toBe(0);
 expect(r.starting).toBeGreaterThan(0);
 expect(r.mid).toBe(r.starting);
 expect(r.gone).toBe(0);
 expect(r.lastFall).toBeGreaterThan(0);
 expect(r.lastGone).toBe(0);
 expect(r.game).toBe(true);
 expect(errors).toEqual([]);
 await context.close();
});
