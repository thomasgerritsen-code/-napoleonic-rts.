const {test,expect}=require('@playwright/test');
test.use({hasTouch:true});
async function openReview(page,query='?pixi=off&sprites=review'){
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/graphics-lab/'+query,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().frenchReviewLoaded);
 return errors;
}
test('French PNG review loads 17 real raster poses only when explicitly requested',async({page})=>{
 const errors=await openReview(page);
 const snapshot=await page.evaluate(()=>{
   const s=window.__GRAPHICS_LAB_V319__.getStats();
   const body=document.querySelector('#status').textContent;
   return {...s,status:body};
 });
 expect(snapshot.frenchReviewEnabled).toBe(true);
 expect(snapshot.frenchReviewLoaded).toBe(true);
 expect(snapshot.frenchReviewApproved).toBe(false);
 expect(snapshot.frenchFrameCount).toBe(17);
 expect(snapshot.status).toContain('NIET GOEDGEKEURD');
 expect(snapshot.sprites).toBe(53);
 expect(errors).toEqual([]);
});
test('French frames follow marching, aim, fire, reload, idle and stay paused on halt',async({page})=>{
 const errors=await openReview(page);
 const sample=await page.evaluate(async()=>{
   const app=window.__GRAPHICS_LAB_V319__,s=app.state;
   s.paused=true;
   const frames=[];
   for(const time of [1.0,4.3,6.1,8.6,17.0,17.0]){
     s.time=time;
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const p=app.getStats().frenchReviewPose;
     frames.push(p?.state);
   }
   return frames;
 });
 expect(sample).toEqual(['march','aim','fire','reload','idle','idle']);
 expect(errors).toEqual([]);
});
test('French review toggling references, soldier counts and portrait gestures preserve UI',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors=await openReview(page);
 await page.locator('#count').selectOption('128');
 expect((await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats())).sprites).toBe(149);
 await page.getByRole('button',{name:'Toon oude tekenstijl'}).click();
 expect(await page.locator('#old-canvas').evaluate(e=>getComputedStyle(e).visibility)).toBe('visible');
 await page.getByRole('button',{name:'Toon nieuwe sprites'}).click();
 expect(await page.locator('#old-canvas').evaluate(e=>getComputedStyle(e).visibility)).toBe('hidden');
 const box=await page.locator('#viewport').boundingBox();
 await page.touchscreen.tap(box.x+box.width*.62,box.y+box.height*.55);
 expect(await page.locator('#selection').textContent()).toContain('Brits regiment');
 expect(errors).toEqual([]);
});
test('legacy graphics lab is still default; no atlas is loaded without opt-in',async({page})=>{
 await page.goto('/graphics-lab/?pixi=off',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().loaded===10);
 const s=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
 expect(s.frenchReviewEnabled).toBe(false);
 expect(s.frenchReviewLoaded).toBe(false);
 expect(await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.version)).toBe('320.0');
});

test('v321 review slider pauses and samples real fire then reload without a frozen fire pose',async({page})=>{
 const errors=await openReview(page);
 await expect(page.locator('#atlas-review-controls')).toBeVisible();
 for(const [time,expected] of [[5.1,'aim'],[6.10,'fire'],[6.30,'reload'],[8.6,'reload'],[9.1,'idle']]){
   await page.locator('#atlas-review-time').evaluate((node,value)=>{
     node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));
   },time);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const state=await page.evaluate(()=>({
     paused:window.__GRAPHICS_LAB_V319__.state.paused,
     pose:window.__GRAPHICS_LAB_V319__.getStats().frenchReviewPose,
     label:document.getElementById('atlas-review-pose').textContent
   }));
   expect(state.paused).toBe(true);
   expect(state.pose.state).toBe(expected);
   expect(state.label).toContain(expected);
 }
 await page.locator('#atlas-review-size').selectOption('24');
 expect((await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats())).reviewSpriteSize).toBe(24);
 await page.locator('#atlas-review-size').selectOption('48');
 expect((await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats())).reviewSpriteSize).toBe(48);
 expect(errors).toEqual([]);
});
test('v321 timeline and scale controls stay hidden outside explicitly opted-in art review',async({page})=>{
 await page.goto('/graphics-lab/?pixi=off',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().loaded===10);
 expect(await page.locator('#atlas-review-controls').isVisible()).toBe(false);
 const s=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
 expect(s.frenchReviewEnabled).toBe(false);
 expect(s.reviewTimelineVisible).toBe(false);
});
