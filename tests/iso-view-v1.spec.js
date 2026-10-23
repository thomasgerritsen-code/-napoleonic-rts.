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
    const officerIn = regimentMembers(b).some(u => u.type === 'officer' && O.trenchAt(u.x, u.y));
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
    return { finished: t && t.progress >= 1, lostIn: h1 - man.hp, lostOut: h2 - out.hp, manned: mannedB, inB, drummerIn, officerIn, firedAtWill, facing: facingB, tf: t.facing,
      left, again, mannedAgain: b.trenchId === t.id };
  });
  expect(r.finished).toBe(true);
  expect(r.lostIn).toBeLessThan(r.lostOut * 0.6);
  expect(r.manned).toBe(true);
  expect(r.inB).toBeGreaterThan(10);
  // The drummer goes down into the trench with them.
  expect(r.drummerIn).toBe(true);
  expect(r.officerIn).toBe(true);
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

test('iso view: a trench covers only against fire from its front, horses cross it at a walk, and its walls are revetted', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-cover&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__ && window.__ISO_VIEW_V1__?.stats().props >= 19, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const O = window.__REGIMENT_ORDERS_V1__, us = [];
    for (let i = 0; i < 14; i++) us.push(createUnit('france', 'infantry', 900 + (i % 7) * 20, 1300 + (i < 7 ? 0 : 18)));
    us.push(createUnit('france', 'officer', 880, 1300), createUnit('france', 'drummer', 880, 1310));
    const a = createRegiment('france', us);
    arrangeFacingRegimentV146(a, 960, 1300, 'line', Math.PI / 2);
    O.toggleDefend([a]);
    for (let k = 0; k < 45; k++) window.__RTS_DEBUG__.tick(1);
    const t = O.trenches()[0];
    const man = regimentMembers(a).find(u => u.type === 'infantry' && O.trenchAt(u.x, u.y));
    const hit = ang => {
      const s = createUnit('britain', 'infantry', man.x + Math.cos(ang) * 150, man.y + Math.sin(ang) * 150), h = man.hp;
      fire(s, man); for (let k = 0; k < 40; k++) updateProjectiles(0.02);
      s.dead = true; const lost = h - man.hp; man.hp = 100; return lost;
    };
    let front = 0, flank = 0;
    for (let i = 0; i < 10; i++) { front += hit(t.facing); flank += hit(t.facing + Math.PI / 2); }
    camera.x = t.x; camera.y = t.y; camera.zoom = 1.6;
    // The regiment leaves; a horseman rides across the empty trench.
    orderGroupPathV06(a, 900, 1900, 'line', Math.PI / 2);
    for (let k = 0; k < 25; k++) window.__RTS_DEBUG__.tick(1);
    const c = createUnit('britain', 'cavalry', t.x + Math.cos(t.facing) * 140, t.y + Math.sin(t.facing) * 140);
    c.targetX = t.x - Math.cos(t.facing) * 120; c.targetY = t.y - Math.sin(t.facing) * 120; c.chargeTimer = 3;
    let open = 0, ditch = 0;
    for (let k = 0; k < 16; k++) {
      const x = c.x, y = c.y; window.__RTS_DEBUG__.tick(0.25);
      const v = Math.hypot(c.x - x, c.y - y) / 0.25;
      if (O.obstacleAt(c.x, c.y)) ditch = Math.max(ditch, v); else if (!open) open = v;
    }
    // Revetted and fortified for resources (levels 2 and 3) so the field-work kit shows.
    a.trenchId = t.id; economies.france.wood = 2000; economies.france.iron = 500;
    t.level = 3;
    return { front, flank, open, ditch, charge: c.chargeTimer };
  });
  expect(r.front).toBeLessThan(r.flank * 0.85);
  expect(r.open).toBeGreaterThan(60);
  expect(r.ditch).toBeLessThan(r.open * 0.5);
  expect(r.charge).toBe(0);
  // Fascines line the walls, gabions stand along the parapet.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().fascines > 0 && window.__ISO_VIEW_V1__.stats().gabions > 0);
  expect(errors).toEqual([]);
});

test('iso view: a trench can be upgraded for resources - the men revet it, then fortify it, and it covers better', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-upgrade&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__ && window.__ISO_VIEW_V1__?.stats().props >= 19, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const O = window.__REGIMENT_ORDERS_V1__, us = [];
    for (let i = 0; i < 14; i++) us.push(createUnit('france', 'infantry', 900 + (i % 7) * 20, 1300 + (i < 7 ? 0 : 18)));
    us.push(createUnit('france', 'officer', 880, 1300), createUnit('france', 'drummer', 880, 1310));
    const a = createRegiment('france', us);
    arrangeFacingRegimentV146(a, 960, 1300, 'line', Math.PI / 2);
    selectWholeRegiment(a); O.toggleDefend();
    for (let k = 0; k < 45; k++) window.__RTS_DEBUG__.tick(1);
    const t = O.trenches()[0];
    const man = regimentMembers(a).find(u => u.type === 'infantry' && O.trenchAt(u.x, u.y));
    const loss = () => { let sum = 0; for (let i = 0; i < 10; i++) { const s = createUnit('britain', 'infantry', man.x + Math.cos(t.facing) * 150, man.y + Math.sin(t.facing) * 150), h = man.hp; fire(s, man); for (let k = 0; k < 40; k++) updateProjectiles(0.02); s.dead = true; sum += h - man.hp; man.hp = 100; } return sum; };
    economies.france.wood = 1000; economies.france.iron = 200;
    actionSignature = ''; updateHud(true);
    const button = document.querySelector('[data-action="trench-upgrade"]');
    const label1 = button?.textContent;
    const l1 = loss();
    button.click();
    const wood = economies.france.wood;
    for (let k = 0; k < 4; k++) window.__RTS_DEBUG__.tick(1);
    const digging = regimentMembers(a).filter(u => O.diggingAt?.(u.x, u.y)).length;
    for (let k = 0; k < 10; k++) window.__RTS_DEBUG__.tick(1);
    const level2 = t.level, l2 = loss();
    O.upgradeTrench(a);
    for (let k = 0; k < 16; k++) window.__RTS_DEBUG__.tick(1);
    camera.x = t.x; camera.y = t.y; camera.zoom = 1.6;
    return { label1, paid: 1000 - wood, digging, level2, level3: t.level, l1, l2, l3: loss(), maxed: O.upgradeTrench(a) };
  });
  expect(r.label1).toContain('Bekleed');
  expect(r.paid).toBe(120);
  expect(r.digging).toBeGreaterThan(5);
  expect(r.level2).toBe(2);
  expect(r.level3).toBe(3);
  expect(r.l2).toBeLessThan(r.l1);
  expect(r.l3).toBeLessThan(r.l2);
  expect(r.maxed).toBe(false);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().fascines > 0 && window.__ISO_VIEW_V1__.stats().gabions > 0);
  expect(errors).toEqual([]);
});

