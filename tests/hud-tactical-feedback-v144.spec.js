const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment));
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  return errors;
}

async function selectFreshRegiment(page) {
  return page.evaluate(() => {
    const id = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 900, 900);
    const reg = getRegiment(id);
    selectedUnits.clear();
    regimentMembers(reg).forEach(u => selectedUnits.add(u));
    updateHud(true);
    return id;
  });
}

test('selected regiment HUD reports strength, morale and steady state', async ({ page }) => {
  const errors = await openGame(page);
  await selectFreshRegiment(page);

  const details = await page.locator('#selectionDetails');
  await expect(details).toContainText('sterkte 100%');
  await expect(details).toContainText('morale 100%');
  await expect(details).toHaveAttribute('data-tactical-state', 'steady');
  await expect(details).toHaveAttribute('aria-live', 'polite');
  expect(errors).toEqual([]);
});

test('HUD escalates low-strength regiment feedback without extra simulation state', async ({ page }) => {
  const errors = await openGame(page);
  const id = await selectFreshRegiment(page);

  await page.evaluate(regimentId => {
    const reg = getRegiment(regimentId);
    reg.morale = 38;
    regimentMembers(reg).forEach(u => { u.hp = u.maxHp * .48; });
    updateHud();
  }, id);

  const details = page.locator('#selectionDetails');
  await expect(details).toContainText('sterkte 48%');
  await expect(details).toContainText('onder druk');
  await expect(details).toHaveAttribute('data-tactical-state', 'pressured');
  expect(errors).toEqual([]);
});

test('movement and regrouping produce distinct readable tactical states', async ({ page }) => {
  const errors = await openGame(page);
  const id = await selectFreshRegiment(page);

  const movingState = await page.evaluate(regimentId => {
    const reg = getRegiment(regimentId);
    reg.targetX = 1200;
    reg.targetY = 900;
    updateHud();
    return document.getElementById('selectionDetails').dataset.tacticalState;
  }, id);
  expect(movingState).toBe('moving');

  const reformState = await page.evaluate(regimentId => {
    const reg = getRegiment(regimentId);
    reg.postCrossingReformV1322 = { progress: .55, readiness: .62 };
    updateHud();
    return {
      state: document.getElementById('selectionDetails').dataset.tacticalState,
      text: document.getElementById('selectionDetails').textContent
    };
  }, id);
  expect(reformState.state).toBe('reforming');
  expect(reformState.text).toContain('hergroepeert 55%');
  expect(errors).toEqual([]);
});
