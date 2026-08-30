const { test, expect } = require('@playwright/test');

async function openSprites(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=sprite1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__MUSKETEER_SPRITES_V1__?.ready?.()));
  return errors;
}

test('infantry uses generated eight-direction true top-down musketeer animation',async({page})=>{
  const errors=await openSprites(page);
  const result=await page.evaluate(()=>{
    const api=window.__MUSKETEER_SPRITES_V1__;
    const french=createUnit('france','infantry',1100,600);
    const british=createUnit('britain','infantry',1160,600);
    french.facing=0;british.facing=Math.PI;
    french.targetX=french.x+80;french.targetY=french.y;
    british.targetX=british.x-80;british.targetY=british.y;
    drawUnit(french);drawUnit(british);
    const asset=window.NRTS_MUSKETEER_SPRITE_V1;
    return{
      version:api.version,projection:api.projection,directions:api.directions,frames:api.frames,
      usesGeneratedReference:api.usesGeneratedReference,
      cardinal:{north:api.directionForFacing(-Math.PI/2),east:api.directionForFacing(0),south:api.directionForFacing(Math.PI/2),west:api.directionForFacing(Math.PI)},
      stats:api.stats(),asset:{width:asset.width,height:asset.height,columns:asset.columns,rows:asset.rows,frames:asset.framesPerDirection}
    };
  });
  expect(result.version).toBe('musketeer-sprites-v1');
  expect(result.projection).toBe('orthographic-top-down');
  expect(result.directions).toBe(8);
  expect(result.frames).toBe(4);
  expect(result.usesGeneratedReference).toBe(true);
  expect(result.cardinal).toEqual({north:0,east:2,south:4,west:6});
  expect(result.asset).toEqual({width:145,height:109,columns:8,rows:4,frames:4});
  expect(result.stats.spriteDraws).toBeGreaterThanOrEqual(2);
  expect(result.stats.hasBritishVariant).toBe(true);
  expect(errors).toEqual([]);
});

test('walking frame and direction source rectangles stay inside the generated sheet',async({page})=>{
  const errors=await openSprites(page);
  const result=await page.evaluate(()=>{
    const api=window.__MUSKETEER_SPRITES_V1__,asset=window.NRTS_MUSKETEER_SPRITE_V1;
    const rects=[];
    for(let d=0;d<8;d++)for(let f=0;f<4;f++)rects.push(api.sourceRect(d,f));
    return{
      count:rects.length,
      inside:rects.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=asset.width+.001&&r.y+r.h<=asset.height+.001),
      unique:new Set(rects.map(r=>`${r.x.toFixed(3)}:${r.y.toFixed(3)}`)).size
    };
  });
  expect(result.count).toBe(32);
  expect(result.unique).toBe(32);
  expect(result.inside).toBe(true);
  expect(errors).toEqual([]);
});