test('iso view: the bottom menu shows only what fits the selection, in labelled groups', async ({ page }) => {
  const errors = await openGame(page, 'test=iso-menu&view=iso');
  await page.waitForFunction(() => window.__ACTION_MENU_V1__ && window.__REGIMENT_ORDERS_V1__, null, { timeout: 60_000 });
  const look = fn => page.evaluate(fn).then(() => page.waitForTimeout(150)).then(() => page.evaluate(() => ({ v: window.__ACTION_MENU_V1__.visible(), l: window.__ACTION_MENU_V1__.labels() })));
  const none = await look(() => { selectedUnits.clear(); selectedBuilding = null; actionSignature = ''; updateHud(true); });
  expect(none.v).toEqual([]);
  const workers = await look(() => { selectedUnits.clear(); units.filter(u => u.side === 'france' && u.type === 'worker').slice(0, 2).forEach(u => selectedUnits.add(u)); actionSignature = ''; updateHud(true); });
  expect(workers.l).toEqual(['werk', 'bouwen']);
  expect(workers.v).toContain('build-tower');
  expect(workers.v.some(a => a.startsWith('formation:'))).toBe(false);
  const army = await look(() => {
    const us = []; for (let i = 0; i < 12; i++) us.push(createUnit('france', 'infantry', 900 + i * 20, 1300));
    us.push(createUnit('france', 'officer', 880, 1300), createUnit('france', 'drummer', 880, 1310));
    const a = createRegiment('france', us); selectedUnits.clear(); selectWholeRegiment(a); actionSignature = ''; updateHud(true);
  });
  expect(army.l.slice(0, 2)).toEqual(['bevel', 'formatie']);
  expect(army.v).toContain('defend-stance');
  expect(army.v).toContain('formation:line');
  expect(army.v.some(a => a.startsWith('build-'))).toBe(false);
  const tc = await look(() => { selectedUnits.clear(); selectedBuilding = buildings.find(b => b.side === 'france' && b.type === 'towncenter'); actionSignature = ''; updateHud(true); });
  expect(tc.l).toEqual(['productie']);
  expect(tc.v).toContain('train-worker');
  expect(errors).toEqual([]);
});

