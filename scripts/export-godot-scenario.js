'use strict';
// Exports the web game's opening for the Godot version (godot/): the start
// state of a singleplayer battle (bases, peasants, resources, villages,
// bridges, unit and building rules) as godot/assets/map/start.json, the site
// pictures the web game draws at run time (lumber camps, mines, iron deposits)
// as PNGs, and copies of the sprite atlases and props the Godot version uses.
//
//   node scripts/export-godot-scenario.js [http://127.0.0.1:4175]
//
// It needs the game served (python3 -m http.server 4175) and Playwright.

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GODOT = path.join(ROOT, 'godot', 'assets');
const SPRITES = path.join(ROOT, 'graphics-lab', 'assets', 'sprites', 'iso');
const PROPS = path.join(ROOT, 'graphics-lab', 'assets', 'iso', 'props');
const VILLAGE = path.join(ROOT, 'graphics-lab', 'assets', 'iso', 'village');

// Sprite atlases: soldiers of both sides and their fallen, peasants, officers,
// drummers, cavalry and guns with their crews.
const ATLASES = ['fr_iso_infantry', 'fr_iso_fallen', 'br_iso_infantry', 'br_iso_fallen',
  'frw_iso_worker', 'brw_iso_worker', 'fro_iso_officer', 'bro_iso_officer',
  'frd_iso_drummer', 'brd_iso_drummer', 'frc_iso_cavalry', 'frc_iso_cavfight',
  'brc_iso_cavalry', 'brc_iso_cavfight', 'frg_iso_gun', 'brg_iso_gun', 'fra_iso_gunner', 'bra_iso_gunner'];
const PROP_NAMES = ['oak', 'beech', 'pine', 'spruce', 'birch', 'bush', 'hawthorn', 'barracks_fr', 'barracks_br',
  'cottage', 'barn', 'tower_fr', 'tower_br', 'hospital_fr', 'hospital_br', 'well', 'haystack', 'bridge_stone', 'bridge_wood'];
