const { test, expect } = require('@playwright/test');

async function bootPhone(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__OFFICER_REGIMENT_MOBILE_V1__);
}

test('one selected officer can automatically form a regiment', async ({ page }) => {
  await bootPhone(page);

  const officer = await page.evaluate(() => {
    const unit = window.RTS_SIM.snapshot().units.find(u => u.side === 'france' && u.type === 'officer' && !u.regimentId);
    if (!unit) return null;
    window.RTS_SIM.dispatch({ type: 'select-point', x: unit.x, y: unit.y });
    return { id: unit.id };
  });
  expect(officer).not.toBeNull();

  const selectedBefore = await page.evaluate(() => window.RTS_SIM.snapshot().selection.unitIds);
  expect(selectedBefore).toEqual([officer.id]);

  const createButton = page.locator('#actions [data-action="create-regiment"]');
  await expect(createButton).toBeVisible();
  await expect(createButton).toBeEnabled();
  await expect(createButton).toContainText('Maak regiment');
  await expect(createButton).toContainText('auto');

  const draft = await page.evaluate(() => window.__OFFICER_REGIMENT_MOBILE_V1__.draft());
  expect(draft?.officerId).toBe(officer.id);
  expect(draft?.infantryIds).toHaveLength(12);
  expect(draft?.drummerId).not.toBeNull();
  expect(draft?.canCreate).toBe(true);

  await createButton.click();
  const result = await page.evaluate(() => {
    const snap = window.RTS_SIM.snapshot();
    const regiment = snap.groups.find(group => !group.destroyed && group.members.some(member => member.id === snap.selection.unitIds[0]));
    return { snap, regiment };
  });

  expect(result.regiment).toBeTruthy();
  expect(result.regiment.members.filter(member => member.type === 'infantry')).toHaveLength(12);
  expect(result.regiment.members.some(member => member.type === 'officer' && member.id === officer.id)).toBe(true);
  expect(result.regiment.members.some(member => member.type === 'drummer')).toBe(true);
  expect(result.snap.selection.unitIds).toHaveLength(14);
});

test('automatic regiment creation never recruits distant loose troops', async ({ page }) => {
  await bootPhone(page);

  const officerId = await page.evaluate(() => {
    const officer = freeUnits('france', 'officer')[0];
    if (!officer) return null;
    for (const unit of [
      ...freeUnits('france', 'infantry'),
      ...freeUnits('france', 'drummer')
    ]) {
      unit.x = officer.x + 700;
      unit.y = officer.y + 700;
      unit.targetX = unit.x;
      unit.targetY = unit.y;
    }
    selectedUnits.clear();
    selectedUnits.add(officer);
    selectedBuilding = null;
    actionSignature = '';
    updateHud(true);
    return officer.id;
  });
  expect(officerId).not.toBeNull();

  const draft = await page.evaluate(() => window.__OFFICER_REGIMENT_MOBILE_V1__.draft());
  expect(draft).toMatchObject({
    officerId,
    drummerId: null,
    infantryIds: [],
    canCreate: false,
    autoAddedInfantry: 0,
    autoAddedDrummer: false
  });

  const createButton = page.locator('#actions [data-action="create-regiment"]');
  await expect(createButton).toBeVisible();
  await expect(createButton).toBeDisabled();
  await expect(createButton).toContainText('binnen 320 m');
  await expect(createButton).toHaveAttribute('title', /Binnen 320 meter/);
});