test('iso view: flank and rear blows hurt more, tirailleurs spread out, round shot knocks down a trench, morale shows', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-depth&view=iso');
  await page.waitForFunction(() => window.__BATTLE_DEPTH_V1__ && window.__REGIMENT_ORDERS_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const D = window.__BATTLE_DEPTH_V1__, O = window.__REGIMENT_ORDERS_V1__;
    const mk = (x, y) => { const us = []; for (let i = 0; i < 12; i++) us.push(createUnit('france', 'infantry', x + (i % 6) * 20, y + (i < 6 ? 0 : 18))); us.push(createUnit('france', 'officer', x - 20, y), createUnit('france', 'drummer', x - 20, y + 10)); return createRegiment('france', us); };
    const a = mk(900, 1300); arrangeFacingRegimentV146(a, 960, 1300, 'line', 0);
    for (let k = 0; k < 6; k++) window.__RTS_DEBUG__.tick(1);
    const man = regimentMembers(a).find(u => u.type === 'infantry');
    const hit = ang => { const s = createUnit('britain', 'infantry', man.x + Math.cos(ang) * 150, man.y + Math.sin(ang) * 150), h = man.hp; fire(s, man); for (let k = 0; k < 40; k++) updateProjectiles(0.02); s.dead = true; const d = h - man.hp; man.hp = 100; man.morale = 100; return d; };
    const sum = ang => { let d = 0; for (let i = 0; i < 12; i++) d += hit(ang); return d; };
    const front = sum(0), flank = sum(Math.PI / 2), rear = sum(Math.PI);
    const spanOf = () => { const m = regimentMembers(a).filter(u => u.type === 'infantry'); return Math.max(...m.map(u => u.targetX)) - Math.min(...m.map(u => u.targetX)) + Math.max(...m.map(u => u.targetY)) - Math.min(...m.map(u => u.targetY)); };
    const closed = spanOf();
    selectWholeRegiment(a); actionSignature = ''; updateHud(true);
    document.querySelector('[data-action="skirmish"]').click();
    const open = spanOf(), skirmish = a.skirmish;
    for (let k = 0; k < 8; k++) window.__RTS_DEBUG__.tick(1);
    const skFront = sum(0);
    const charge = () => { const s = createUnit('britain', 'cavalry', man.x + 10, man.y), h = man.hp; fire(s, man); s.dead = true; const d = h - man.hp; man.hp = 100; return d; };
    const horseOpen = charge(); D.toggleSkirmish([a]); const horseClosed = charge();
    // Round shot falling on a revetted trench.
    const b = mk(1500, 1300); arrangeFacingRegimentV146(b, 1560, 1300, 'line', Math.PI / 2); O.toggleDefend([b]);
    for (let k = 0; k < 45; k++) window.__RTS_DEBUG__.tick(1);
    const t = O.trenches()[0]; t.level = 2;
    const target = regimentMembers(b).find(u => O.trenchAt(u.x, u.y));
    for (let i = 0; i < 10; i++) { projectiles.push({ x: t.x, y: t.y + 260, target, side: 'britain', damage: 1, speed: 280, artillery: true, dead: false }); for (let k = 0; k < 80; k++) updateProjectiles(0.02); }
    const level = t.level, integrity = t.integrity;
    for (let k = 0; k < 30; k++) window.__RTS_DEBUG__.tick(1);
    regimentMembers(a).forEach(u => u.morale = 35);
    camera.x = 1000; camera.y = 1320; camera.zoom = 1.3; selectedUnits.clear();
    return { front, flank, rear, closed, open, skirmish, skFront, horseOpen, horseClosed, level, integrity, repaired: t.integrity, craters: D.craters().length, morale: D.regimentMorale(a) };
  });
  expect(r.flank).toBeGreaterThan(r.front * 1.1);
  expect(r.rear).toBeGreaterThan(r.flank);
  expect(r.skirmish).toBe(true);
  expect(r.open).toBeGreaterThan(r.closed * 1.6);
  expect(r.skFront).toBeLessThan(r.front * 0.85);
  expect(r.horseOpen).toBeGreaterThan(r.horseClosed * 1.3);
  expect(r.level).toBe(1);
  expect(r.repaired).toBeGreaterThan(r.integrity);
  expect(r.craters).toBe(10);
  expect(r.morale.wavering).toBe(true);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().moraleBars > 0);
  expect(errors).toEqual([]);
});

test('iso view: the weather changes - rain soaks the ground, powder misfires, mud slows, fog shortens sight, wet ground keeps tracks', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page, 'test=iso-weather&view=iso');
  await page.waitForFunction(() => window.__WEATHER_V1__ && window.__ISO_VIEW_V1__?.stats().ground, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const W = window.__WEATHER_V1__, probe = { kind: 'unit', type: 'infantry', side: 'france', x: 1000, y: 1300 };
    W.set('clear', 999); for (let k = 0; k < 30; k++) window.__RTS_DEBUG__.tick(1);
    const clearSight = visionRadius(probe);
    const walk = () => { const u = createUnit('france', 'infantry', 1000, 1500); u.targetX = 1400; u.targetY = 1500; const x = u.x; for (let k = 0; k < 20; k++) moveToward(u, 1400, 1500, 0.1); u.dead = true; return u.x - x; };
    const dry = walk();
    W.set('rain', 999); for (let k = 0; k < 90; k++) window.__RTS_DEBUG__.tick(1);
    const s = W.state(), muddy = walk();
    const shooter = createUnit('france', 'infantry', 1000, 1300), foe = createUnit('britain', 'infantry', 1100, 1300);
    const m0 = W.stats().misfires; for (let i = 0; i < 60; i++) fire(shooter, foe); const misfires = W.stats().misfires - m0;
    shooter.dead = foe.dead = true;
    W.set('fog', 999); for (let k = 0; k < 30; k++) window.__RTS_DEBUG__.tick(1);
    const us = []; for (let i = 0; i < 6; i++) us.push(createUnit('france', 'infantry', 900 + i * 20, 1300));
    for (const u of us) { u.targetX = u.x + 400; u.targetY = u.y; }
    camera.x = 1100; camera.y = 1300; camera.zoom = 1.4;
    return { wet: s.wetness, raining: s.rain, dry, muddy, misfires, clearSight, fogSight: visionRadius(probe), label: document.getElementById('weather-indicator')?.textContent };
  });
  expect(r.raining).toBeGreaterThan(0.9);
  expect(r.wet).toBeGreaterThan(0.9);
  expect(r.muddy).toBeLessThan(r.dry * 0.9);
  expect(r.misfires).toBeGreaterThan(5);
  expect(r.fogSight).toBeLessThan(r.clearSight * 0.7);
  expect(r.label).toContain('Mist');
  // The ground is still wet after the rain: men crossing it leave tracks.
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().tracks > 10 || (window.__RTS_DEBUG__.tick(0.1), false), null, { timeout: 30_000, polling: 100 });
  expect(errors).toEqual([]);
});

