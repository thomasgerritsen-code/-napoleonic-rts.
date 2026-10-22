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
    zoom: camera.zoom,
    // The full map: every road and village house (the open map is the iso view's).
    roads: (window.NRTS_ROAD_NETWORK_V7 || []).length, mapVariant: window.NRTS_CONFIG.world.mapVariant,
    houses: (window.VILLAGE_SCENERY_V4 || []).flatMap(v => v.houses).length, openMap: typeof window.__OPEN_MAP_V1__
  }));
  expect(r.iso).toBe('undefined');
  expect(r.roads).toBe(37);
  expect(r.houses).toBe(224);
  expect(r.mapVariant).toBe('standard');
  expect(r.openMap).toBe('undefined');
  expect(r.toggle).toBe(false);
  expect(r.dy).toBeCloseTo(100 / r.zoom, 3);
  expect(errors).toEqual([]);
});

test('with ?view=iso the game is drawn with the Blender sprites, terrain and props', async ({ page }) => {
  const errors = await openGame(page, 'test=iso&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().atlases >= 14, null, { timeout: 60_000 });
  // Let a few frames draw (the test page advances the simulation itself).
  // Ground: the Blender battlefield, or the game's own terrain tiles until it has loaded.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().sprites > 10 &&
    (window.__ISO_VIEW_V1__.stats().ground || window.__ISO_VIEW_V1__.stats().tilesDrawn > 0));
  const s = await stats(page);
  expect(s.on).toBe(true);
  expect(s.ppm).toBe(22.5);
  expect(s.props).toBeGreaterThan(5);
  await expect(page.locator('#isoViewToggle')).toHaveText('🗺 2D-kaart');
  // Iso projection: the ground is squashed to half height (give or take the
  // slope of the relief), and a screen point maps back to itself.
  const dy = await page.evaluate(() => screenToWorld(innerWidth / 2, innerHeight / 2 + 100).y - screenToWorld(innerWidth / 2, innerHeight / 2).y);
  const zoom = await page.evaluate(() => camera.zoom);
  expect(dy).toBeGreaterThan(200 / zoom * 0.75);
  expect(dy).toBeLessThan(200 / zoom * 1.35);
  const round = await page.evaluate(() => { const w = screenToWorld(400, 300), p = worldToScreen(w.x, w.y); return Math.hypot(p.x - 400, p.y - 300); });
  expect(round).toBeLessThan(0.5);
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
  // Iso: about 200 (the relief bends it a little); 2D: exactly 100.
  const isoDy = async () => { const d = await dy(); expect(d).toBeGreaterThan(150); expect(d).toBeLessThan(270); };
  await isoDy();
  await page.locator('#isoViewToggle').click();
  await expect(page.locator('#isoViewToggle')).toHaveText('🏰 Iso-weergave');
  expect(await page.evaluate(() => window.__ISO_VIEW_V1__.isOn())).toBe(false);
  expect(await dy()).toBeCloseTo(100, 3);
  await page.locator('#isoViewToggle').click();
  expect(await page.evaluate(() => window.__ISO_VIEW_V1__.isOn())).toBe(true);
  await isoDy();
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
  // The open map: a few small villages, well apart.
  expect(s.villageHouses).toBeGreaterThan(20);
  expect(s.villageHouses).toBeLessThan(80);
  expect(s.openMap.villages).toBeLessThanOrEqual(9);
  expect(s.dressingItems).toBeGreaterThan(20);
  // Every house with a gate in front of it has its door on that side.
  const doors = await page.evaluate(() => window.__ISO_VIEW_V1__.doorCheck());
  expect(doors.filter(d => d < -0.5)).toEqual([]);
  expect(doors.filter(d => d > 0.5).length).toBeGreaterThan(doors.length * 0.7);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().chimneySmoke > 0);
  expect(errors).toEqual([]);
});

