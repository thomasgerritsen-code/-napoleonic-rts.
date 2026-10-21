const {test,expect}=require('@playwright/test');

test('all 17 French atlas frames show a repaired head, while original pixels remain available for comparison',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/graphics-lab/?pixi=off&sprites=review',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().frenchReviewLoaded);
 const results=await page.evaluate(async()=>{
   const helper=window.__FRENCH_ATLAS_REVIEW_V321__;
   const im=new Image();im.src=helper.FR_REVIEW_URL+'.png';await im.decode();
   const old=helper.applyFrenchHeadCorrections(im,false),updated=helper.applyFrenchHeadCorrections(im,true);
   const a=old.getContext('2d').getImageData(0,0,576,288).data,
     b=updated.getContext('2d').getImageData(0,0,576,288).data;
   const deltas=helper.FR_HEAD_ANCHORS.map(([x,y],i)=>{
     const xx=(i%6)*96+x,yy=Math.floor(i/6)*96+y+3,index=(yy*576+xx)*4;
     return {
       original:[...a.slice(index,index+4)],
       repaired:[...b.slice(index,index+4)],
       changed:a[index]!==b[index]||a[index+1]!==b[index+1]||a[index+2]!==b[index+2],
       skin:b[index]>115&&b[index+1]>72&&b[index+2]>45
     };
   });
   return{stats:window.__GRAPHICS_LAB_V319__.getStats(),deltas};
 });
 expect(results.stats.frenchHeadsRepaired).toBe(true);
 expect(results.stats.frenchHeadCount).toBe(17);
 expect(results.deltas).toHaveLength(17);
 expect(results.deltas.every(d=>d.changed&&d.skin)).toBe(true);
 expect(errors).toEqual([]);
});

test('headless source atlas can be viewed deliberately without altering the default Graphics Lab',async({page})=>{
 await page.goto('/graphics-lab/?pixi=off&sprites=review&heads=original',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().frenchReviewLoaded);
 const original=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
 expect(original.frenchHeadsRepaired).toBe(false);
 expect(original.frenchHeadCount).toBe(0);
 await page.goto('/graphics-lab/?pixi=off',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().loaded===10);
 expect(await page.locator('#atlas-review-controls').isVisible()).toBe(false);
 expect((await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats())).frenchReviewEnabled).toBe(false);
});