test('iso view: one button forms a regiment from a few chosen men, and a barracks trains what is missing and forms it by itself', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-quick&view=iso');
  await page.waitForFunction(() => window.__QUICK_REGIMENT_V1__ && window.__ACTION_MENU_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const out = {};
    const sel = []; for (let i = 0; i < 3; i++) sel.push(createUnit('france', 'infantry', 1000 + i * 20, 1300));
    for (let i = 0; i < 12; i++) createUnit('france', 'infantry', 1100 + (i % 6) * 20, 1360 + Math.floor(i / 6) * 20);
    createUnit('france', 'officer', 1150, 1400); createUnit('france', 'drummer', 1170, 1400);
    selectedUnits.clear(); sel.forEach(u => selectedUnits.add(u)); actionSignature = ''; updateHud(true);
    out.oldButton = !!document.querySelector('[data-action="create-regiment"]');
    document.querySelector('[data-action="quick-regiment"]').click();
    const reg = regiments.filter(q => q.side === 'france' && !q.destroyed).pop();
    out.formed = reg && regimentMembers(reg).filter(u => u.type === 'infantry').length;
    out.kept = sel.every(u => u.regimentId === reg.id);
    // A barracks with nobody free around it: train what is missing, then it forms by itself.
    units.filter(u => u.side === 'france' && !u.regimentId && ['infantry', 'officer', 'drummer'].includes(u.type)).forEach(u => { u.dead = true; });
    const bk = buildings.find(q => q.side === 'france' && q.type === 'barracks' && q.complete) || createBuilding('france', 'barracks', 900, 1100, true);
    selectedUnits.clear(); selectedBuilding = bk; actionSignature = ''; updateHud(true);
    out.disabled = document.querySelector('[data-action="quick-regiment-barracks"]').disabled;
    economies.france.food = 5000; economies.france.wood = 5000; economies.france.popCap = 300;
    document.querySelector('[data-action="train-missing"]').click();
    out.queued = bk.queue.length;
    const n0 = regiments.filter(q => q.side === 'france' && !q.destroyed).length;
    for (let k = 0; k < 150; k++) window.__RTS_DEBUG__.tick(1);
    out.auto = regiments.filter(q => q.side === 'france' && !q.destroyed).length - n0;
    return out;
  });
  expect(r.oldButton).toBe(false);
  expect(r.formed).toBe(12);
  expect(r.kept).toBe(true);
  expect(r.disabled).toBe(true);
  expect(r.queued).toBe(14);
  expect(r.auto).toBe(1);
  expect(errors).toEqual([]);
});

test('iso view: troop kinds - grenadiers, voltigeurs, kurassiers and huzaren are trained with a strength and a weakness', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-troops&view=iso');
  await page.waitForFunction(() => window.__TROOPS_V1__ && window.__ACTION_MENU_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const X = window.__TROOPS_V1__, out = {};
    economies.france.food = 9000; economies.france.wood = 9000; economies.france.iron = 900; economies.france.popCap = 400;
    const bk = buildings.find(q => q.side === 'france' && q.type === 'barracks' && q.complete) || createBuilding('france', 'barracks', 900, 1100, true);
    const st = buildings.find(q => q.side === 'france' && q.type === 'stable' && q.complete) || createBuilding('france', 'stable', 1100, 1100, true);
    selectedUnits.clear(); selectedBuilding = bk; actionSignature = ''; updateHud(true);
    document.querySelector('[data-action="train-grenadier"]').click(); document.querySelector('[data-action="train-voltigeur"]').click();
    selectedBuilding = st; actionSignature = ''; updateHud(true);
    document.querySelector('[data-action="train-cuirassier"]').click(); document.querySelector('[data-action="train-hussar"]').click();
    for (let k = 0; k < 40; k++) window.__RTS_DEBUG__.tick(1);
    out.made = X.stats().french;
    out.grenadierHp = units.find(u => u.troop === 'grenadier')?.maxHp;
    out.voltigeurHp = units.find(u => u.troop === 'voltigeur')?.maxHp;
    const mk = (type, troop, x, y = 1500) => { const u = createUnit('france', type, x, y); if (troop) X.applyTroop(u, troop); return u; };
    const foe = createUnit('britain', 'infantry', 1300, 1500);
    const bayonet = troop => { let tot = 0; for (let i = 0; i < 12; i++) { const u = mk('infantry', troop, 1290), h = foe.hp; u.attackMode = 'bayonet'; fire(u, foe); for (let k = 0; k < 40; k++) updateProjectiles(0.02); u.dead = true; tot += h - foe.hp; foe.hp = 100; } return tot; };
    out.bayonet = [bayonet(null), bayonet('grenadier'), bayonet('voltigeur')];
    // Clear weather (no misfires) and damage per hit, so chance does not decide it.
    window.__WEATHER_V1__?.set('clear', true); window.__WEATHER_V1__?.setWetness?.(0);
    const balls = troop => { const c = mk('cavalry', troop, 1300, 1600); let sum = 0, hits = 0; for (let i = 0; i < 30; i++) { const s = createUnit('britain', 'infantry', 1450, 1600), h = c.hp; fire(s, c); for (let k = 0; k < 40; k++) updateProjectiles(0.02); s.dead = true; if (c.hp < h) { sum += h - c.hp; hits++; } c.hp = c.maxHp; } c.dead = true; return hits ? sum / hits : 0; };
    out.balls = [balls(null), balls('cuirassier')];
    const pace = (type, troop) => { const u = mk(type, troop, 1000); const x = u.x; for (let k = 0; k < 10; k++) moveToward(u, 3000, 1500, 0.1); u.dead = true; return u.x - x; };
    out.pace = { line: pace('infantry', null), grenadier: pace('infantry', 'grenadier'), voltigeur: pace('infantry', 'voltigeur'), horse: pace('cavalry', null), hussar: pace('cavalry', 'hussar'), cuirassier: pace('cavalry', 'cuirassier') };
    out.sight = [visionRadius(mk('cavalry', null, 1000)), visionRadius(mk('cavalry', 'hussar', 1000))];
    // A regiment mostly of grenadiers is named for them.
    const gs = []; for (let i = 0; i < 12; i++) gs.push(mk('infantry', 'grenadier', 1600 + i * 18, 1300));
    gs.push(createUnit('france', 'officer', 1580, 1300), createUnit('france', 'drummer', 1580, 1310));
    out.name = createRegiment('france', gs)?.name;
    return out;
  });
  expect(r.made).toMatchObject({ grenadier: 1, voltigeur: 1, cuirassier: 1, hussar: 1 });
  expect(r.grenadierHp).toBeGreaterThan(r.voltigeurHp);
  expect(r.bayonet[1]).toBeGreaterThan(r.bayonet[0]);
  expect(r.bayonet[2]).toBeLessThan(r.bayonet[0]);
  expect(r.balls[1]).toBeLessThan(r.balls[0] * 0.8);
  expect(r.pace.grenadier).toBeLessThan(r.pace.line);
  expect(r.pace.voltigeur).toBeGreaterThan(r.pace.line);
  expect(r.pace.hussar).toBeGreaterThan(r.pace.horse);
  expect(r.pace.cuirassier).toBeLessThan(r.pace.horse);
  expect(r.sight[1]).toBeGreaterThan(r.sight[0] * 1.3);
  expect(r.name).toContain('Grenadiers');
  expect(errors).toEqual([]);
});

