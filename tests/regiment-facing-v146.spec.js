const { test, expect } = require('@playwright/test');

async function prepare(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment));
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  return errors;
}

test('regiment line rotates to face its movement direction', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const id = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 900, 900);
    const reg = getRegiment(id);
    selectWholeRegiment(reg);
    const before = centroid(regimentMembers(reg));
    issueMove(before.x + 500, before.y);
    const infantry = regimentMembers(reg).filter(u => u.type === 'infantry');
    const xs = infantry.map(u => u.targetX);
    const ys = infantry.map(u => u.targetY);
    return {
      facing: reg.facing,
      xSpan: Math.max(...xs) - Math.min(...xs),
      ySpan: Math.max(...ys) - Math.min(...ys)
    };
  });

  expect(Math.abs(result.facing)).toBeLessThan(0.05);
  expect(result.ySpan).toBeGreaterThan(result.xSpan * 3);
  expect(errors).toEqual([]);
});

test('multi-regiment destinations spread perpendicular to the march axis', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const a = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 800, 760));
    const b = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 800, 1040));
    selectedUnits.clear();
    [...regimentMembers(a), ...regimentMembers(b)].forEach(u => selectedUnits.add(u));
    const center = centroid([...regimentMembers(a), ...regimentMembers(b)]);
    issueMove(center.x + 600, center.y);
    return {
      dx: Math.abs(a.targetX - b.targetX),
      dy: Math.abs(a.targetY - b.targetY),
      spacing: Math.hypot(a.targetX - b.targetX, a.targetY - b.targetY),
      facingA: a.facing,
      facingB: b.facing
    };
  });

  expect(result.dx).toBeLessThan(3);
  expect(result.dy).toBeGreaterThan(300);
  expect(result.spacing).toBeGreaterThanOrEqual(330);
  expect(Math.abs(result.facingA - result.facingB)).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});

test('changing formation preserves the regiment facing', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const reg = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1000, 900));
    selectWholeRegiment(reg);
    const c = centroid(regimentMembers(reg));
    issueMove(c.x + 350, c.y + 350);
    const facingBefore = reg.facing;
    applyFormationNow('column');
    return { facingBefore, facingAfter: reg.facing, formation: reg.formation };
  });

  expect(result.formation).toBe('column');
  expect(Math.abs(result.facingAfter - result.facingBefore)).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});

test('regiment movement keeps destination slots inside world bounds', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const reg = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 300, 300));
    selectWholeRegiment(reg);
    issueMove(22, 22);
    const members = regimentMembers(reg);
    return {
      minX: Math.min(...members.map(u => u.targetX)),
      minY: Math.min(...members.map(u => u.targetY)),
      maxX: Math.max(...members.map(u => u.targetX)),
      maxY: Math.max(...members.map(u => u.targetY)),
      worldWidth: WORLD.width,
      worldHeight: WORLD.height
    };
  });

  expect(result.minX).toBeGreaterThanOrEqual(20);
  expect(result.minY).toBeGreaterThanOrEqual(20);
  expect(result.maxX).toBeLessThanOrEqual(result.worldWidth - 20);
  expect(result.maxY).toBeLessThanOrEqual(result.worldHeight - 20);
  expect(errors).toEqual([]);
});
