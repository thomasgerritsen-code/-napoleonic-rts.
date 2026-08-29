const {test,expect}=require('@playwright/test');
// Release validation marker: exercise tactical terrain through the main-target Chromium gate.
test('tactical terrain subsystem loads',async({page})=>{await page.goto('/?test=v071',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__TACTICAL_TERRAIN_V1__);const r=await page.evaluate(()=>({registered:NRTS.subsystems.has('tactical-terrain'),los:typeof __TACTICAL_TERRAIN_V1__.lineOfSight==='function'}));expect(r).toEqual({registered:true,los:true});});
