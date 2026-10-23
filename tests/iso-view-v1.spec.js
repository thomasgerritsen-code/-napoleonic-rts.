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
  expect(await page.evaluate(() => window.NRTS_CONFIG.ai.pressure)).toBe(null);
  expect(await page.evaluate(() => typeof window.__AI_PRESSURE_V1__)).toBe('undefined');
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
    return { gap: Math.hypot(a.x - b.x, a.y - b.y), range: TYPES.infantry.range };
  }, [ids.id, ids.enemy]);
  // Musket reach is 200 px on the open map: they halt as soon as the enemy is inside it.
  expect(gap.gap).toBeLessThan(gap.range + 30);
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

test('iso view: the British attack in waves on a clock, and buildings can be shot at', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openGame(page, 'test=iso-ai&view=iso');
  // Off in the normal game; on for the open map.
  expect(await page.evaluate(() => window.NRTS_CONFIG.ai.pressure?.firstWave)).toBe(150);
  // Three minutes of play: the first wave goes out with at least one regiment.
  await page.evaluate(() => { while (elapsed < 190) window.__RTS_DEBUG__.tick(10); });
  const s = await page.evaluate(() => window.__AI_PRESSURE_V1__.stats());
  expect(s.waves).toBeGreaterThanOrEqual(1);
  expect(['MASS', 'ADVANCE', 'ATTACK', 'FLANK']).toContain(s.state);
  expect(s.buildingTargets).toBe(true);
  // Men in reach of an undefended town center damage it.
  const hp = await page.evaluate(() => {
    const tc = livingBuildings('france').find(b => b.type === 'towncenter');
    livingUnits('france').filter(u => u.type !== 'worker').forEach(u => { u.dead = true; });
    const men = Array.from({ length: 10 }, (_, i) => createUnit('britain', 'infantry', tc.x + 90 + (i % 5) * 14, tc.y + (i < 5 ? 0 : 18)));
    const before = tc.hp;
    for (let k = 0; k < 40; k++) { men.forEach(u => { u.targetX = u.x; u.targetY = u.y; }); window.__RTS_DEBUG__.tick(0.5); }
    return { before, after: tc.hp };
  });
  expect(hp.after).toBeLessThan(hp.before - 50);
  expect(errors).toEqual([]);
});

test('iso view: a regiment in the defensive stance braces when it stands, and then loses less', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-defend&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const make = y => { const us = []; for (let i = 0; i < 14; i++) us.push(createUnit('france', 'infantry', 900 + (i % 7) * 20, y + (i < 7 ? 0 : 18)));
      us.push(createUnit('france', 'officer', 880, y)); us.push(createUnit('france', 'drummer', 880, y + 10)); return createRegiment('france', us); };
    const a = make(1300), b = make(1500);
    selectWholeRegiment(a);
    const on = window.__REGIMENT_ORDERS_V1__.toggleDefend();
    const beforeBrace = window.__REGIMENT_ORDERS_V1__.isBraced(a);
    window.__RTS_DEBUG__.tick(7);
    const braced = window.__REGIMENT_ORDERS_V1__.isBraced(a);
    const ua = regimentMembers(a).find(u => u.type === 'infantry'), ub = regimentMembers(b).find(u => u.type === 'infantry');
    const ha = ua.hp, hb = ub.hp;
    applyDamage(ua, 20); applyDamage(ub, 20);
    return { on, beforeBrace, braced, lostA: ha - ua.hp, lostB: hb - ub.hp };
  });
  expect(r.on).toBe(true);
  expect(r.beforeBrace).toBe(false);
  expect(r.braced).toBe(true);
  expect(r.lostA).toBeLessThan(r.lostB * 0.8);
  expect(errors).toEqual([]);
});

test('iso view: regiments take more than 12 men, and loose men can reinforce one', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-big&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const us = []; for (let i = 0; i < 20; i++) us.push(createUnit('france', 'infantry', 900 + (i % 10) * 20, 1300 + Math.floor(i / 10) * 20));
    us.push(createUnit('france', 'officer', 880, 1300)); us.push(createUnit('france', 'drummer', 880, 1320));
    selectedUnits.clear(); us.forEach(u => selectedUnits.add(u)); makePlayerRegiment();
    const reg = getRegiment(us[0].regimentId), formed = regimentMembers(reg).filter(u => u.type === 'infantry').length;
    const extra = []; for (let i = 0; i < 8; i++) extra.push(createUnit('france', 'infantry', 900 + i * 20, 1400));
    selectWholeRegiment(reg); extra.forEach(u => selectedUnits.add(u));
    const added = window.__REGIMENT_ORDERS_V1__.reinforce();
    return { formed, added, now: regimentMembers(reg).filter(u => u.type === 'infantry').length };
  });
  expect(r.formed).toBe(20);
  expect(r.added).toBe(8);
  expect(r.now).toBe(28);
  expect(errors).toEqual([]);
});