const VILLAGE_KINDS = ['barn', 'chapel', 'cottage', 'cottage2', 'farmhouse', 'farmhouse2', 'inn'];
// As the web iso view: half the cottages whitewashed, some farmhouses stone.
const strHash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const VILLAGE_SCALE = 1.6;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function houseLook(house, village) {
  const r = strHash(String(house.id || `${house.x}:${house.y}`));
  let kind = house.kind || 'cottage';
  if (kind === 'cottage' && r < 0.5) kind = 'cottage2';
  else if (kind === 'farmhouse' && r < 0.4) kind = 'farmhouse2';
  const meta = village.kinds[kind];
  if (!meta) return null;
  let front = house.side > 0 ? -1 : 1;
  if (Number.isFinite(house.accessX)) {
    const v = -(house.accessX - house.x) * Math.sin(house.angle) + (house.accessY - house.y) * Math.cos(house.angle);
    if (Math.abs(v) > 1) front = v < 0 ? -1 : 1;
  }
  const n = village.headings, a = front < 0 ? Math.PI - house.angle : -house.angle;
  const heading = ((Math.round(a / (2 * Math.PI / n)) % n) + n) % n;
  // Canvas pixels per sprite pixel at zoom 1.
  const scale = house.w * VILLAGE_SCALE / meta.lengthM / village.pxPerM;
  return { kind, heading, scale };
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4175';
  for (const name of ATLASES) for (const ext of ['json', 'webp']) copy(path.join(SPRITES, `${name}_atlas.${ext}`), path.join(GODOT, 'units', `${name}_atlas.${ext}`));
  for (const name of PROP_NAMES) copy(path.join(PROPS, `${name}.webp`), path.join(GODOT, 'props', `${name}.webp`));
  const props = JSON.parse(fs.readFileSync(path.join(PROPS, 'props.json'), 'utf8'));
  fs.writeFileSync(path.join(GODOT, 'props', 'props.json'), JSON.stringify({ pxPerM: props.pxPerM,
    props: Object.fromEntries(PROP_NAMES.map(n => [n, props.props[n]])) }, null, 1));
  const village = JSON.parse(fs.readFileSync(path.join(VILLAGE, 'village.json'), 'utf8'));
  for (const kind of VILLAGE_KINDS) copy(path.join(VILLAGE, village.kinds[kind].image), path.join(GODOT, 'village', village.kinds[kind].image));
  fs.writeFileSync(path.join(GODOT, 'village', 'village.json'), JSON.stringify({ headings: village.headings, pxPerM: village.pxPerM,
    kinds: Object.fromEntries(VILLAGE_KINDS.map(k => [k, village.kinds[k]])) }));

  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  // A fixed draw of the dice: the same opening every export.
  await page.addInitScript(() => { let s = 1807; Math.random = () => ((s = Math.imul(s, 1103515245) + 12345 >>> 0) / 4294967296); });
  await page.goto(`${base}/play.html?view=iso&gpu=off&mode=singleplayer`);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().assets.ready && window.RTS_SIM && window.__LUMBER_ART_V1__ && window.__MINING_ART_V1__, null, { timeout: 120000 });
  const state = await page.evaluate(() => {
    const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined && o[k] !== null).map(k => [k, o[k]]));
    const plain = v => JSON.parse(JSON.stringify(v, (k, x) => typeof x === 'function' ? undefined : x));
    const art = {};
    for (const side of ['france', 'britain']) {
      art[`lumbercamp_${side}`] = __LUMBER_ART_V1__.sprite('lumbercamp', side).toDataURL('image/png');
      art[`mine_${side}`] = __MINING_ART_V1__.sprite('mine', side).toDataURL('image/png');
    }
    art.deposit = __MINING_ART_V1__.sprite('deposit').toDataURL('image/png');
    art.deposit_empty = __MINING_ART_V1__.sprite('empty').toDataURL('image/png');
    return {
      art,
      state: {
        source: 'scripts/export-godot-scenario.js from the web game',
        world: plain(WORLD), types: plain(TYPES), training: plain(TRAINING), buildingTypes: plain(BUILDINGS),
        economies: plain(economies), logging: plain(window.NRTS_CONFIG?.logging || null),
        // The opening as the game sets it up, before anyone has acted.
        buildings: buildings.filter(b => !b.dead && b.complete !== false).map(b => pick(b, ['id', 'side', 'type', 'x', 'y', 'w', 'h', 'hp', 'maxHp'])),
        units: units.filter(u => !u.dead).map(u => pick(u, ['id', 'side', 'type', 'x', 'y', 'hp'])),
        resources: resources.filter(r => !r.dead).map(r => pick(r, ['id', 'type', 'x', 'y', 'amount', 'radius', 'deposit'])),
        villages: plain((window.VILLAGE_SCENERY_V4 || []).map(v => ({ name: v.name, x: v.x, y: v.y,
          houses: (v.houses || []).map(h => pick(h, ['id', 'kind', 'x', 'y', 'w', 'h', 'angle', 'side', 'accessX', 'accessY'])) }))),
        crossings: plain((typeof WATER_CROSSINGS_V067 !== 'undefined' ? WATER_CROSSINGS_V067 : []).map(c => pick(c, ['id', 'name', 'x', 'y', 'length', 'width', 'angle', 'material'])))
      }
    };
  });
  await browser.close();
  for (const [name, url] of Object.entries(state.art)) {
    const file = path.join(GODOT, 'art', `${name}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  }
  const start = state.state;
  for (const v of start.villages) for (const h of v.houses) Object.assign(h, houseLook(h, village) || {});
  for (const v of start.villages) v.houses = v.houses.filter(h => h.heading !== undefined);
  for (const list of ['buildings', 'units', 'resources']) for (const o of start[list]) for (const k of ['x', 'y']) o[k] = Math.round(o[k] * 10) / 10;
  fs.writeFileSync(path.join(GODOT, 'map', 'start.json'), JSON.stringify(start));
  console.log(`start.json: ${start.buildings.length} buildings, ${start.units.length} units, ${start.resources.length} resources, ` +
    `${start.villages.reduce((n, v) => n + v.houses.length, 0)} houses, ${start.crossings.length} crossings; ${Object.keys(state.art).length} site pictures`);
}

main().catch(error => { console.error(error); process.exit(1); });
