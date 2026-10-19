const { test, expect } = require('@playwright/test');

test('desktop 2D terrain uses GPU textures without re-uploading on a short camera pan', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=v071', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__GPU_TERRAIN_V303__ &&
    window.__DESKTOP_TERRAIN_TILES_V301__ &&
    window.__RIVER_GEOMETRY_V296__
  ));
  const result=await page.evaluate(() => {
    const gpu=window.__GPU_TERRAIN_V303__;
    const tiles=window.__DESKTOP_TERRAIN_TILES_V301__;
    camera.x=window.__RIVER_GEOMETRY_V296__.centerAt(900);
    camera.y=900;
    camera.zoom=1;
    tiles.invalidate();
    draw();
    const first=gpu.metrics();
    const tileFirst=tiles.stats();
    camera.x+=10;
    draw();
    const second=gpu.metrics();
    const tileSecond=tiles.stats();
    return {first,second,tileFirst,tileSecond,
      gpuVisible:getComputedStyle(document.getElementById('game-terrain-gpu')).display!=='none',
      staticVisible:getComputedStyle(document.getElementById('game-static')).display!=='none',
      river:window.__RIVER_FLOW_2D_V299__.metrics(),
      mainVisible:getComputedStyle(document.getElementById('game')).display!=='none',
      currentVersion:window.RTS_VERSION};
  });
  expect(result.currentVersion).toBe('1.3.51');
  expect(result.mainVisible).toBe(true);
  expect(result.tileFirst.misses).toBeGreaterThan(0);
  expect(result.tileSecond.misses).toBe(result.tileFirst.misses);
  expect(result.tileSecond.hits).toBeGreaterThan(result.tileFirst.hits);
  expect(result.river.drawCalls).toBeGreaterThan(0);
  if(result.first.supported) {
    expect(result.first.active).toBe(true);
    expect(result.first.textureUploads).toBeGreaterThan(0);
    expect(result.first.textureCount).toBeGreaterThan(0);
    expect(result.second.textureUploads).toBe(result.first.textureUploads);
    expect(result.second.draws).toBeGreaterThan(result.first.draws);
    expect(result.gpuVisible).toBe(true);
    expect(result.staticVisible).toBe(false);
  } else {
    expect(result.first.active).toBe(false);
    expect(result.gpuVisible).toBe(false);
    expect(result.staticVisible).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('desktop GPU-off switch preserves 2D Canvas terrain rendering', async ({page}) => {
  await page.goto('/?gpu=off&test=v071', {waitUntil:'networkidle'});
  await page.waitForFunction(() => Boolean(
    window.__GPU_TERRAIN_V303__ && window.__DESKTOP_TERRAIN_TILES_V301__
  ));
  const result=await page.evaluate(() => {
    const gpu=window.__GPU_TERRAIN_V303__;
    const tiles=window.__DESKTOP_TERRAIN_TILES_V301__;
    tiles.invalidate();
    draw();
    return {gpu:gpu.metrics(),tiles:tiles.stats(),
      staticVisible:getComputedStyle(document.getElementById('game-static')).display!=='none',
      gpuVisible:getComputedStyle(document.getElementById('game-terrain-gpu')).display!=='none'};
  });
  expect(result.gpu.active).toBe(false);
  expect(result.gpu.textureUploads).toBe(0);
  expect(result.tiles.misses).toBeGreaterThan(0);
  expect(result.staticVisible).toBe(true);
  expect(result.gpuVisible).toBe(false);
});

test('2D mobile stays Canvas-only regardless of WebGL2 support', async ({browser}) => {
  const context=await browser.newContext({
    viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  try {
    await page.goto('/?test=v071', {waitUntil:'networkidle'});
    await page.waitForFunction(() => Boolean(
      window.__GPU_TERRAIN_V303__ &&
      window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile
    ));
    const result=await page.evaluate(() => {
      draw();
      return {gpu:window.__GPU_TERRAIN_V303__.metrics(),
        gpuVisible:getComputedStyle(document.getElementById('game-terrain-gpu')).display!=='none',
        staticVisible:getComputedStyle(document.getElementById('game-static')).display!=='none',
        mobile:window.__MOBILE_RENDER_BUDGET_V1__.state().mobile,
        touch:getComputedStyle(document.getElementById('game')).touchAction};
    });
    expect(result.mobile).toBe(true);
    expect(result.gpu.active).toBe(false);
    expect(result.gpu.textureUploads).toBe(0);
    expect(result.gpuVisible).toBe(false);
    expect(result.staticVisible).toBe(true);
    expect(result.touch).toBe('none');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