test('iso view: period troops - Old Guard, sapeurs, Polish lancers; 95th Rifles and Scots Greys for Britain', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-period&view=iso');
  await page.waitForFunction(() => window.__TROOPS_V1__ && window.__ACTION_MENU_V1__, null, { timeout: 60_000 });
  // The new looks and riders stream in after the base sheets.
  if (!process.env.NO_ATLAS) await page.waitForFunction(() => ['fr6', 'fr7', 'br6', 'frck', 'frcl', 'brcg', 'fr6:dig'].every(k => window.__ISO_VIEW_V1__?.atlasKeys?.().includes(k)), null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const X = window.__TROOPS_V1__, out = {};
    economies.france.food = 20000; economies.france.wood = 20000; economies.france.iron = 5000; economies.france.popCap = 400;
    const bk = buildings.find(q => q.side === 'france' && q.type === 'barracks' && q.complete) || createBuilding('france', 'barracks', 900, 1100, true);
    const st = buildings.find(q => q.side === 'france' && q.type === 'stable' && q.complete) || createBuilding('france', 'stable', 1100, 1100, true);
    selectedUnits.clear(); selectedBuilding = bk; actionSignature = ''; updateHud(true);
    out.barracks = [...document.querySelectorAll('[data-action^="train-"]')].map(b => b.dataset.action);
    selectedBuilding = st; actionSignature = ''; updateHud(true);
    out.stable = [...document.querySelectorAll('[data-action^="train-"]')].map(b => b.dataset.action);
    // The Old Guard is capped.
    for (let i = 0; i < 24; i++) X.applyTroop(createUnit('france', 'infantry', 600 + i * 10, 900), 'guard');
    economies.france.popCap = 400;   // the HUD recounts houses
    out.guardOverCap = X.trainTroop('guard', bk);
    out.sapperOk = X.trainTroop('sapper', bk);
    // Sappers speed up their regiment's spade work.
    const mk = (side, type, troop, x, y) => { const u = createUnit(side, type, x, y); if (troop) X.applyTroop(u, troop); return u; };
    const line = []; for (let i = 0; i < 12; i++) line.push(mk('france', 'infantry', 'sapper', 1600 + i * 18, 1300));
    line.push(createUnit('france', 'officer', 1580, 1300), createUnit('france', 'drummer', 1580, 1310));
    out.work = X.workFactor(createRegiment('france', line));
    // The lance: against foot out of square, and against horse.
    const hit = (troop, victimType) => {
      let sum = 0;
      for (let i = 0; i < 8; i++) {
        const v = createUnit('britain', victimType, 2400, 1800 + i * 60);
        const a = mk('france', 'cavalry', troop, 2390, 1800 + i * 60), h = v.hp;
        fire(a, v); for (let k = 0; k < 40; k++) updateProjectiles(0.02);
        sum += h - v.hp; a.dead = true; v.dead = true;
      }
      return sum;
    };
    out.lance = { line: [hit(null, 'infantry'), hit('lancer', 'infantry')], horse: [hit(null, 'cavalry'), hit('lancer', 'cavalry')] };
    out.lanceHits = X.stats().lance;
    out.names = { light: X.nameOf('voltigeur', 'britain'), hussar: X.nameOf('hussar', 'britain'), rifle: X.nameOf('rifle', 'britain') };
    // The rifle shoots farther than the line (the enemy index refreshes on a tick).
    const rifle = mk('britain', 'infantry', 'rifle', 1700, 1700), plain = mk('britain', 'infantry', null, 1700, 2200);
    out.rifleHp = [rifle.maxHp, plain.maxHp];
    const marks = [rifle, plain].map(u => createUnit('france', 'infantry', u.x - TYPES.infantry.range * 1.4, u.y));
    window.__RTS_DEBUG__.tick(0.02);
    // The shooter steps to 1.4x the line's range of its (now indexed) mark.
    out.rifleReach = [rifle, plain].map((u, i) => { u.x = marks[i].x + TYPES.infantry.range * 1.4; u.y = marks[i].y; u.reload = 0; u.attackMode = 'fire'; updateUnit(u, 0.01); return u.reload > 0.5; });
    marks.forEach(m => { m.dead = true; });
    // Looks: Old Guard, sappers and riflemen in their own uniforms; the new riders.
    const V = window.__ISO_VIEW_V1__;
    out.looks = V.lookOf ? [V.lookOf(mk('france', 'infantry', 'guard', 500, 500)), V.lookOf(mk('france', 'infantry', 'sapper', 500, 520)), V.lookOf(rifle)] : null;
    return out;
  });
  expect(r.barracks).toEqual(expect.arrayContaining(['train-guard', 'train-sapper', 'train-grenadier', 'train-voltigeur']));
  expect(r.barracks).not.toContain('train-rifle');
  expect(r.stable).toEqual(expect.arrayContaining(['train-lancer', 'train-cuirassier', 'train-hussar']));
  expect(r.stable).not.toContain('train-greys');
  expect(r.guardOverCap).toBe(false);
  expect(r.sapperOk).toBe(true);
  expect(r.work).toBeCloseTo(3, 1);   // a regiment of sapeurs
  expect(r.lance.line[1]).toBeGreaterThan(r.lance.line[0] * 1.4);
  expect(r.lance.horse[1]).toBeLessThan(r.lance.horse[0] * 1.1);
  expect(r.lanceHits).toBeGreaterThan(0);
  expect(r.names).toEqual({ light: ['Light Company', 'Light Companies'], hussar: ['Light Dragoon', 'Light Dragoons'], rifle: ['95th Rifleman', '95th Rifles'] });
  expect(r.rifleHp[0]).toBeLessThan(r.rifleHp[1]);
  expect(r.rifleReach).toEqual([true, false]);
  if (r.looks) expect(r.looks).toEqual(['fr6', 'fr7', 'br6']);
  expect(errors).toEqual([]);
});

