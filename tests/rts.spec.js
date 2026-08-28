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
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.getState));
  return pageErrors;
}

async function state(page) {
  return page.evaluate(() => window.__RTS_DEBUG__.getState());
}

test('v0.5 loads, renders canvas and exposes minimap without JavaScript errors', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await expect(page).toHaveTitle(/Napoleonic RTS v0\.5/);
  await expect(page.locator('.version')).toHaveText('v0.5');
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#minimap')).toBeVisible();

  const s = await state(page);
  expect(s.minimap.width).toBe(240);
  expect(s.minimap.height).toBe(138);
  expect(s.navigation.buckets).toBeGreaterThanOrEqual(0);

  await testInfo.attach('v05-initial-battlefield', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
  expect(errors).toEqual([]);
});

test('regiment retains officer/drummer and can rotate its front with real controls', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.selectLooseForRegiment('france'));
  const createButton = page.locator('[data-action="create-regiment"]');
  await expect(createButton).toBeEnabled();
  await createButton.click();

  let s = await state(page);
  expect(s.france.regiments).toHaveLength(1);
  expect(s.france.regiments[0].officerAssigned).toBe(true);
  expect(s.france.regiments[0].drummerAssigned).toBe(true);
  const initialFacing = s.france.regiments[0].facing;

  await page.locator('[data-action="rotate-right"]').click();
  s = await state(page);
  expect(s.france.regiments[0].facing).toBeGreaterThan(initialFacing);

  await page.keyboard.press('q');
  s = await state(page);
  expect(Math.abs(s.france.regiments[0].facing - initialFacing)).toBeLessThan(0.01);

  for (const mode of ['column', 'square', 'line']) {
    await page.locator(`[data-formation="${mode}"]`).click();
    s = await state(page);
    expect(s.france.regiments[0].formation).toBe(mode);
  }
  expect(errors).toEqual([]);
});

test('Stable and Artillery Foundry produce cavalry and artillery through UI clicks', async ({ page }) => {
  const errors = await openGame(page);
  const stableId = await page.evaluate(() => window.__RTS_DEBUG__.createCompletedBuilding('france', 'stable', 900, 760));
  const foundryId = await page.evaluate(() => window.__RTS_DEBUG__.createCompletedBuilding('france', 'foundry', 920, 1040));

  let s = await state(page);
  const beforeCav = s.france.units.filter(u => u.type === 'cavalry').length;
  const beforeArt = s.france.units.filter(u => u.type === 'artillery').length;
  const beforeFood = s.france.food;
  const beforeWood = s.france.wood;

  await page.evaluate(id => window.__RTS_DEBUG__.selectBuildingById(id), stableId);
  await expect(page.locator('[data-action="train-cavalry"]')).toBeVisible();
  await page.locator('[data-action="train-cavalry"]').click();

  await page.evaluate(id => window.__RTS_DEBUG__.selectBuildingById(id), foundryId);
  await expect(page.locator('[data-action="train-artillery"]')).toBeVisible();
  await page.locator('[data-action="train-artillery"]').click();

  s = await state(page);
  expect(s.france.food).toBe(beforeFood - 270);
  expect(s.france.wood).toBe(beforeWood - 150);

  await page.evaluate(() => window.__RTS_DEBUG__.tick(17));
  s = await state(page);
  expect(s.france.units.filter(u => u.type === 'cavalry').length).toBeGreaterThanOrEqual(beforeCav + 1);
  expect(s.france.units.filter(u => u.type === 'artillery').length).toBeGreaterThanOrEqual(beforeArt + 1);
  expect(errors).toEqual([]);
});

test('fog of war hides distant British forces while minimap remains interactive', async ({ page }) => {
  const errors = await openGame(page);
  const s = await state(page);
  const distant = s.britain.units.find(u => u.type === 'worker') || s.britain.units[0];
  const visible = await page.evaluate(id => window.__RTS_DEBUG__.isVisible('britain', id, 'unit'), distant.id);
  expect(visible).toBe(false);

  const minimap = page.locator('#minimap');
  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  await minimap.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect(minimap).toBeVisible();
  expect(errors).toEqual([]);
});

test('British AI builds its full v0.5 military economy in peace mode', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    window.__RTS_DEBUG__.grantResources('britain', 5000, 5000);
    window.__RTS_DEBUG__.tick(260);
  });
  const developed = await state(page);

  expect(developed.britain.buildings.some(b => b.type === 'barracks' && b.complete)).toBe(true);
  expect(developed.britain.regiments.length).toBeGreaterThanOrEqual(1);
  expect(developed.britain.buildings.some(b => b.type === 'stable' && b.complete)).toBe(true);
  expect(developed.britain.buildings.some(b => b.type === 'foundry' && b.complete)).toBe(true);
  expect(developed.britain.units.some(u => u.type === 'cavalry')).toBe(true);
  expect(developed.britain.units.some(u => u.type === 'artillery')).toBe(true);

  for (const regiment of developed.britain.regiments) {
    expect(regiment.officerAssigned).toBe(true);
    expect(regiment.drummerAssigned).toBe(true);
  }

  await testInfo.attach('v05-british-development', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
  expect(errors).toEqual([]);
});
