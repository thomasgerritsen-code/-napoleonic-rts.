const { test, expect } = require('@playwright/test');
// Iso view v1: the Graphics Lab's Blender sprites drawing the running game, opt-in with ?view=iso.
test.describe.configure({ timeout: 90_000 });

async function openGame(page, query) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?' + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.getState));
  return errors;
}
const stats = page => page.evaluate(() => window.__ISO_VIEW_V1__.stats());

test('without ?view=iso the game is untouched: no iso view, no toggle, top-down projection', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-off');
  const r = await page.evaluate(() => ({
    iso: typeof window.__ISO_VIEW_V1__, toggle: !!document.getElementById('isoViewToggle'),
    // The top-down projection: one screen pixel down is 1/zoom world pixels down.
    dy: screenToWorld(innerWidth / 2, innerHeight / 2 + 100).y - screenToWorld(innerWidth / 2, innerHeight / 2).y,
    zoom: camera.zoom
  }));
  expect(r.iso).toBe('undefined');
  expect(r.toggle).toBe(false);
  expect(r.dy).toBeCloseTo(100 / r.zoom, 3);
  expect(errors).toEqual([]);
});

test('with ?view=iso the game is drawn with the Blender sprites, terrain and props', async ({ page }) => {
  const errors = await openGame(page, 'test=iso&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().atlases >= 14, null, { timeout: 60_000 });
  // Let a few frames draw (the test page advances the simulation itself).
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().sprites > 10 && window.__ISO_VIEW_V1__.stats().tilesDrawn > 0);
  const s = await stats(page);
  expect(s.on).toBe(true);
  expect(s.ppm).toBe(22.5);
  expect(s.props).toBeGreaterThan(5);
  expect(s.workers).toBeGreaterThan(0);
  await expect(page.locator('#isoViewToggle')).toHaveText('🗺 2D-kaart');
  // Iso projection: the ground is squashed to half height.
  const dy = await page.evaluate(() => screenToWorld(innerWidth / 2, innerHeight / 2 + 100).y - screenToWorld(innerWidth / 2, innerHeight / 2).y);
  const zoom = await page.evaluate(() => camera.zoom);
  expect(dy).toBeCloseTo(200 / zoom, 3);
  expect(errors).toEqual([]);
});

test('iso view: clicking a soldier\'s body selects him, a box selects, right-click orders a move', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-input&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().sprites > 10, null, { timeout: 60_000 });
  const body = await page.evaluate(() => {
    const u = units.find(v => v.side === 'france' && v.type === 'infantry' && !v.dead);
    return { ...window.__ISO_VIEW_V1__.bodyOf(u), id: u.id };
  });
  await page.mouse.click(body.x, body.y);
  let sel = await page.evaluate(() => [...selectedUnits].map(u => u.id));
  expect(sel.length).toBeGreaterThan(0);
  // Box round the French start: several units.
  await page.mouse.move(body.x - 220, body.y - 140);
  await page.mouse.down();
  await page.mouse.move(body.x + 220, body.y + 100, { steps: 5 });
  await page.mouse.up();
  sel = await page.evaluate(() => [...selectedUnits].map(u => u.id));
  expect(sel.length).toBeGreaterThan(5);
  // Right-click: the selection is ordered to the clicked ground point (iso projection).
  const goal = await page.evaluate(([x, y]) => screenToWorld(x, y), [body.x + 260, body.y + 90]);
  await page.mouse.click(body.x + 260, body.y + 90, { button: 'right' });
  await page.evaluate(() => window.__RTS_DEBUG__.tick(6));
  const moved = await page.evaluate(([ids, gx, gy]) => {
    const men = units.filter(u => ids.includes(u.id) && !u.dead && u.type !== 'worker');
    const c = men.reduce((a, u) => ({ x: a.x + u.x / men.length, y: a.y + u.y / men.length }), { x: 0, y: 0 });
    return Math.hypot(c.x - gx, c.y - gy);
  }, [sel, goal.x, goal.y]);
  expect(moved).toBeLessThan(220);
  expect(errors).toEqual([]);
});

test('iso view: the toggle switches to the 2D map and back, with the matching projection', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-toggle&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().sprites > 0, null, { timeout: 60_000 });
  const dy = () => page.evaluate(() => (screenToWorld(innerWidth / 2, innerHeight / 2 + 100).y - screenToWorld(innerWidth / 2, innerHeight / 2).y) * camera.zoom);
  expect(await dy()).toBeCloseTo(200, 3);
  await page.locator('#isoViewToggle').click();
  await expect(page.locator('#isoViewToggle')).toHaveText('🏰 Iso-weergave');
  expect(await page.evaluate(() => window.__ISO_VIEW_V1__.isOn())).toBe(false);
  expect(await dy()).toBeCloseTo(100, 3);
  await page.locator('#isoViewToggle').click();
  expect(await page.evaluate(() => window.__ISO_VIEW_V1__.isOn())).toBe(true);
  expect(await dy()).toBeCloseTo(200, 3);
  expect(errors).toEqual([]);
});

test('iso view: a fallen soldier stays on the field as a body', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-fall&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().sprites > 10, null, { timeout: 60_000 });
  await page.evaluate(() => { const u = units.find(v => v.side === 'france' && v.type === 'infantry' && !v.dead); u.hp = 0; u.dead = true; });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().corpses > 0);
  expect(errors).toEqual([]);
});
