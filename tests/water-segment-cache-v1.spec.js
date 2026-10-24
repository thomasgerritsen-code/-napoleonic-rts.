const {test,expect}=require('@playwright/test');
test('cached boolean water checks match the full sampler, including bridge edges and a full cache',async({page})=>{
 test.setTimeout(90000);await page.goto('/?test=water-cache',{waitUntil:'load'});
 const r=await page.evaluate(()=>{
  const segments=[];let seed=73;const rnd=()=>((seed=seed*16807%2147483647)-1)/2147483646;
  for(let i=0;i<600;i++)segments.push([rnd()*WORLD.width,rnd()*WORLD.height,rnd()*WORLD.width,rnd()*WORLD.height]);
  for(const c of WATER_CROSSINGS_V067)for(const offset of [-c.width/2-1,-c.width/2,c.width/2,c.width/2+1]){
   const a=crossingPointV068(c,-c.length/2-40,offset),b=crossingPointV068(c,c.length/2+40,offset);segments.push([a.x,a.y,b.x,b.y]);
  }
  let mismatch=0;for(const s of segments)if(segmentCrossesBlockedWaterV067(...s)!==!!segmentWaterCrossingV067(...s)?.blocked)mismatch++;
  const last=segments.at(-1),before=window.__WATER_SEGMENT_CACHE_V1__.stats();
  for(let i=0;i<100;i++)segmentCrossesBlockedWaterV067(...last);
  const after=window.__WATER_SEGMENT_CACHE_V1__.stats();
  return{mismatch,checked:segments.length,reused:after.hits-before.hits,newSamples:after.samples-before.samples,entries:after.entries};
 });
 expect(r.mismatch).toBe(0);expect(r.checked).toBeGreaterThan(600);expect(r.reused).toBe(100);expect(r.newSamples).toBe(0);expect(r.entries).toBeLessThanOrEqual(512);
});