test('iso view: a man by a barracks is picked before the barracks, a tree by its crown', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-pick&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().props >= 14 && window.__ISO_VIEW_V1__.stats().ground, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const bar = createBuilding('france', 'barracks', 1100, 1150, true);
    const man = createUnit('france', 'infantry', bar.x + 10, bar.y + bar.h / 2 + 4);
    camera.x = bar.x; camera.y = bar.y; camera.zoom = 1.1;
    const body = window.__ISO_VIEW_V1__.bodyOf(man), w = screenToWorld(body.x, body.y);
    selectPoint(w.x, w.y, false);
    const pickedMan = selectedUnits.has(man) && !selectedBuilding;
    const debug = { sel: [...selectedUnits].map(u => u.type + u.id), man: man.id, bld: selectedBuilding?.type || null, body, w, on: window.__ISO_VIEW_V1__.isOn() };
    // A tree: aim at its crown, well above where its trunk meets the ground.
    const tree = resources.find(q => q.type === 'wood' && q.amount > 0);
    camera.x = tree.x; camera.y = tree.y;
    const base = window.__ISO_VIEW_V1__.screenOf(tree.x, tree.y), crown = screenToWorld(base.x, base.y - 70 * camera.zoom);
    const hit = resourceAt(crown.x, crown.y);
    return { pickedMan, debug, tree: !!hit && hit.type === 'wood' && Math.hypot(hit.x - tree.x, hit.y - tree.y) < 160 };
  });
  expect(r.pickedMan, JSON.stringify(r.debug)).toBe(true);
  // The crown hits that tree (or one in front of it), not the ground behind.
  expect(r.tree).toBe(true);
  expect(errors).toEqual([]);
});

