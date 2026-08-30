const { test, expect } = require('@playwright/test');

test('incomplete west-east road route resolves through a complete legal water crossing', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    let seed = 773311;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=movement-coverage', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.NRTS_NAVIGATION_V2?.active));

  const diagnostic = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const u of units) u.dead = true;
    for (const r of regiments) r.destroyed = true;

    const start={x:330,y:1320};
    const goal={x:2520,y:1540};
    const made=[];
    for(let i=0;i<18;i++) made.push(createUnit('france','infantry',start.x+(i%9)*14,start.y+Math.floor(i/9)*16));
    made.push(createUnit('france','officer',start.x+40,start.y-25));
    made.push(createUnit('france','drummer',start.x+62,start.y-25));
    const reg=createRegiment('france',made);
    orderGroupPathV06(reg,goal.x,goal.y,'line',0);

    const path=(reg.path||[]).map(p=>({x:p.x,y:p.y}));
    const last=path[path.length-1]||null;
    return {
      startSide:bankSideV067(start.x,start.y),
      goalSide:bankSideV067(goal.x,goal.y),
      nearest:nearestCrossingV067(start.x,start.y,goal.x,goal.y,'infantry')?.id||null,
      pathLength:path.length,
      last,
      remaining:last?Math.hypot(last.x-goal.x,last.y-goal.y):null,
      routeCrossings:reg.routeCrossingsV067||[],
      navigation:reg.navigationV2||null,
      resolver:window.NRTS_BRIDGE_ROUTE_RESOLVER_V2?.stats?.()||null
    };
  });

  console.log('INCOMPLETE_WATER_ROUTE_DIAGNOSTIC', JSON.stringify(diagnostic));
  expect(diagnostic.startSide * diagnostic.goalSide).toBeLessThan(0);
  expect(diagnostic.pathLength).toBeGreaterThan(0);
  expect(diagnostic.remaining).toBeLessThan(120);
  expect(diagnostic.routeCrossings.length).toBeGreaterThan(0);
});