test('iso view: soldiers stay readable - side rings, scenery in front of them turns see-through, Overzicht dims the rest', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-clear&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().villageKinds >= 9, null, { timeout: 60_000 });
  // A line of French foot just behind (north of) a village house.
  await page.evaluate(() => {
    const h = (window.VILLAGE_SCENERY_V4 || window.__VILLAGE_SCENERY_V4_DATA__)[0].houses[0];
    for (let i = 0; i < 8; i++) createUnit('france', 'infantry', h.x - 60 + i * 18, h.y - 14);
    camera.x = h.x; camera.y = h.y; camera.zoom = 1.1;
  });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().seeThrough > 0);
  expect((await page.evaluate(() => window.__ISO_VIEW_V1__.stats())).detailed).toBe(true);
  await page.locator('#isoOverviewToggle').click();
  await expect(page.locator('#isoOverviewToggle')).toHaveText('👁 Overzicht: aan');
  let s = await page.evaluate(() => window.__ISO_VIEW_V1__.stats());
  expect(s.overview).toBe(true);
  expect(s.detailed).toBe(false);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().dressing === 0);
  // Far out the small village detail goes by itself.
  await page.locator('#isoOverviewToggle').click();
  await page.evaluate(() => { camera.zoom = 0.45; });
  s = await page.evaluate(() => window.__ISO_VIEW_V1__.stats());
  expect(s.detailed).toBe(false);
  // In the 2D map the Overzicht button is hidden.
  await page.locator('#isoViewToggle').click();
  await expect(page.locator('#isoOverviewToggle')).toBeHidden();
  expect(errors).toEqual([]);
});

test('iso view: the battlefield ground, woods and peasants come from Blender', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-ground&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().ground === true, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().workerSprites === true, null, { timeout: 60_000 });
  const s = await page.evaluate(() => window.__ISO_VIEW_V1__.stats());
  expect(s.woodTrees).toBeGreaterThan(50);
  // Poplar avenues along the chaussees.
  expect(s.avenueTrees).toBeGreaterThan(80);
  // Peasants drawn as sprites, not the stand-in figures.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().workers === 0 && window.__ISO_VIEW_V1__.stats().sprites > 10);
  // Relief: hills metres high; on a hilltop a man is drawn higher than on flat
  // ground, and a click on the screen finds the ground point it shows.
  expect(s.relief).toBeGreaterThan(5);
  const r = await page.evaluate(() => {
    const hill = TERRAIN_HILLS.reduce((a, b) => (b.height || 0) > (a.height || 0) ? b : a);
    camera.x = hill.x; camera.y = hill.y; camera.zoom = 1;
    const p = worldToScreen(hill.x, hill.y), back = screenToWorld(p.x, p.y);
    const flat = (hill.y - camera.y) * camera.zoom * 0.5 + innerHeight / 2;
    return { up: flat - p.y, dx: back.x - hill.x, dy: back.y - hill.y };
  });
  expect(r.up).toBeGreaterThan(3 * 22.5 * 0.866);
  expect(Math.abs(r.dx)).toBeLessThan(1);
  expect(Math.abs(r.dy)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('iso view: a right-click on an enemy sends the selection to musket reach facing it, with a target sight', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-attack&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().sprites > 5, null, { timeout: 60_000 });
  const ids = await page.evaluate(() => {
    const D = window.__RTS_DEBUG__, base = units.find(u => u.side === 'france' && u.type === 'infantry');
    for (let i = 0; i < 12; i++) createUnit('france', 'infantry', base.x + i * 3, base.y + 40);
    const id = D.createRegimentDirect('france'); D.selectRegiment(id);
    const enemy = [];
    for (let i = 0; i < 10; i++) enemy.push(createUnit('britain', 'infantry', base.x + 120 + i * 18, base.y + 170).id);
    camera.x = base.x + 120; camera.y = base.y + 110; camera.zoom = 0.9;
    return { id, enemy };
  });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().sprites > 20);
  const e = await page.evaluate(id => window.__ISO_VIEW_V1__.bodyOf(units.find(u => u.id === id)), ids.enemy[4]);
  const before = await page.evaluate(() => window.__ISO_VIEW_V1__.stats().attacks || 0);
  await page.mouse.click(e.x, e.y, { button: 'right' });
  expect(await page.evaluate(() => window.__ISO_VIEW_V1__.stats().attacks || 0)).toBe(before + 1);
  // The regiment closes on the enemy and ends at about musket reach.
  await page.evaluate(() => window.__RTS_DEBUG__.tick(12));
  const gap = await page.evaluate(([id, enemy]) => {
    const own = regimentMembers(getRegiment(id)).filter(u => !u.dead), foe = units.filter(u => enemy.includes(u.id) && !u.dead);
    const a = centroid(own), b = centroid(foe);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }, [ids.id, ids.enemy]);
  expect(gap).toBeLessThan(160);
  expect(errors).toEqual([]);
});