test('iso view: a defending line digs a trench, men in it lose less, and a regiment halting by an empty trench steps into it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-trench&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const O = window.__REGIMENT_ORDERS_V1__;
    const make = (x, y) => { const us = []; for (let i = 0; i < 14; i++) us.push(createUnit('france', 'infantry', x + (i % 7) * 20, y + (i < 7 ? 0 : 18)));
      us.push(createUnit('france', 'officer', x - 20, y)); us.push(createUnit('france', 'drummer', x - 20, y + 10)); return createRegiment('france', us); };
    const a = make(900, 1300);
    arrangeFacingRegimentV146(a, 960, 1300, 'line', Math.PI / 2);
    selectWholeRegiment(a); O.toggleDefend();
    for (let k = 0; k < 45; k++) window.__RTS_DEBUG__.tick(1);
    const t = O.trenches()[0];
    const man = regimentMembers(a).find(u => u.type === 'infantry' && O.trenchAt(u.x, u.y));
    const out = createUnit('france', 'infantry', 900, 1700);
    const h1 = man.hp, h2 = out.hp; applyDamage(man, 20); applyDamage(out, 20);
    // The first regiment marches off; a second, defending, halts beside the trench.
    orderGroupPathV06(a, 900, 1800, 'line', Math.PI / 2);
    for (let k = 0; k < 20; k++) window.__RTS_DEBUG__.tick(1);
    const b = make(t.x - 60, t.y + 70);
    selectWholeRegiment(b); O.toggleDefend();
    for (let k = 0; k < 12; k++) window.__RTS_DEBUG__.tick(1);
    const inB = regimentMembers(b).filter(u => u.type === 'infantry' && O.trenchAt(u.x, u.y)).length;
    // Men in a trench fire at will: an enemy stepping into reach is shot at within a moment,
    // not at the next army-wide volley beat.
    for (let k = 0; k < 3; k++) window.__RTS_DEBUG__.tick(1);
    const atWill0 = O.stats().atWill || 0;
    const intruder = createUnit('britain', 'infantry', t.x + Math.cos(t.facing) * 150, t.y + Math.sin(t.facing) * 150);
    intruder.targetX = intruder.x; intruder.targetY = intruder.y;
    for (let k = 0; k < 6; k++) window.__RTS_DEBUG__.tick(1 / 20);
    const firedAtWill = (O.stats().atWill || 0) - atWill0;
    intruder.dead = true;
    const drummerIn = regimentMembers(b).some(u => u.type === 'drummer' && O.trenchAt(u.x, u.y));
    const mannedB = b.trenchId === t.id, facingB = b.facing;
    // The second regiment marches off and comes back: it steps in again, without
    // the defensive stance switched on.
    b.defend = false;
    orderGroupPathV06(b, t.x + 40, t.y + 600, 'line', Math.PI / 2);
    for (let k = 0; k < 25; k++) window.__RTS_DEBUG__.tick(1);
    const left = b.trenchId !== t.id;
    orderGroupPathV06(b, t.x + 50, t.y + 60, 'line', 0);
    for (let k = 0; k < 30; k++) window.__RTS_DEBUG__.tick(1);
    const again = regimentMembers(b).filter(u => u.type === 'infantry' && O.trenchAt(u.x, u.y)).length;
    return { finished: t && t.progress >= 1, lostIn: h1 - man.hp, lostOut: h2 - out.hp, manned: mannedB, inB, drummerIn, firedAtWill, facing: facingB, tf: t.facing,
      left, again, mannedAgain: b.trenchId === t.id };
  });
  expect(r.finished).toBe(true);
  expect(r.lostIn).toBeLessThan(r.lostOut * 0.6);
  expect(r.manned).toBe(true);
  expect(r.inB).toBeGreaterThan(10);
  // The drummer goes down into the trench with them.
  expect(r.drummerIn).toBe(true);
  expect(r.firedAtWill).toBeGreaterThan(0);
  expect(r.facing).toBeCloseTo(r.tf, 2);
  expect(r.left).toBe(true);
  expect(r.mannedAgain).toBe(true);
  expect(r.again).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('iso view: men digging a trench are seen at work with the spade, then the front rank leans on the parapet', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-dig&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__ && window.__ISO_VIEW_V1__?.stats().digSprites, null, { timeout: 60_000 });
  const at = await page.evaluate(() => {
    const O = window.__REGIMENT_ORDERS_V1__, us = [];
    for (let i = 0; i < 14; i++) us.push(createUnit('france', 'infantry', 900 + (i % 7) * 20, 1300 + (i < 7 ? 0 : 18)));
    us.push(createUnit('france', 'officer', 880, 1300), createUnit('france', 'drummer', 880, 1310));
    const a = createRegiment('france', us);
    arrangeFacingRegimentV146(a, 960, 1300, 'line', Math.PI / 2);
    selectWholeRegiment(a); O.toggleDefend();
    // Halt, brace, then the spades go in: a few seconds into the digging.
    for (let k = 0; k < 40 && !O.trenches().length; k++) window.__RTS_DEBUG__.tick(1);
    for (let k = 0; k < 4; k++) window.__RTS_DEBUG__.tick(1);
    const t = O.trenches()[0];
    camera.x = t.x; camera.y = t.y; camera.zoom = 1.4;
    return { progress: t.progress, digging: regimentMembers(a).filter(u => O.diggingAt(u.x, u.y)).length };
  });
  expect(at.progress).toBeGreaterThan(0);
  expect(at.progress).toBeLessThan(1);
  expect(at.digging).toBeGreaterThan(10);
  // The officer and drummer keep watch; the musketeers dig.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().digging >= 12);
  // Finished: the front rank steps up to the parapet and leans on it, musket laid on the bank.
  await page.evaluate(() => { for (let k = 0; k < 40; k++) window.__RTS_DEBUG__.tick(1); });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().leaning >= 6 && window.__ISO_VIEW_V1__.stats().digging === 0);
  const st = await stats(page);
  expect(st.missingNames.filter(n => /^(dig|rest|rfire)/.test(n))).toEqual([]);
  expect(errors).toEqual([]);
});

