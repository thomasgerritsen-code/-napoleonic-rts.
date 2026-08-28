const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });

  await page.goto('/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__));
  return pageErrors;
}

async function state(page) {
  return page.evaluate(() => window.__RTS_DEBUG__.getState());
}

test('v0.4 loads and renders the battlefield without JavaScript errors', async ({ page }, testInfo) => {
  const errors = await openGame(page);

  await expect(page).toHaveTitle(/Napoleonic RTS v0\.4/);
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('.version')).toHaveText('v0.4');
  await expect(page.locator('#aiEconomy')).toContainText('Economie:');

  const box = await page.locator('#game').boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(500);
  expect(box.height).toBeGreaterThan(300);

  await testInfo.attach('initial-battlefield', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });

  expect(errors).toEqual([]);
});

test('a regiment requires and retains an assigned officer and drummer', async ({ page }) => {
  const errors = await openGame(page);

  await page.evaluate(() => window.__RTS_DEBUG__.selectLooseForRegiment('france'));
  const createButton = page.locator('[data-action="create-regiment"]');
  await expect(createButton).toBeVisible();
  await expect(createButton).toBeEnabled();
  await expect(createButton).toContainText('12/12');

  await createButton.click();

  let s = await state(page);
  expect(s.france.regiments).toHaveLength(1);
  const regiment = s.france.regiments[0];
  expect(regiment.formedInfantryCount).toBeGreaterThanOrEqual(12);
  expect(regiment.officerAssigned).toBe(true);
  expect(regiment.drummerAssigned).toBe(true);
  expect(regiment.memberIds.length).toBeGreaterThanOrEqual(14);
  expect(s.selected.length).toBe(regiment.livingMembers.length);

  for (const mode of ['column', 'square', 'line']) {
    await page.locator(`[data-formation="${mode}"]`).click();
    s = await state(page);
    expect(s.france.regiments[0].formation).toBe(mode);
    await expect(page.locator(`[data-formation="${mode}"]`)).toHaveClass(/active/);
  }

  expect(errors).toEqual([]);
});

test('Barracks can queue and produce musketier, officer and drummer through real UI clicks', async ({ page }) => {
  const errors = await openGame(page);

  const barracksId = await page.evaluate(() => window.__RTS_DEBUG__.createCompletedBuilding('france', 'barracks', 900, 900));
  await page.evaluate(id => window.__RTS_DEBUG__.selectBuildingById(id), barracksId);

  let s = await state(page);
  const before = {
    food: s.france.food,
    wood: s.france.wood,
    infantry: s.france.units.filter(u => u.type === 'infantry').length,
    officer: s.france.units.filter(u => u.type === 'officer').length,
    drummer: s.france.units.filter(u => u.type === 'drummer').length
  };

  await page.locator('[data-action="train-infantry"]').click();
  await page.locator('[data-action="train-officer"]').click();
  await page.locator('[data-action="train-drummer"]').click();

  s = await state(page);
  expect(s.selectedBuilding.queue).toEqual(['infantry', 'officer', 'drummer']);
  expect(s.france.food).toBe(before.food - 330);
  expect(s.france.wood).toBe(before.wood - 100);

  await page.evaluate(() => window.__RTS_DEBUG__.tick(26));
  s = await state(page);
  expect(s.france.units.filter(u => u.type === 'infantry').length).toBeGreaterThanOrEqual(before.infantry + 1);
  expect(s.france.units.filter(u => u.type === 'officer').length).toBeGreaterThanOrEqual(before.officer + 1);
  expect(s.france.units.filter(u => u.type === 'drummer').length).toBeGreaterThanOrEqual(before.drummer + 1);
  expect(s.selectedBuilding.queue).toEqual([]);

  expect(errors).toEqual([]);
});

test('British AI develops its economy, constructs production and forms a valid regiment', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  const initial = await state(page);

  expect(initial.britain.buildings.some(b => b.type === 'barracks')).toBe(false);
  expect(initial.britain.regiments).toHaveLength(0);

  await page.evaluate(() => window.__RTS_DEBUG__.tick(180));
  const developed = await state(page);

  expect(developed.britain.buildings.some(b => b.type === 'barracks' && b.complete)).toBe(true);
  expect(developed.britain.units.length).toBeGreaterThan(initial.britain.units.length);
  expect(developed.britain.regiments.length).toBeGreaterThanOrEqual(1);

  for (const regiment of developed.britain.regiments) {
    expect(regiment.formedInfantryCount).toBeGreaterThanOrEqual(12);
    expect(regiment.officerAssigned).toBe(true);
    expect(regiment.drummerAssigned).toBe(true);
  }

  await expect(page.locator('#aiBuildings')).toContainText('Gebouwen:');
  await expect(page.locator('#aiRegiments')).toContainText('Regimenten:');

  await testInfo.attach('british-ai-after-180s', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });

  expect(errors).toEqual([]);
});
