const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.getState));
  return errors;
}

async function createAndSelectBarracks(page) {
  const id = await page.evaluate(() => window.__RTS_DEBUG__.createCompletedBuilding('france', 'barracks', 900, 800));
  await page.evaluate(buildingId => window.__RTS_DEBUG__.selectBuildingById(buildingId), id);
  return id;
}

test('production buttons expose live food and wood shortages without charging blocked actions', async ({ page }) => {
  const errors = await openGame(page);
  const barracksId = await createAndSelectBarracks(page);
  const officer = page.locator('[data-action="train-officer"]');
  const drummer = page.locator('[data-action="train-drummer"]');

  await expect(officer).toContainText('160 🍞');
  await expect(officer).toContainText('60 🪵');
  await expect(officer).toContainText('1 👥');
  await expect(officer).toBeEnabled();

  await page.evaluate(() => window.__RTS_DEBUG__.grantResources('france', -1000, 0));
  await expect(officer).toBeDisabled();
  await expect(officer).toHaveAttribute('data-shortage', 'food');
  await expect(officer).toContainText('⚠ 160 🍞');
  await expect(drummer).toBeEnabled();

  const beforeBlocked = await page.evaluate(id => {
    const state = window.__RTS_DEBUG__.getState();
    const building = state.france.buildings.find(item => item.id === id);
    return { food: state.france.food, wood: state.france.wood, queue: building.queue.length };
  }, barracksId);
  await officer.evaluate(button => button.click());
  const afterBlocked = await page.evaluate(id => {
    const state = window.__RTS_DEBUG__.getState();
    const building = state.france.buildings.find(item => item.id === id);
    return { food: state.france.food, wood: state.france.wood, queue: building.queue.length };
  }, barracksId);
  expect(afterBlocked).toEqual(beforeBlocked);

  await drummer.click();
  const afterAffordable = await page.evaluate(id => {
    const state = window.__RTS_DEBUG__.getState();
    const building = state.france.buildings.find(item => item.id === id);
    return { food: state.france.food, wood: state.france.wood, queue: building.queue };
  }, barracksId);
  expect(afterAffordable.food).toBe(beforeBlocked.food - 90);
  expect(afterAffordable.wood).toBe(beforeBlocked.wood - 20);
  expect(afterAffordable.queue).toEqual(['drummer']);

  await page.evaluate(() => window.__RTS_DEBUG__.grantResources('france', 1090, -1070));
  const infantry = page.locator('[data-action="train-infantry"]');
  await expect(infantry).toBeDisabled();
  await expect(infantry).toHaveAttribute('data-shortage', 'wood');
  await expect(infantry).toContainText('⚠ 20 🪵');
  expect(errors).toEqual([]);
});

test.describe('mobile production feedback', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('full population disables every training action without enlarging the action bar', async ({ page }) => {
    const errors = await openGame(page);
    const barracksId = await createAndSelectBarracks(page);
    await page.evaluate(() => window.__RTS_DEBUG__.grantResources('france', 10000, 10000));
    const initialHeight = await page.locator('#actions').evaluate(element => element.getBoundingClientRect().height);
    const capacity = await page.evaluate(() => {
      const state = window.__RTS_DEBUG__.getState();
      return state.france.popCap - state.france.popUsed;
    });
    expect(capacity).toBeGreaterThan(0);

    const infantry = page.locator('[data-action="train-infantry"]');
    for (let i = 0; i < capacity; i++) await infantry.tap();
    await page.evaluate(seconds => window.__RTS_DEBUG__.tick(seconds), capacity * 6 + 2);

    const stateAtCap = await page.evaluate(() => window.__RTS_DEBUG__.getState());
    expect(stateAtCap.france.popUsed).toBe(stateAtCap.france.popCap);
    for (const action of ['train-infantry', 'train-officer', 'train-drummer']) {
      const button = page.locator(`[data-action="${action}"]`);
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('data-shortage', /population/);
      await expect(button).toContainText('⚠ 1 👥');
    }
    const fullHeight = await page.locator('#actions').evaluate(element => element.getBoundingClientRect().height);
    expect(fullHeight).toBeLessThanOrEqual(initialHeight + 2);

    const beforeBlocked = await page.evaluate(id => {
      const state = window.__RTS_DEBUG__.getState();
      return state.france.buildings.find(item => item.id === id).queue.length;
    }, barracksId);
    await infantry.evaluate(button => button.click());
    const afterBlocked = await page.evaluate(id => {
      const state = window.__RTS_DEBUG__.getState();
      return state.france.buildings.find(item => item.id === id).queue.length;
    }, barracksId);
    expect(afterBlocked).toBe(beforeBlocked);
    expect(errors).toEqual([]);
  });
});