test('iso view: an open map with fewer roads, and men cross the river on Blender bridges, up on the deck', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-bridge&view=iso');
  const map = await page.evaluate(() => ({
    roads: window.NRTS_ROAD_NETWORK_V7.length, variant: window.NRTS_CONFIG.world.mapVariant,
    villages: window.VILLAGE_SCENERY_V4.length, obstacles: window.VILLAGE_SCENERY_V4.flatMap(v => v.houses).length
  }));
  expect(map.variant).toBe('open');
  expect(map.roads).toBeLessThan(25);
  expect(map.villages).toBeLessThanOrEqual(9);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().props >= 14, null, { timeout: 60_000 });
  // A French soldier in the middle of a stone and of a timber bridge.
  const ids = await page.evaluate(() => ['stone', 'wood'].map(mat => {
    const b = WATER_CROSSINGS_V067.find(c => c.material === mat);
    return { id: createUnit('france', 'infantry', b.x, b.y).id, x: b.x, y: b.y };
  }));
  for (const at of ids) {
    await page.evaluate(at => { camera.x = at.x; camera.y = at.y; camera.zoom = 1.2; }, at);
    await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().bridges > 0 && window.__ISO_VIEW_V1__.stats().onBridge > 0);
    const lift = await page.evaluate(id => {
      const u = units.find(q => q.id === id), iso = window.__ISO_VIEW_V1__;
      return { deck: iso.deckAt(u.x, u.y).h, off: iso.deckAt(u.x, u.y + 400), body: iso.screenOf(u.x, u.y).y - iso.bodyOf(u).y };
    }, at.id);
    // The deck is a metre or so up (22.5 px a metre); off the bridge nothing is lifted.
    expect(lift.deck).toBeGreaterThan(18);
    expect(lift.off).toBe(null);
    expect(lift.body).toBeGreaterThan(0.9 * 22.5 * 0.866 * 1.2 + 10);
  }
  expect(errors).toEqual([]);
});

test('iso view: fog of war in three shades on the relief, and high ground sees farther', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-fog&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().ground === true && window.__ISO_VIEW_V1__.stats().heightSight, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const hill = TERRAIN_HILLS.reduce((a, b) => (b.height || 0) > (a.height || 0) ? b : a);
    const top = createUnit('france', 'infantry', hill.x, hill.y), low = createUnit('france', 'infantry', 1900, 3000);
    camera.x = 600; camera.y = 900; camera.zoom = 0.7;
    return { top: visionRadius(top), low: visionRadius(low) };
  });
  // On the highest hilltop a musketeer sees farther; down by the river, as before (215).
  expect(r.low).toBeLessThan(230);
  expect(r.top).toBeGreaterThan(r.low * 1.25);
  expect(r.top).toBeLessThanOrEqual(215 * 1.5 + 1);
  // Explored ground (the French start) is drawn under a veil, and sight around the troops.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().fogCells > 20 && window.__ISO_VIEW_V1__.stats().fogSources > 0);
  expect(errors).toEqual([]);
});
