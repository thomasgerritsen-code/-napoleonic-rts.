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
  // A French musketeer whose body is on the open canvas (not under a HUD panel).
  const body = await page.evaluate(() => {
    const onCanvas = (x, y) => document.elementFromPoint(x, y)?.id === 'game';
    for (const u of units) {
      if (u.dead || u.side !== 'france' || u.type !== 'infantry') continue;
      const b = window.__ISO_VIEW_V1__.bodyOf(u);
      if (onCanvas(b.x, b.y)) return { ...b, id: u.id };
    }
    return null;
  });
  expect(body, 'a French musketeer visible on the canvas').not.toBeNull();
  await page.mouse.click(body.x, body.y);
  let sel = await page.evaluate(() => [...selectedUnits].map(u => u.id));
  expect(sel, 'clicking his body selects him (or his regiment)').toContain(body.id);
  // A box round him: corners kept on the open canvas.
  const box = await page.evaluate(([x, y]) => {
    const onCanvas = (a, b) => document.elementFromPoint(a, b)?.id === 'game';
    for (const r of [160, 120, 80, 50]) {
      const c = [x - r, y - r * 0.6, x + r, y + r * 0.6];
      if (onCanvas(c[0], c[1]) && onCanvas(c[2], c[3]) && onCanvas(c[0], c[3]) && onCanvas(c[2], c[1])) return c;
    }
    return null;
  }, [body.x, body.y]);
  expect(box, 'room for a selection box').not.toBeNull();
  await page.mouse.move(box[0], box[1]);
  await page.mouse.down();
  await page.mouse.move(box[2], box[3], { steps: 6 });
  await page.mouse.up();
  sel = await page.evaluate(() => [...selectedUnits].filter(u => u.type !== 'worker').map(u => u.id));
  expect(sel.length, 'the box selects soldiers').toBeGreaterThan(1);
  // Right-click on open ground beside them: their move target is that ground point.
  const spot = await page.evaluate(([x, y]) => {
    const onCanvas = (a, b) => document.elementFromPoint(a, b)?.id === 'game';
    for (const [dx, dy] of [[180, 40], [-180, 40], [180, -40], [-180, -40], [120, 0], [-120, 0]]) if (onCanvas(x + dx, y + dy)) return { x: x + dx, y: y + dy };
    return null;
  }, [body.x, body.y]);
  expect(spot, 'open ground to order a move to').not.toBeNull();
  const goal = await page.evaluate(([x, y]) => screenToWorld(x, y), [spot.x, spot.y]);
  const dist = () => page.evaluate(([ids, gx, gy]) => {
    const men = units.filter(u => ids.includes(u.id) && !u.dead);
    const c = men.reduce((a, u) => ({ x: a.x + u.x / men.length, y: a.y + u.y / men.length }), { x: 0, y: 0 });
    return Math.hypot(c.x - gx, c.y - gy);
  }, [sel, goal.x, goal.y]);
  const before = await dist();
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.evaluate(() => window.__RTS_DEBUG__.tick(6));
  const after = await dist();
  expect(after, `they march towards the clicked point (${Math.round(before)} -> ${Math.round(after)} px)`).toBeLessThan(before * 0.7);
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

test('iso view: villages stand as Blender buildings facing their road, with yards dressed and chimneys smoking', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-village&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().villageKinds >= 9, null, { timeout: 60_000 });
  // Look at the first village (with a few French horse there so the fog lifts).
  await page.evaluate(() => {
    const v = (window.VILLAGE_SCENERY_V4 || window.__VILLAGE_SCENERY_V4_DATA__)[0];
    for (let i = 0; i < 4; i++) createUnit('france', 'cavalry', v.x + i * 20, v.y + 120);
    camera.x = v.x; camera.y = v.y + 40; camera.zoom = 1.1;
  });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().houses > 5 && window.__ISO_VIEW_V1__.stats().dressing > 5);
  const s = await page.evaluate(() => window.__ISO_VIEW_V1__.stats());
  expect(s.villageHouses).toBeGreaterThan(100);
  expect(s.dressingItems).toBeGreaterThan(100);
  // Every house with a gate in front of it has its door on that side.
  const doors = await page.evaluate(() => window.__ISO_VIEW_V1__.doorCheck());
  expect(doors.filter(d => d < -0.5)).toEqual([]);
  expect(doors.filter(d => d > 0.5).length).toBeGreaterThan(doors.length * 0.7);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().chimneySmoke > 0);
  expect(errors).toEqual([]);
});
