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
 expect(s.version).toBe('320.0');
});