test('iso view: a click on a trench with a regiment selected sends it there to man it', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-trench-order&view=iso');
  await page.waitForFunction(() => window.__REGIMENT_ORDERS_V1__ && window.__RTS_DEBUG__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const O = window.__REGIMENT_ORDERS_V1__, out = {};
    const t = { id: 9001, side: 'france', x: 1500, y: 1400, facing: 0, length: 220, width: 70, progress: 1, startedAt: 0, level: 1 };
    O.trenches().push(t);
    const mk = (n, x, y) => { const m = []; for (let i = 0; i < n; i++) m.push(createUnit('france', 'infantry', x + (i % 6) * 18, y + Math.floor(i / 6) * 18)); m.push(createUnit('france', 'officer', x - 20, y), createUnit('france', 'drummer', x - 20, y + 14)); return createRegiment('france', m); };
    const a = mk(12, 1150, 1650), b = mk(12, 1150, 1800);
    selectedUnits.clear(); for (const u of regimentMembers(a)) selectedUnits.add(u); for (const u of regimentMembers(b)) selectedUnits.add(u);
    out.under = O.trenchUnder(t.x + 30, t.y + 10)?.id;
    issueMove(t.x + 30, t.y + 10);
    out.status = statusEl.textContent;
    for (let k = 0; k < 90 && a.trenchId !== t.id; k++) window.__RTS_DEBUG__.tick(1);
    for (let k = 0; k < 30; k++) window.__RTS_DEBUG__.tick(1);
    out.manned = a.trenchId === t.id;
    const inf = regimentMembers(a).filter(u => u.type === 'infantry');
    out.inside = inf.filter(u => O.trenchAt(u.x, u.y) === t).length; out.men = inf.length;
    out.defend = a.defend;
    // The second regiment forms up behind, not in the trench.
    out.behind = regimentMembers(b).filter(u => u.type === 'infantry' && u.x < t.x - t.width / 2).length;
    out.bInTrench = b.trenchId === t.id;
    // An ordinary move order lets the regiment go again.
    selectedUnits.clear(); for (const u of regimentMembers(a)) selectedUnits.add(u);
    issueMove(t.x - 400, t.y + 300);
    for (let k = 0; k < 30; k++) window.__RTS_DEBUG__.tick(1);
    out.left = a.trenchId !== t.id;
    return out;
  });
  expect(r.under).toBe(9001);
  expect(r.status).toContain('bezet de loopgraaf');
  expect(r.manned).toBe(true);
  expect(r.inside).toBeGreaterThanOrEqual(r.men - 1);
  expect(r.defend).toBe(true);
  expect(r.bInTrench).toBe(false);
  expect(r.behind).toBeGreaterThan(8);
  expect(r.left).toBe(true);
  expect(errors).toEqual([]);
});