test('iso view: peasants build a schiettoren that fires at enemies in reach and sees far', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-tower&view=iso');
  await page.waitForFunction(() => window.__WATCHTOWER_V1__ && window.__ISO_VIEW_V1__?.stats().props >= 16, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const ws = [];
    for (let i = 0; i < 3; i++) ws.push(createUnit('france', 'worker', 1100 + i * 12, 1400));
    selectedUnits.clear(); ws.forEach(u => selectedUnits.add(u));
    const button = document.querySelector('[data-action="build-tower"]');
    button.click();
    const mode = buildMode;
    placeBuilding('tower', 1100, 1320);
    const t = buildings.find(b => b.type === 'tower' && b.side === 'france');
    for (let k = 0; k < 90 && !t.complete; k++) window.__RTS_DEBUG__.tick(1);
    const foes = [], far = createUnit('britain', 'infantry', 1100, 1900);
    for (let i = 0; i < 4; i++) foes.push(createUnit('britain', 'infantry', 1260 + i * 14, 1330));
    const hp = list => list.reduce((s, u) => s + Math.max(0, u.hp), 0), before = hp(foes), farBefore = far.hp;
    for (let k = 0; k < 10; k++) window.__RTS_DEBUG__.tick(1);
    camera.x = t.x; camera.y = t.y; camera.zoom = 2;
    return { button: !!button, mode, done: t.complete, lost: before - hp(foes), farLost: farBefore - far.hp,
      sight: visionRadius(t), barracksSight: visionRadius({ kind: 'building', type: 'barracks', x: t.x, y: t.y }), stats: window.__WATCHTOWER_V1__.stats() };
  });
  expect(r.button).toBe(true);
  expect(r.mode).toBe('tower');
  expect(r.done).toBe(true);
  expect(r.lost).toBeGreaterThan(40);
  expect(r.farLost).toBe(0);
  expect(r.sight).toBeGreaterThan(r.barracksSight);
  expect(r.stats.volleys).toBeGreaterThan(2);
  // The Blender tower stands on the map, smoke at its slits when it fires.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().towerVolleys > 0 || (window.__RTS_DEBUG__.tick(1), false), null, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('iso view: a selected line or tower shows its firing reach, and men fire at an enemy inside it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-range&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__ && window.__WATCHTOWER_V1__ && window.__ISO_VIEW_V1__?.stats().props >= 16, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const us = [];
    for (let i = 0; i < 12; i++) us.push(createUnit('france', 'infantry', 900 + (i % 6) * 20, 1300 + (i < 6 ? 0 : 18)));
    us.push(createUnit('france', 'officer', 880, 1300), createUnit('france', 'drummer', 880, 1310));
    const a = createRegiment('france', us);
    arrangeFacingRegimentV146(a, 960, 1300, 'line', 0);
    for (let k = 0; k < 8; k++) window.__RTS_DEBUG__.tick(1);
    // A horseman standing well past the old 122 px reach, inside the new one.
    const c = createUnit('britain', 'cavalry', 960 + 185, 1300);
    c.targetX = c.x; c.targetY = c.y;
    const hp0 = c.hp;
    for (let k = 0; k < 6; k++) window.__RTS_DEBUG__.tick(1);
    selectWholeRegiment(a);
    camera.x = 1000; camera.y = 1350; camera.zoom = 1.3;
    window.__rangeTower = createBuilding('france', 'tower', 900, 1560, true);
    return { range: TYPES.infantry.range, lost: hp0 - c.hp };
  });
  expect(r.range).toBe(200);
  expect(r.lost).toBeGreaterThan(40);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().rangeRings >= 12);
  await page.evaluate(() => { selectedUnits.clear(); selectedBuilding = window.__rangeTower; });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().rangeRings === 1);
  expect(errors).toEqual([]);
});

test('iso view on a phone: a two-finger pinch zooms and stays, the spot between the fingers stays put, and a tap selects afterwards', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = await openGame(page, 'test=iso-pinch&view=iso');
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().ground, null, { timeout: 60_000 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const cx = 195, cy = 420;
  const before = await page.evaluate(([x, y]) => ({ zoom: camera.zoom, w: screenToWorld(x, y) }), [cx, cy]);
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[cx - 30 - i * 6, cy], [cx + 30 + i * 6, cy]]); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx + 66, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  const after = await page.evaluate(([x, y]) => ({ zoom: camera.zoom, w: screenToWorld(x, y), held: window.__PLAYABILITY_CONTROLS_V1__.mobile.state().activePointers }), [cx, cy]);
  expect(after.zoom).toBeGreaterThan(before.zoom * 1.3);
  expect(Math.hypot(after.w.x - before.w.x, after.w.y - before.w.y)).toBeLessThan(40);
  expect(after.held).toBe(0);
  // A tap on a man still selects him.
  const s = await page.evaluate(() => { const w = screenToWorld(innerWidth / 2, innerHeight / 2 - 60); const u = createUnit('france', 'infantry', w.x, w.y); selectedUnits.clear(); return window.__ISO_VIEW_V1__.bodyOf(u); });
  await page.waitForTimeout(300);
  await touch('touchStart', [[s.x, s.y]]); await page.waitForTimeout(50); await touch('touchEnd', []);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => selectedUnits.size)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await ctx.close();
});
