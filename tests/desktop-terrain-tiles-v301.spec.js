const { test, expect } = require('@playwright/test');

test('desktop terrain tile cache survives small pans, replaces only uncovered tiles, and preserves river motion', async ({ browser }) => {
  const context = await browser.newContext({
    viewport:{width:1440,height:900}, deviceScaleFactor:1.5
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?test=v071', { waitUntil:'networkidle' });
    await page.waitForFunction(() => Boolean(
      window.__DESKTOP_TERRAIN_TILES_V301__ &&
      window.__LARGE_ARMY_PERFORMANCE_V1__ &&
      window.__RIVER_FLOW_2D_V299__
    ));
    const result = await page.evaluate(() => {
      camera.zoom = 1;
      camera.x = 1350;
      camera.y = 900;
      window.__DESKTOP_TERRAIN_TILES_V301__.invalidate();
      const cache = window.__DESKTOP_TERRAIN_TILES_V301__;
      draw();
      const first = cache.stats();
      camera.x += 20;
      draw();
      const smallPan = cache.stats();
      camera.x += 1150;
      draw();
      const largePan = cache.stats();
      // An immediate repeat never rasterizes terrain.
      draw();
      const repeat = cache.stats();
      // Explicitly center on the river to test actual moving water, rather
      // than depending on whether the final army camera can see the river.
      camera.x = window.__RIVER_GEOMETRY_V296__.centerAt(900);
      camera.y = 900;
      draw();
      return {
        first, smallPan, largePan, repeat,
        api:window.__LARGE_ARMY_PERFORMANCE_V1__.worldAlignedTerrainTiles,
        riverDrawCalls:window.__RIVER_FLOW_2D_V299__.metrics().drawCalls,
        mainCanvas: {width:canvas.width,height:canvas.height},
        staticCanvas: {
          width:document.getElementById('game-static').width,
          height:document.getElementById('game-static').height
        },
        mobile:window.__MOBILE_RENDER_BUDGET_V1__.state().mobile
      };
    });
    expect(result.mobile).toBe(false);
    expect(result.api).toBe(true);
    expect(result.first.misses).toBeGreaterThan(0);
    expect(result.smallPan.misses).toBe(result.first.misses);
    expect(result.smallPan.hits).toBeGreaterThan(result.first.hits);
    expect(result.largePan.misses).toBeGreaterThan(result.smallPan.misses);
    expect(result.repeat.misses).toBe(result.largePan.misses);
    expect(result.repeat.hits).toBeGreaterThan(result.largePan.hits);
    expect(result.repeat.bytes).toBeLessThanOrEqual(80 * 1024 * 1024);
    expect(result.staticCanvas).toEqual(result.mainCanvas);
    expect(result.riverDrawCalls).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('mobile 2D continues using original terrain path without desktop tiles', async ({ browser }) => {
  const context = await browser.newContext({
    viewport:{width:844,height:390}, screen:{width:844,height:390},
    deviceScaleFactor:3, isMobile:true, hasTouch:true
  });
  const page = await context.newPage();
  try {
    await page.goto('/?test=v071', { waitUntil:'networkidle' });
    // Under mobile emulation, readiness can lag network-idle while the final
    // scripts finish evaluating. Do not query the addon before it exists.
    await page.waitForFunction(() => Boolean(
      window.__DESKTOP_TERRAIN_TILES_V301__ &&
      window.__LARGE_ARMY_PERFORMANCE_V1__ &&
      window.__MOBILE_RENDER_BUDGET_V1__
    ));
    const result = await page.evaluate(() => {
      const cache = window.__DESKTOP_TERRAIN_TILES_V301__;
      const before = cache.stats();
      draw();
      const after = cache.stats();
      return {
        mobile:window.__MOBILE_RENDER_BUDGET_V1__.state().mobile,
        misses:after.misses-before.misses,
        hits:after.hits-before.hits,
        main: [canvas.width,canvas.height],
        staticSize: [document.getElementById('game-static').width,
          document.getElementById('game-static').height]
      };
    });
    expect(result.mobile).toBe(true);
    expect(result.misses).toBe(0);
    expect(result.hits).toBe(0);
    expect(result.main).toEqual(result.staticSize);
  } finally {
    await context.close();
  }
});