test('iso view: gun crews - a cannon is crewed by button, by a click on it, and from a regiment', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-gun-crew&view=iso');
  await page.waitForFunction(() => window.__GUN_CREW_V1__ && window.__ACTION_MENU_V1__ && window.__RTS_DEBUG__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const G = window.__GUN_CREW_V1__, out = {};
    // Manned: a battery with two living crew (it can fire once they reach the gun).
    const crewed = gun => !!gun.regimentId && artilleryCrewV06(getRegiment(gun.regimentId)).filter(u => !u.dead).length >= 2;
    // 1. Only the cannon selected, loose men nearby: the button fetches two.
    const g1 = createUnit('france', 'artillery', 2450, 1750);   // dry ground (men do not wade the river)
    const loose = [createUnit('france', 'infantry', 2510, 1750), createUnit('france', 'infantry', 2510, 1770)];
    selectedUnits.clear(); selectedBuilding = null; selectedUnits.add(g1); actionSignature = ''; updateHud(true);
    const btn = actionsEl.querySelector('[data-action="crew-gun"]');
    out.button = !!btn && !btn.disabled && !btn.classList.contains('menu-hidden');
    out.oldButton = !!actionsEl.querySelector('[data-action="create-battery"]');
    btn?.click();
    out.g1 = crewed(g1); out.looseUsed = loose.every(u => u.regimentId === g1.regimentId);
    // 2. A regiment selected, a click on an uncrewed cannon: two of its men go.
    const g2 = createUnit('france', 'artillery', 2100, 1500);
    const m = []; for (let i = 0; i < 12; i++) m.push(createUnit('france', 'infantry', 1900 + (i % 6) * 18, 1600 + Math.floor(i / 6) * 18));
    m.push(createUnit('france', 'officer', 1880, 1600), createUnit('france', 'drummer', 1880, 1614));
    const reg = createRegiment('france', m);
    selectedUnits.clear(); for (const u of regimentMembers(reg)) selectedUnits.add(u);
    issueMove(g2.x + 4, g2.y + 3);
    out.g2 = crewed(g2); out.regLeft = regimentMembers(reg).filter(u => u.type === 'infantry').length;
    out.status = statusEl.textContent;
    // 3. A battery that lost a man is refilled from the nearest regiment by the button.
    const b2 = getRegiment(g2.regimentId), dead = artilleryCrewV06(b2)[0]; dead.dead = true;
    out.short = crewed(g2);
    selectedUnits.clear(); selectedUnits.add(g2);
    out.refill = G.crewSelected(); out.refilled = crewed(g2);
    // A regiment never gives up more than it can spare.
    const more = [0, 1, 2, 3].map(i => G.crewGun(createUnit('france', 'artillery', 1950 + i * 40, 1450)));
    out.more = more; out.regFloor = regimentMembers(reg).filter(u => u.type === 'infantry').length;
    // Crew walk to the gun and it fires.
    for (let k = 0; k < 15; k++) window.__RTS_DEBUG__.tick(1);
    out.atGun = artilleryCrewV06(getRegiment(g1.regimentId)).every(u => Math.hypot(u.x - g1.x, u.y - g1.y) < 60);
    out.fires = canArtilleryOperateV06(g1);
    out.stats = G.stats();
    return out;
  });
  expect(r.button).toBe(true);
  expect(r.oldButton).toBe(false);
  expect(r.g1).toBe(true);
  expect(r.looseUsed).toBe(true);
  expect(r.g2).toBe(true);
  expect(r.regLeft).toBe(10);
  expect(r.status).toContain('kanon');
  expect(r.short).toBe(false);
  expect(r.refill).toBe(1);
  expect(r.refilled).toBe(true);
  expect(r.more).toEqual([2, 0, 0, 0]);   // 9 men: one more crew of two, then the regiment keeps its 6 (one man short of a crew)
  expect(r.regFloor).toBe(7);
  expect(r.atGun).toBe(true);
  expect(r.fires).toBe(true);
  expect(errors).toEqual([]);
});

test('iso view: one kind to a regiment - kinds are never mixed, short lists fill up with the same kind', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openGame(page, 'test=iso-one-kind&view=iso');
  await page.waitForFunction(() => window.__TROOPS_V1__ && window.__QUICK_REGIMENT_V1__ && window.__REGIMENT_ORDERS_V1__, null, { timeout: 60_000 });
  const r = await page.evaluate(() => {
    const X = window.__TROOPS_V1__, out = {};
    const mk = (side, type, troop, x, y) => { const u = createUnit(side, type, x, y); if (troop) X.applyTroop(u, troop); return u; };
    const kinds = reg => [...new Set(regimentMembers(reg).filter(u => u.type === 'infantry' || u.type === 'cavalry').map(u => u.troop || ''))];
    // 10 grenadiers and 6 line men offered; 4 more grenadiers stand nearby.
    const gren = [], line = [];
    for (let i = 0; i < 10; i++) gren.push(mk('france', 'infantry', 'grenadier', 2300 + i * 16, 1500));
    for (let i = 0; i < 6; i++) line.push(mk('france', 'infantry', null, 2300 + i * 16, 1530));
    const extra = [0, 1, 2, 3].map(i => mk('france', 'infantry', 'grenadier', 2300 + i * 16, 1570));
    const reg = createRegiment('france', [...gren, ...line, mk('france', 'officer', null, 2280, 1500), mk('france', 'drummer', null, 2280, 1515)]);
    out.kinds = reg && kinds(reg); out.size = reg && regimentMembers(reg).filter(u => u.type === 'infantry').length;
    out.lineLoose = line.every(u => !u.regimentId); out.extraIn = extra.filter(u => u.regimentId === reg?.id).length;
    out.name = reg?.name;
    // Reinforcing: the line men may not join the grenadiers.
    selectedUnits.clear(); for (const u of regimentMembers(reg)) selectedUnits.add(u); line.forEach(u => selectedUnits.add(u));
    actionSignature = ''; updateHud(true);
    const rb = actionsEl.querySelector('[data-action="reinforce-regiment"]');
    out.reinforceOff = !!rb && rb.disabled;
    out.reinforced = window.__REGIMENT_ORDERS_V1__.reinforce();
    out.lineStillLoose = line.every(u => !u.regimentId);
    // Quick regiment from a mixed selection: the majority kind, filled with free men of that kind.
    const sel = [];
    for (let i = 0; i < 8; i++) sel.push(mk('france', 'infantry', 'voltigeur', 1950 + i * 16, 1750));
    for (let i = 0; i < 3; i++) sel.push(mk('france', 'infantry', null, 1950 + i * 16, 1780));
    for (let i = 0; i < 4; i++) mk('france', 'infantry', 'voltigeur', 1950 + i * 16, 1810);
    sel.push(mk('france', 'officer', null, 1930, 1750), mk('france', 'drummer', null, 1930, 1765));
    const p = window.__QUICK_REGIMENT_V1__.plan('france', centroid(sel), sel, 300);
    out.planKind = p.kind; out.planAll = p.inf.every(u => u.troop === 'voltigeur'); out.planN = p.inf.length;
    // Cavalry: cuirassiers and hussars do not ride together.
    const cav = [0, 1, 2, 3].map(i => mk('france', 'cavalry', 'cuirassier', 2300 + i * 30, 1300)).concat([0, 1].map(i => mk('france', 'cavalry', 'hussar', 2300 + i * 30, 1340)));
    const creg = createCavalryRegimentV06('france', [...cav, mk('france', 'officer', null, 2280, 1300)]);
    out.cavKinds = creg && kinds(creg);
    // The British raise whole regiments of one kind.
    let mixed = 0;
    for (let n = 0; n < 6; n++) {
      const men = []; for (let i = 0; i < 12; i++) men.push(mk('britain', 'infantry', i % 3 === 0 ? 'rifle' : null, 3000 + i * 16, 900 + n * 60));
      const b = createRegiment('britain', [...men, mk('britain', 'officer', null, 2980, 900 + n * 60), mk('britain', 'drummer', null, 2980, 915 + n * 60)]);
      if (b && kinds(b).length !== 1) mixed++;
    }
    out.britishMixed = mixed;
    // No regiment on the field mixes kinds.
    out.anyMixed = regiments.filter(g => !g.destroyed && kinds(g).length > 1).map(g => g.name);
    return out;
  });
  expect(r.kinds).toEqual(['grenadier']);
  expect(r.size).toBe(12);   // made up to the minimum with grenadiers standing nearby
  expect(r.lineLoose).toBe(true);
  expect(r.extraIn).toBe(2);
  expect(r.name).toContain('Grenadiers');
  expect(r.reinforceOff).toBe(true);
  expect(r.reinforced).toBe(0);
  expect(r.lineStillLoose).toBe(true);
  expect(r.planKind).toBe('voltigeur');
  expect(r.planAll).toBe(true);
  expect(r.planN).toBe(12);
  expect(r.cavKinds).toEqual(['cuirassier']);
  expect(r.britishMixed).toBe(0);
  expect(r.anyMixed).toEqual([]);
  expect(errors).toEqual([]);
});

