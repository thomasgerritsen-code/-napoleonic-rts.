const { test, expect } = require('@playwright/test');

test('experimental musketeer sprite renderer stays disabled and character renderer owns infantry drawing',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=sprite-rollback',{waitUntil:'networkidle'});
  const result=await page.evaluate(()=>{
    const french=createUnit('france','infantry',1100,600);
    const british=createUnit('britain','infantry',1160,600);
    french.facing=0;
    british.facing=Math.PI;
    french.targetX=french.x+80;
    british.targetX=british.x-80;
    drawUnit(french);
    drawUnit(british);
    return{
      spriteApiLoaded:Boolean(window.__MUSKETEER_SPRITES_V1__),
      characterVersion:window.__CHARACTER_VISUALS_V2__?.version,
      projection:window.__CHARACTER_VISUALS_V2__?.projection,
      supportedTypes:window.__CHARACTER_VISUALS_V2__?.supportedTypes||[]
    };
  });
  expect(result.spriteApiLoaded).toBe(false);
  expect(result.characterVersion).toBe('character-visuals-v2');
  expect(result.projection).toBe('orthographic-top-down');
  expect(result.supportedTypes).toContain('infantry');
  expect(errors).toEqual([]);
});