test('iso view: press a place and drag - an arrow shows the front, the regiment marches there and faces that way', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await openGame(page, 'test=iso-facing-arrow&view=iso');
  await page.waitForFunction(() => window.__FACING_ARROW_V1__ && window.__ISO_VIEW_V1__?.stats().ground && window.__RTS_DEBUG__, null, { timeout: 60_000 });
  const regId = await page.evaluate(() => {
    const m = []; for (let i = 0; i < 12; i++) m.push(createUnit('france', 'infantry', 2300 + (i % 6) * 18, 1700 + Math.floor(i / 6) * 18));
    m.push(createUnit('france', 'officer', 2280, 1700), createUnit('france', 'drummer', 2280, 1715));
    const reg = createRegiment('france', m); selectWholeRegiment(reg);
    camera.x = 2400; camera.y = 1650; camera.zoom = 1.2;
    return reg.id;
  });
  await page.waitForTimeout(300);
  const painted = () => page.evaluate(() => { const l = document.getElementById('facing-arrow-layer'); const d = l.getContext('2d').getImageData(0, 0, l.width, l.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { n, hidden: getComputedStyle(l).visibility === 'hidden' }; });
  const facingAfter = (sx, sy, ex, ey) => page.evaluate(([id, sx, sy, ex, ey]) => {
    const a = screenToWorld(sx, sy), b = screenToWorld(ex, ey), want = Math.atan2(b.y - a.y, b.x - a.x);
    for (let k = 0; k < 40; k++) window.__RTS_DEBUG__.tick(1);
    const reg = getRegiment(id), c = centroid(regimentMembers(reg));
    const diff = Math.abs(Math.atan2(Math.sin(reg.facing - want), Math.cos(reg.facing - want)));
    return { diff, dist: Math.hypot(c.x - a.x, c.y - a.y) };
  }, [regId, sx, sy, ex, ey]);
  // 1. Computer: right button down on the place, drag the way to face.
  await page.mouse.move(650, 330); await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 8; i++) await page.mouse.move(650 + i * 12, 330 - i * 9);
  const during = await page.evaluate(() => window.__FACING_ARROW_V1__.state());
  const ink = await painted();
  await page.mouse.up({ button: 'right' });
  const fading = await page.evaluate(() => window.__FACING_ARROW_V1__.state().fading);
  const mouse = await facingAfter(650, 330, 746, 258);
  // 2. Phone: one finger down on open ground, drag, lift.
  const touch = await page.evaluate(() => {
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    fire('pointerdown', 500, 420);
    for (let i = 1; i <= 8; i++) fire('pointermove', 500 - i * 10, 420 + i * 6);
    const live = window.__FACING_ARROW_V1__.state().dragging;
    fire('pointerup', 420, 468);
    return { live };
  });
  const phone = await facingAfter(500, 420, 420, 468);
  expect(during.dragging).toBe(true);
  expect(ink.hidden).toBe(false);
  expect(ink.n).toBeGreaterThan(500);
  expect(fading).toBe(true);
  expect(mouse.diff).toBeLessThan(0.2);
  expect(mouse.dist).toBeLessThan(40);
  expect(touch.live).toBe(true);
  expect(phone.diff).toBeLessThan(0.2);
  expect(phone.dist).toBeLessThan(40);
  expect(errors).toEqual([]);
});
