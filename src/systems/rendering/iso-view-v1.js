'use strict';
// ---------- Iso view v1 (opt-in: ?view=iso) ----------
// Draws the running game in the Graphics Lab's 30° camera with its Blender
// sprites: soldiers, staff, horse, guns and crews in eight directions, trees and
// buildings as rendered props, the game's own terrain laid flat on the ground.
// Read-only on the simulation: no unit, order, path, combat or AI value is
// written. Input keeps working because screenToWorld/worldToScreen are swapped
// for the iso projection while the view is on (the 2D camera maths is an
// axis-aligned scale, so a screen box is still a world box).
// Without ?view=iso this file does nothing.
(function installIsoViewV1(global) {
  const params = new URLSearchParams(location.search);
  if (params.get('view') !== 'iso') return;
  if (global.__NRTS_SERVER__) { global.__ISO_ASSETS_READY__ = true; return; }

  const ASSETS = 'graphics-lab/assets/';
  // Scale: a line's files stand 18 px apart in the game and 0.8 m apart in the lab.
  const PPM = 22.5, SQ = 0.5, SPRITE_PPM = 128 / 3.1, LIFT = 0.866;
  const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  const presentation = global.__UNIT_PRESENTATION_V1__;
  const buildingPresentation = global.__BUILDING_PRESENTATION_V1__;
  const atmosphere = global.__BATTLEFIELD_ATMOSPHERE_V1__;
  const HD = params.has('hd');
  const MOBILE_RENDER = global.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile ??
    (matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) <= 700);
  const MARCH_STRIDE = 1.5, DIE_FRAME = 0.17, CORPSE_MAX = 320, SMOKE_MAX = 260, BLOOD_SPREAD = 6;
  // Village houses in the game are about a third of real size next to its
  // soldiers; drawn at their footprint they would be shorter than a man. They are
  // drawn this much larger than the footprint (the footprint still decides where
  // men can walk).
  const VILLAGE_SCALE = 1.6;
  // Readability: scenery in front of soldiers turns see-through, and below this
  // zoom (or with Overzicht on) the small village dressing and chimney smoke go.
  const COVER_ALPHA = 0.32, OVERVIEW_ALPHA = 0.5, DETAIL_ZOOM = 0.55;
  const detailed = () => !view.overview && z() >= DETAIL_ZOOM;
  // Screen box of a sprite drawn at (X, Y) with its pivot, for the see-through test.
  const box = (X, Y, px, py, w, h, k) => [X - px * k, Y - py * k, X + (w - px) * k, Y + (h - py) * k];
  const view = { on: true, atlases: {}, props: {}, village: null, dressing: null, chimneyAt: new Map(), chimneySmoke: [], info: new Map(), missingNames: new Set(), corpses: [], smoke: [], tiles: new Map(), trenchLips: new Map(), trenchCrests: new Map(), towerFired: new Map(),
    tileTick: 0, frames: 0, lastNow: 0, regFire: new Map(), gunFire: new Map(), impacts: [], miniAt: 0, fogAt: 0,
    stats: { renderMs: 0, seeThrough: 0, flags: 0, ground: false, houses: 0, dressing: 0, chimneySmoke: 0, drawn: 0, sprites: 0, workers: 0, props: 0, tilesBaked: 0, tilesDrawn: 0, corpses: 0, smoke: 0, missing: 0 } };

  const assetState = { ready: false, completed: 0, total: 0, background: 0, failed: 0 };
  global.__ISO_ASSETS_READY__ = false;
  const gpu = global.__ISO_GPU_V1__?.active() ? global.__ISO_GPU_V1__ : null;
  function drawImage(image, ...args) {
    if (!gpu?.draw(ctx, image, ...args)) ctx.drawImage(image, ...args);
  }
  function drawScenery(image, ...args) {
    if (gpu?.draw(ctx, image, ...args)) return;
    if (global.__STATIC_SPRITE_CACHE_V1__) global.__STATIC_SPRITE_CACHE_V1__.draw(ctx, image, ...args);
    else ctx.drawImage(image, ...args);
  }

  const seasonState = () => global.__SEASONS_V1__?.state();
  function drawPlant(prop, kind, wx, wy, ...args) {
    const palette = global.__SEASONS_V1__?.paletteFor(kind,wx,wy,seasonState()) || 'base';
    const image = global.__SEASONAL_PROPS_V1__?.source(prop.image,palette) || prop.image;
    drawScenery(image,...args);
  }
  function drawSeasonGround() {
    const season=seasonState();view.stats.seasons=season||null;view.stats.seasonGroundDraws=0;
    if(!season?.groundTint)return;
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=season.groundTint;
    ctx.fillRect(0,0,frameWidth||innerWidth,frameHeight||innerHeight);ctx.restore();view.stats.seasonGroundDraws=1;
  }

  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177) >>> 0; h ^= h >>> 13;
    return (Math.imul(h, 1103515245) >>> 0) / 4294967296; };
  // Game facing/heading (radians, y down) -> sprite direction index.
  const dirOf = a => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;

  // ---- projection ----
  // Reading window dimensions in every projected point can repeatedly enter
  // the layout engine. A frame has one viewport; input outside a frame reads live.
  let frameWidth = 0, frameHeight = 0;
  const z = () => camera.zoom;
  const sx = wx => (wx - camera.x) * z() + (frameWidth || innerWidth) / 2;
  const sy = wy => (wy - camera.y) * z() * SQ + (frameHeight || innerHeight) / 2;
  const spriteK = () => z() * PPM / SPRITE_PPM;
  // Relief: ground heights from the Blender ground (ground.json "relief", metres
  // on a grid in game metres, stored as cm). A point h metres up shows h*LIFT
  // higher on screen, so everything standing on the ground is lifted by it.
  function heightPx(wx, wy) {
    const R = view.relief; if (!R) return 0;
    const fj = (wx / PPM - R.x0) / R.cell, fi = (wy / PPM - R.y0) / R.cell;
    const j = Math.min(Math.max(Math.floor(fj), 0), R.cols - 2), i = Math.min(Math.max(Math.floor(fi), 0), R.rows - 2);
    const u = Math.min(Math.max(fj - j, 0), 1), v = Math.min(Math.max(fi - i, 0), 1), H = R.cm, c = R.cols;
    const top = H[i * c + j] * (1 - u) + H[i * c + j + 1] * u, bottom = H[(i + 1) * c + j] * (1 - u) + H[(i + 1) * c + j + 1] * u;
    return (top * (1 - v) + bottom * v) / 100 * PPM;
  }
  const liftAt = (wx, wy) => heightPx(wx, wy) * LIFT * z();
  const gy = (wx, wy) => sy(wy) - liftAt(wx, wy);
  // Flat inverse (the ground image itself), and the inverse onto the relief: the
  // ground point whose lifted screen position is (px, py). Raised ground shows
  // higher, so that point lies south of the flat one; found by bisection.
  const flatScreenToWorld = (px, py) => ({ x: (px - innerWidth / 2) / camera.zoom + camera.x, y: (py - innerHeight / 2) / (camera.zoom * SQ) + camera.y });
  function isoScreenToWorld(px, py) {
    const p = flatScreenToWorld(px, py);
    if (!view.relief) return p;
    let lo = p.y, hi = p.y + (view.relief.maxM + 1) * PPM * LIFT / SQ;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (gy(p.x, mid) < py) lo = mid; else hi = mid; }
    return { x: p.x, y: (lo + hi) / 2 };
  }
  function isoWorldToScreen(wx, wy) { return { x: sx(wx), y: gy(wx, wy) }; }

  // The home base can be relocated into its village, well west of the soldiers.
  // Fit the starting force as well as the base on a phone, rather than centring
  // on the base alone. Only boot and a new battle may change this framing;
  // streaming assets and ordinary frames must leave the player's camera alone.
  function frameStartingForce() {
    if (!global.matchMedia('(pointer:coarse),(max-width:860px)').matches) return;
    const men = units.filter(u => !u.dead && u.side === 'france');
    if (!men.length) return;
    const bounds = men.map(u => ({ x: u.x, y: u.y * SQ - heightPx(u.x, u.y) * LIFT,
      halfWidth: 28, above: u.type === 'cavalry' ? 65 : 48, below: 12 }));
    const home = buildings.find(b => !b.dead && b.side === 'france' && b.type === 'towncenter');
    if (home) bounds.push({ x: home.x, y: home.y * SQ - heightPx(home.x, home.y) * LIFT,
      halfWidth: home.w * 0.8, above: home.h * SQ + 90, below: home.h * SQ });
    const left = Math.min(...bounds.map(p => p.x - p.halfWidth));
    const right = Math.max(...bounds.map(p => p.x + p.halfWidth));
    const top = Math.min(...bounds.map(p => p.y - p.above));
    const bottom = Math.max(...bounds.map(p => p.y + p.below));
    const hudBottom = Math.max(document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0,
      document.getElementById('isoOverviewToggle')?.getBoundingClientRect().bottom || 0);
    const hudTop = document.querySelector('.bottombar')?.getBoundingClientRect().top || innerHeight;
    const screenTop = hudBottom + 20, screenBottom = Math.max(screenTop + 80, hudTop - 20);
    camera.zoom = Math.max(0.42, Math.min(0.72, (innerWidth - 48) / Math.max(1, right - left),
      (screenBottom - screenTop) / Math.max(1, bottom - top)));
    camera.x = (left + right) / 2;
    camera.y = ((top + bottom) / 2 - ((screenTop + screenBottom) / 2 - innerHeight / 2) / camera.zoom) / SQ;
    clampCamera();
  }
  const topDown = { s2w: screenToWorld, w2s: worldToScreen };

  // ---- atlases (the lab's, half resolution unless ?hd=1) ----
  const loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = async () => { try { await im.decode(); res(im); } catch (error) { rej(error); } };
    im.onerror = () => rej(new Error('iso: ontbreekt ' + src)); im.src = src; });
  function loadSheet(prefix, kind) {
    const dir = ASSETS + 'sprites/iso/';
    return fetch(dir + prefix + '_iso_' + kind + '_atlas.json').then(r => { if (!r.ok) throw new Error('iso: atlas ' + prefix + ' ' + kind); return r.json(); })
      .then(sheet => { const half = !HD && sheet.meta.half;
        return loadImage(dir + (half ? half.image : sheet.meta.image)).then(image => ({ sheet, image, scale: half ? half.scale : 1,
          fullSrc: half ? dir + sheet.meta.image : null, halfImage: image, halfScale: half ? half.scale : 1 })); });
  }
  // Sharp sprites where they are seen: the half-size sheets are light enough for a
  // phone, but drawn larger than they are (most of all zoomed in) they look soft.
  // A sheet that is drawn magnified gets its full-size image in the background; one
  // not drawn magnified for a while (unseen, or seen from far) goes back to half size. All full sheets together would take
  // well over a gigabyte, so a budget keeps the sharp ones to those on screen.
  const SHARP_AT = 1.12, SHARP_IDLE_MS = 20000;
  // Phones retain the decoded half-size sheets at every zoom. Automatically
  // loading HD sheets during play adds decode stalls and up to 240 MiB of RAM.
  // Explicit ?hd still loads the full-size artwork through the existing loader.
  const SHARP_BUDGET = (MOBILE_RENDER ? 0 : 640) * 2 ** 20;
  const sharp = { parts: new Set(), bytes: 0, loading: 0, loaded: 0, dropped: 0, sweptAt: 0, now: 0 };
  const bytesOf = part => part.sheet.meta.size.w * part.sheet.meta.size.h * 4;
  function sharpen(part, now) {
    if (sharp.loading >= 1) return;
    part.sharpening = true;
    const need = bytesOf(part);
    // Make room: the sheets least recently drawn (not in the last two seconds) go back to half size.
    if (sharp.bytes + need > SHARP_BUDGET) {
      for (const q of [...sharp.parts].sort((a, b) => a.used - b.used)) {
        if (sharp.bytes + need <= SHARP_BUDGET || now - q.used < 2000) break;
        soften(q);
      }
      if (sharp.bytes + need > SHARP_BUDGET) { part.sharpening = false; return; }
    }
    sharp.bytes += need; sharp.loading++;
    loadImage(part.fullSrc).then(image => { part.image = image; part.scale = 1; sharp.parts.add(part); sharp.loaded++; })
      .catch(() => { sharp.bytes -= need; })
      .finally(() => { sharp.loading--; part.sharpening = false; });
  }
  function soften(part) {
    if (!sharp.parts.delete(part)) return;
    part.image = part.halfImage; part.scale = part.halfScale; sharp.bytes -= bytesOf(part); sharp.dropped++;
  }
  function sweepSharp(now) {
    if (now - sharp.sweptAt < 5000) return;
    sharp.sweptAt = now;
    for (const q of [...sharp.parts]) if (now - q.used > SHARP_IDLE_MS) soften(q);
  }
  function indexAtlas(parts) {
    const byAnim = new Map();
    for (const p of parts) for (const a of Object.keys(p.sheet.animations)) byAnim.set(a, p);
    return { ...parts[0], byAnim };
  }
  const load = (key, kinds) => Promise.all(kinds.map(k => loadSheet(key, k))).then(indexAtlas)
    .then(a => { view.atlases[key] = a; });
  const INFANTRY = ['infantry', 'fallen', 'combat', 'morale'];
  // A gun's model (troops-v1) by its sprite suffix.
  const GUN_MODEL = { heavy12: '12', howitzer: 'h', horseart: 'l' };
  async function loadAll() {
    const panel = document.createElement('section'); panel.id = 'isoLoading';
    panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    panel.style.cssText = 'position:fixed;inset:0;z-index:100;display:grid;place-content:center;gap:12px;text-align:center;background:#18201b;color:#f5f1e8;font:600 16px system-ui;padding:24px';
    const label = document.createElement('div'), progress = document.createElement('progress');
    label.textContent = 'Slagveld voorbereiden…'; progress.style.width = 'min(320px,80vw)';
    panel.append(label, progress); document.body.appendChild(panel); canvas.setAttribute('aria-busy', 'true');
    const first = [() => load('fr', INFANTRY), () => load('br', INFANTRY)];
    for (const p of ['fr', 'br']) first.push(() => load(p + 'o', ['officer']), () => load(p + 'd', ['drummer']),
      () => load(p + 'c', ['cavalry', 'cavfight']), () => load(p + 'g', ['gun']), () => load(p + 'a', ['gunner', 'gunner2']));
    first.push(loadProps, loadVillage, loadGround, () => load('frw', ['worker']), () => load('brw', ['worker']));
    assetState.total = first.length; progress.max = first.length; progress.value = 0;
    let index = 0;
    try {
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (index < first.length) { const job = first[index++]; await job(); assetState.completed++; progress.value = assetState.completed; }
      }));
      assetState.ready = true; global.__ISO_ASSETS_READY__ = true;
      global.RTS_VERSION_INFO?.finalizeBoot();
      canvas.setAttribute('aria-busy', 'false'); panel.remove(); frameStartingForce();
    } catch (error) {
      assetState.failed++; label.textContent = 'Het slagveld kon niet volledig laden. Controleer je verbinding en probeer opnieuw.';
      progress.remove(); const retry = document.createElement('button'); retry.textContent = 'Opnieuw laden';
      retry.onclick = () => location.reload(); panel.appendChild(retry); console.warn('iso: laden', error); return;
    }
    const looks = ['fr', 'br'].flatMap(p => ['', '2', '3', '4', '5'].map(l => p + l)).concat(global.NRTS_CONFIG?.troops ? ['fr6', 'fr7', 'br6'] : []);
    const horse = ['fr', 'br'].flatMap(p => [p + 'c2', p + 'co']).concat(global.NRTS_CONFIG?.troops ? ['frck', 'frcl', 'brcg'] : []);
    const guns = global.NRTS_CONFIG?.troops ? ['fr', 'br'].flatMap(p => Object.values(GUN_MODEL).map(m => [p + 'g' + m, 'gun' + m])) : [];
    // Base digging and wildlife first; cosmetic uniform variations follow in two bounded streams.
    const extra = looks.map(k => () => loadSheet(k, 'dig').then(part => { view.atlases[k + ':dig'] = indexAtlas([part]); }))
      .concat(global.NRTS_CONFIG?.wildlife ? [() => load('wds', ['stag']), () => load('wdh', ['hind']), () => load('wrb', ['rabbit'])] : [])
      .concat(looks.filter(k => k.length > 2).map(k => () => load(k, INFANTRY)))
      .concat(horse.map(k => () => load(k, ['cavalry', 'cavfight'])))
      .concat(guns.map(([k, kind]) => () => load(k, [kind])));
    assetState.background = extra.length; let next = 0;
    await Promise.all([0, 1].map(async worker => {
      while (next < extra.length) {
        await new Promise(resolve => {
          if (global.__FRAME_WORK_V1__) global.__FRAME_WORK_V1__.enqueue('assets:' + worker, resolve, { maxDelayMs: 500 });
          else setTimeout(resolve, 0);
        });
        const job = extra[next++]; if (!job) break;
        try { await job(); } catch (error) { assetState.failed++; console.warn('iso: extra afbeelding', error); }
        assetState.background--;
      }
    }));
  }
  function loadProps() {
    return fetch(ASSETS + 'iso/props/props.json').then(r => r.json()).then(m => Promise.all(Object.entries(m.props)
      .map(([kind, meta]) => loadImage(ASSETS + 'iso/props/' + meta.image).then(image => { view.props[kind] = { ...meta, image }; }))))
      ;
  }
  // The whole battlefield rendered in Blender (scripts/render-iso-gamemap.py).
  function loadGround() {
    const dir = ASSETS + 'iso/game/';
    return fetch(dir + 'ground.json').then(r => { if (!r.ok) throw new Error('iso: grond ontbreekt'); return r.json(); }).then(meta => meta && loadImage(dir + meta.image)
      .then(img => {
        view.ground = { ...meta, img, k: meta.pxPerM / meta.gamePxPerM, pad: meta.padTop || 0 };
        const R = meta.relief;
        if (R && R.data) {
          const bytes = Uint8Array.from(atob(R.data), ch => ch.charCodeAt(0));
          view.relief = { ...R, data: null, cm: new Uint16Array(bytes.buffer, 0, R.cols * R.rows) };
          installHeightSight();
        }
        view.woodTrees = null;
      }))
      ;
  }
  // Village buildings: one sheet per kind with 16 headings (scripts/render-iso-village.py).
  function loadVillage() {
    const dir = ASSETS + 'iso/village/';
    return fetch(dir + 'village.json').then(r => r.json()).then(m => Promise.all(Object.entries(m.kinds)
      .map(([kind, meta]) => loadImage(dir + meta.image).then(image => [kind, { ...meta, image }])))
      .then(list => { view.village = { kinds: Object.fromEntries(list), pxPerM: m.pxPerM, headings: m.headings }; }))
      ;
  }
  const villageHouses = () => (global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__ || []).flatMap(v => v.houses || []);
  // The model's door side is its -y; the game's road side is local -y for side > 0
  // (+y otherwise), with y pointing down: that gives the model's heading.
  function headingOf(house, n) {
    // The front faces the house's gate on the road when the game gives one.
    let front = house.side > 0 ? -1 : 1;
    if (Number.isFinite(house.accessX)) {
      const v = -(house.accessX - house.x) * Math.sin(house.angle) + (house.accessY - house.y) * Math.cos(house.angle);
      if (Math.abs(v) > 1) front = v < 0 ? -1 : 1;
    }
    const a = front < 0 ? Math.PI - house.angle : -house.angle;
    return ((Math.round(a / (2 * Math.PI / n)) % n) + n) % n;
  }
  const strHash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  // Half the cottages are whitewashed under red tiles, some farmhouses are stone under slate.
  function kindOf(house) {
    const kinds = view.village.kinds, k = house.kind || 'cottage', r = strHash(String(house.id || house.x + ':' + house.y));
    if (k === 'cottage' && kinds.cottage2 && r < 0.5) return 'cottage2';
    if (k === 'farmhouse' && kinds.farmhouse2 && r < 0.4) return 'farmhouse2';
    return k;
  }
  // Game pixels per model metre for a house (its footprint length, enlarged).
  const houseScale = (house, meta) => house.w * VILLAGE_SCALE / meta.lengthM;
  function houseDrawable(house) {
    const V = view.village, kind = V && kindOf(house), meta = V && V.kinds[kind];
    if (!meta) return null;
    const X = sx(house.x), Y = gy(house.x, house.y), reach = house.w * VILLAGE_SCALE * z();
    if (X < -reach || X > innerWidth + reach || Y < -reach * 0.6 || Y > innerHeight + reach * 1.4) return null;
    const heading = headingOf(house, V.headings), f = meta.frames[heading];
    if (detailed()) chimneys(house, kind, meta, heading);
    const k = houseScale(house, meta) * z() / V.pxPerM;
    return { gpu: true, y: house.y, box: box(X, Y, f.px, f.py, f.w, f.h, k), draw: () => {
      drawScenery(meta.image, f.x, f.y, f.w, f.h, X - f.px * k, Y - f.py * k, f.w * k, f.h * k);
      view.stats.houses++;
    } };
  }

  // ---- village dressing: wells, haystacks, orchard trees, fences and hedges ----
  // The game draws these flat (or not at all); here they are props placed from
  // the houses' own plots, deterministically, clear of roads, the river and walls.
  const DRESS_PPM = PPM * 0.6;   // the village's own scale: houses are drawn at about 0.6 of life size
  function clearSpot(x, y, r, houses) {
    if (typeof roadNetworkAtV066 === 'function') {
      for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (roadNetworkAtV066(x + dx, y + dy)) return false;
    }
    if (typeof riverHitV067 === 'function') {
      const hit = riverHitV067(x, y), half = typeof RIVER_NAV_HALF_WIDTH_V067 === 'number' ? RIVER_NAV_HALF_WIDTH_V067 : 72;
      if (hit && hit.distance < half + r + 10) return false;
    }
    for (const h of houses) {
      const c = Math.cos(h.angle), s = Math.sin(h.angle), dx = x - h.x, dy = y - h.y;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      if (Math.abs(u) < h.w * VILLAGE_SCALE / 2 + r && Math.abs(v) < h.h * VILLAGE_SCALE / 2 + r) return false;
    }
    return true;
  }
  function buildDressing() {
    const villages = global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__ || [];
    const all = villages.flatMap(v => v.houses || []), items = [];
    for (const v of villages) {
      const seed = strHash(v.name || v.x + ':' + v.y), near = all.filter(h => Math.hypot(h.x - v.x, h.y - v.y) < 700);
      // The village well, near the middle.
      for (let i = 0; i < 16; i++) {
        const a = seed * 6.283 + i * 0.785, d = 34 + (i >> 3) * 22, x = v.x + Math.cos(a) * d, y = v.y + Math.sin(a) * d;
        if (clearSpot(x, y, 12, near)) { items.push({ prop: 'well', x, y, scale: 0.9 }); break; }
      }
      for (const h of v.houses || []) {
        const r = strHash(String(h.id || h.x)), c = Math.cos(h.angle), s = Math.sin(h.angle);
        const back = headingOf(h, 16) === ((Math.round((Math.PI - h.angle) / (Math.PI / 8)) % 16) + 16) % 16 ? 1 : -1;
        // Behind the house: its local +y for side > 0 (the road is in front).
        const at = (along, behind) => ({ x: h.x + c * along - s * behind * back, y: h.y + s * along + c * behind * back });
        const depth = h.h * VILLAGE_SCALE / 2, farm = h.kind === 'farmhouse' || h.kind === 'barn';
        if (farm && r < 0.8) {
          const p = at((r - 0.4) * h.w * VILLAGE_SCALE, depth + 22);
          if (clearSpot(p.x, p.y, 10, near)) items.push({ prop: 'haystack', ...p, scale: 0.85 + r * 0.3 });
        }
        if (!farm && h.kind !== 'chapel' && r > 0.6) {
          const p = at((0.5 - r) * h.w * 1.2, depth + 26);
          if (clearSpot(p.x, p.y, 12, near)) items.push({ prop: r > 0.75 ? 'poplar' : 'oak', ...p, scale: 0.42 + r * 0.12 });
        }
        // The back of the plot: a hedge behind cottages, a fence behind farms.
        if (h.kind !== 'chapel' && r > 0.5) {
          const p = at(0, depth + 42), half = 3 * DRESS_PPM;
          const a = { x: p.x - c * half, y: p.y - s * half }, b = { x: p.x + c * half, y: p.y + s * half };
          if (clearSpot(p.x, p.y, 6, near) && clearSpot(a.x, a.y, 6, near) && clearSpot(b.x, b.y, 6, near))
            items.push({ edge: farm ? 'fence' : 'hedge', ...p, angle: h.angle });
        }
      }
    }
    return items;
  }
  function dressingDrawable(it) {
    if (!detailed()) return null;
    const X = sx(it.x), Y = gy(it.x, it.y);
    if (X < -150 || X > innerWidth + 150 || Y < -60 || Y > innerHeight + 220) return null;
    if (it.prop) {
      const prop = view.props[it.prop]; if (!prop) return null;
      const k = DRESS_PPM * it.scale * z() / SPRITE_PPM;
      return { gpu: true, y: it.y, box: box(X, Y, prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
        drawPlant(prop,it.prop,it.x,it.y, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.dressing++; } };
    }
    const V = view.village, meta = V && V.kinds[it.edge]; if (!meta) return null;
    const f = meta.frames[((Math.round(-it.angle / (2 * Math.PI / V.headings)) % V.headings) + V.headings) % V.headings];
    return { gpu: true, y: it.y, draw: () => { const k = DRESS_PPM * z() / V.pxPerM;
      drawScenery(meta.image, f.x, f.y, f.w, f.h, X - f.px * k, Y - f.py * k, f.w * k, f.h * k); view.stats.dressing++; } };
  }

  // ---- the game's woods: stands of oak and poplar (they slow movement in the game) ----
  // The kinds of tree a wood is made of: broadleaf, conifer, or the two mixed.
  const WOOD_MIX = {
    leaf: [['oak', 0.38], ['beech', 0.3], ['birch', 0.2], ['poplar', 0.12]],
    conifer: [['spruce', 0.55], ['pine', 0.38], ['birch', 0.07]],
    mixed: [['oak', 0.22], ['beech', 0.18], ['spruce', 0.22], ['pine', 0.18], ['birch', 0.2]]
  };
  const UNDERGROWTH = [['fern', 0.45], ['hazel', 0.3], ['hawthorn', 0.25]];
  function pickKind(table, r) { for (const [k, w] of table) { if ((r -= w) < 0) return k; } return table[table.length - 1][0]; }
  // The props this browser has: a kind not yet loaded falls back to the oak.
  const tree = k => view.props[k] ? k : 'oak';
  function buildWoodTrees() {
    const woods = typeof TERRAIN_WOODS !== 'undefined' ? TERRAIN_WOODS : [], trees = [];
    const blocked = (x, y, river = 110) => (typeof roadNetworkAtV066 === 'function' && roadNetworkAtV066(x, y)) ||
      (typeof riverHitV067 === 'function' && (h => h && h.distance < river)(riverHitV067(x, y)));
    woods.forEach((w, i) => {
      const mix = ['leaf', 'mixed', 'conifer'][Math.floor(hash(i * 31 + 7, 11) * 3)];
      for (let y = w.y + 30; y < w.y + w.h - 10; y += 62) for (let x = w.x + 30; x < w.x + w.w - 10; x += 70) {
        const r = hash(Math.round(x), Math.round(y) + i), tx = x + (r - 0.5) * 50, ty = y + (hash(Math.round(y), Math.round(x)) - 0.5) * 40;
        // Undergrowth between the trees: bracken, hazel and hawthorn.
        const u = hash(Math.round(x) + 17, Math.round(y) + i), ux = x + 35 + (u - 0.5) * 20, uy = y + 20;
        if (u < 0.45 && !blocked(ux, uy)) trees.push({ x: ux, y: uy, kind: tree(pickKind(UNDERGROWTH, u / 0.45)), scale: 0.55 + u * 0.3 });
        if (r < 0.12) continue;   // clearings
        if (blocked(tx, ty)) continue;
        trees.push({ x: tx, y: ty, kind: tree(pickKind(WOOD_MIX[mix], hash(Math.round(tx), Math.round(ty)))), scale: 0.5 + r * 0.25 });
      }
    });
    // Avenues: poplars line both sides of the chaussees, as along Napoleon's
    // routes imperiales - a tree every 10 m or so, gaps here and there, none on
    // a road, in the river, at a bridge, in a village, a wood or by a base.
    const roads = (global.NRTS_ROAD_NETWORK_V7 || []).filter(r => r.roadClass === 'chaussee');
    const houses = villageHouses(), bridges = crossings(), inWood = (x, y) => woods.some(w => x > w.x - 30 && x < w.x + w.w + 30 && y > w.y - 30 && y < w.y + w.h + 30);
    const step = 230;
    let avenue = 0;
    roads.forEach((road, ri) => {
      const pts = road.points || [], off = (road.width || 66) / 2 + 42;
      let carry = step / 2;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (!L) continue;
        const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
        for (let t = carry; t < L; t += step) {
          for (const side of [-1, 1]) {
            const r = hash(ri * 977 + i * 31 + Math.round(t), side + 7);
            if (r < 0.14) continue;   // a gap in the row
            const x = a.x + ux * t - uy * side * off, y = a.y + uy * t + ux * side * off;
            if (x < 40 || y < 40 || x > WORLD.width - 40 || y > WORLD.height - 40) continue;
            if (bridges.some(c => Math.hypot(x - c.x, y - c.y) < 230)) continue;
            if ((typeof buildings !== 'undefined' ? buildings : []).some(q => Math.hypot(x - q.x, y - q.y) < 320)) continue;
            if (inWood(x, y) || !clearSpot(x, y, 22, houses)) continue;
            trees.push({ x, y, kind: 'poplar', scale: 0.46 + r * 0.1, avenue: true }); avenue++;
          }
        }
        carry = (carry - L) % step; if (carry < 0) carry += step;
      }
    });
    view.stats.avenueTrees = avenue;
    // Willows along the river banks, a little way out from the water.
    let willows = 0, field = 0;
    if (typeof riverCenterXAtYV067 === 'function') {
      for (let y = 80; y < WORLD.height - 80; y += 150) for (const side of [-1, 1]) {
        const r = hash(Math.round(y), side + 31); if (r < 0.45) continue;
        const x = riverCenterXAtYV067(y) + side * (150 + r * 60);
        if (bridges.some(c => Math.hypot(x - c.x, y - c.y) < 260) || houses.some(h => Math.hypot(x - h.x, y - h.y) < 120) || inWood(x, y)) continue;
        if (typeof roadNetworkAtV066 === 'function' && roadNetworkAtV066(x, y)) continue;
        trees.push({ x, y, kind: tree(r > 0.8 ? 'birch' : 'willow'), scale: 0.5 + r * 0.15 }); willows++;
      }
    }
    // The open field: here and there a bush, a hazel or hawthorn, a fern patch, a lone tree -
    // never on a road, by the river, in a village or a wood, or near either side's base.
    const bases = buildings.filter(b => b.type === 'towncenter');
    for (let y = 120; y < WORLD.height - 120; y += 170) for (let x = 120; x < WORLD.width - 120; x += 170) {
      const r = hash(Math.round(x) + 5, Math.round(y) + 9); if (r > 0.13) continue;
      const px = x + (hash(Math.round(y), Math.round(x) + 3) - 0.5) * 120, py = y + (hash(Math.round(x), Math.round(y) + 4) - 0.5) * 120;
      if (blocked(px, py, 200) || inWood(px, py) || houses.some(h => Math.hypot(px - h.x, py - h.y) < 140) || bases.some(b => Math.hypot(px - b.x, py - b.y) < 420)) continue;
      const q = r / 0.13, kind = q < 0.3 ? 'bush' : q < 0.5 ? 'hazel' : q < 0.65 ? 'hawthorn' : q < 0.8 ? 'fern' : q < 0.9 ? 'birch' : 'beech';
      trees.push({ x: px, y: py, kind: tree(kind), scale: q >= 0.8 ? 0.45 + q * 0.1 : 0.6 + q * 0.3 }); field++;
    }
    view.stats.willows = willows; view.stats.fieldPlants = field;
    return trees;
  }
  function woodTreeDrawable(tr) {
    const X = sx(tr.x), Y = gy(tr.x, tr.y);
    if (X < -150 || X > innerWidth + 150 || Y < -30 || Y > innerHeight + 260) return null;
    const prop = view.props[tr.kind]; if (!prop) return null;
    const k = spriteK() * tr.scale;
    return { gpu: true, y: tr.y, box: box(X, Y, prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
      drawPlant(prop,tr.kind,tr.x,tr.y, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.props++; } };
  }

  // ---- bridges: Blender props at the game's crossings (scripts/render-iso-props.py) ----
  // Stone or timber, scaled to each crossing's length; men on a bridge walk on its
  // deck (flat over the water, ramps at both ends) and are drawn after it.
  // Length, deck height and ramp in metres, as BRIDGE_DECKS in the script.
  const BRIDGE_DECKS = { bridge_stone: [12.8, 1.25, 2.6], bridge_wood: [12.0, 1.0, 2.2] };
  const crossings = () => (typeof WATER_CROSSINGS_V067 !== 'undefined' ? WATER_CROSSINGS_V067 : []);
  const bridgeKind = b => b.material === 'stone' ? 'bridge_stone' : 'bridge_wood';
  // Height of the deck (game px) under a ground point, and the bridge; null off every bridge.
  function deckAt(wx, wy) {
    for (const b of crossings()) {
      const [len, deck, ramp] = BRIDGE_DECKS[bridgeKind(b)], f = b.length / (len * PPM);
      const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), dx = wx - b.x, dy = wy - b.y;
      const u = Math.abs(dx * c + dy * s), v = Math.abs(-dx * s + dy * c);
      if (u < b.length / 2 && v < b.width / 2) return { b, h: deck * f * PPM * Math.min(1, (b.length / 2 - u) / (ramp * f * PPM)) };
    }
    return null;
  }
  function bridgeDrawable(b) {
    const X = sx(b.x), Y = gy(b.x, b.y);
    if (X < -400 || X > innerWidth + 400 || Y < -150 || Y > innerHeight + 200) return null;
    const kind = bridgeKind(b), prop = view.props[kind]; if (!prop) return null;
    const k = spriteK() * b.length / (BRIDGE_DECKS[kind][0] * PPM);
    return { gpu: true, y: b.y, box: box(X, Y, prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
      drawScenery(prop.image, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.bridges++; } };
  }

  // ---- orders as in the Graphics Lab: flags, a facing arrow, attack targets ----
  // Each selected regiment's destination gets a flag and a dashed line from where it stands.
  function drawOrders(now) {
    const regs = typeof selectedRegiments === 'function' ? selectedRegiments().filter(r => r && !r.destroyed) : [];
    view.stats.flags = 0;
    for (const reg of regs) {
      if (!Number.isFinite(reg.targetX) || !Number.isFinite(reg.targetY)) continue;
      const men = regimentMembers(reg).filter(u => !u.dead); if (!men.length) continue;
      const c = centroid(men);
      if (Math.hypot(reg.targetX - c.x, reg.targetY - c.y) < 28) continue;
      const fx = sx(reg.targetX), fy = gy(reg.targetX, reg.targetY);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(245,220,112,.75)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx(c.x), gy(c.x, c.y)); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]);
      const wave = Math.sin(now * 6 + reg.id) * 2, pole = 30;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(fx, fy, 6, 3, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - pole); ctx.stroke();
      ctx.fillStyle = '#2c4fb8'; ctx.beginPath(); ctx.moveTo(fx, fy - pole); ctx.lineTo(fx + 15, fy - pole + 5 + wave); ctx.lineTo(fx, fy - pole + 11); ctx.fill();
      view.stats.flags++;
    }
    // Enemy picked as a target: dashed red rings for a few seconds.
    if (view.attack && now < view.attack.until) {
      ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(225,45,35,.95)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const u of units) {
        if (u.dead || !view.attack.ids.has(u.id)) continue;
        const r = (u.type === 'cavalry' ? 1.1 : 0.55) * PPM * z();
        ctx.moveTo(sx(u.x) + r, gy(u.x, u.y)); ctx.ellipse(sx(u.x), gy(u.x, u.y), r, r * SQ, 0, 0, 7);
      }
      ctx.stroke(); ctx.setLineDash([]);
      // And a sight over their heads, so the target stands out from the red rings.
      const foes = units.filter(u => !u.dead && view.attack.ids.has(u.id));
      if (foes.length) {
        const c = centroid(foes), X = sx(c.x), Y = gy(c.x, c.y) - 2.6 * LIFT * PPM * z(), r = 11 + Math.sin(now * 5) * 1.5;
        ctx.strokeStyle = 'rgba(235,40,30,.95)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(X + dx * (r - 4), Y + dy * (r - 4)); ctx.lineTo(X + dx * (r + 6), Y + dy * (r + 6)); }
        ctx.stroke();
      }
    }
  }
  // Right-drag (the game's facing order): an arrow from the destination along the facing.
  function drawFacingArrow() {
    const d = typeof rightDragV06 !== 'undefined' ? rightDragV06 : null;
    // The facing-arrow overlay (facing-arrow-v1) draws the drag on its own layer.
    if (!d || !d.moved || global.__FACING_ARROW_V1__) return;
    const ang = Math.atan2(d.ey - d.sy, d.ex - d.sx);
    ctx.strokeStyle = 'rgba(255,236,150,.95)'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(d.sx, d.sy, 10, 0, 7); ctx.moveTo(d.sx, d.sy); ctx.lineTo(d.ex, d.ey);
    ctx.moveTo(d.ex, d.ey); ctx.lineTo(d.ex - 12 * Math.cos(ang - 0.45), d.ey - 12 * Math.sin(ang - 0.45));
    ctx.moveTo(d.ex, d.ey); ctx.lineTo(d.ex - 12 * Math.cos(ang + 0.45), d.ey - 12 * Math.sin(ang + 0.45)); ctx.stroke();
  }
  // A move order on an enemy (right-click or tap) becomes an attack: the selection
  // marches to its weapon's reach of that enemy and faces it - the game's own move
  // and facing orders; the fighting itself is the game's.
  function enemyAt(wx, wy) {
    const px = sx(wx), py = gy(wx, wy), reach = Math.max(14, 26 * z());
    let best = null, bd = reach;
    for (const u of units) {
      if (u.dead || u.side !== 'britain') continue;
      if (typeof isVisibleToFrance === 'function' && !isVisibleToFrance(u)) continue;
      const lift = (u.type === 'cavalry' ? 1.6 : u.type === 'artillery' ? 0.5 : 0.9) * LIFT * PPM * z();
      const d = Math.min(Math.hypot(sx(u.x) - px, gy(u.x, u.y) - lift - py), Math.hypot(sx(u.x) - px, gy(u.x, u.y) - py));
      if (d < bd) { best = u; bd = d; }
    }
    return best;
  }
  function attackOrder(enemy) {
    const own = [...selectedUnits].filter(u => !u.dead && u.side === 'france' && u.type !== 'worker');
    if (!own.length || typeof issueMoveWithFacingV06 !== 'function') return false;
    const reg = enemy.regimentId && typeof getRegiment === 'function' ? getRegiment(enemy.regimentId) : null;
    const foes = reg ? regimentMembers(reg).filter(u => !u.dead) : [enemy];
    const E = centroid(foes), S = centroid(own), d = Math.hypot(S.x - E.x, S.y - E.y) || 1;
    const foot = own.some(u => u.type === 'infantry' || (u.type === 'officer' && u.troop !== 'mounted')), guns = own.every(u => u.type === 'artillery');
    const reach = guns ? TYPES.artillery.range * 0.8 : foot ? TYPES.infantry.range * 0.85 : 0;
    const dest = d <= reach ? S : { x: E.x + (S.x - E.x) / d * reach, y: E.y + (S.y - E.y) / d * reach };
    issueMoveWithFacingV06(dest.x, dest.y, Math.atan2(E.y - dest.y, E.x - dest.x));
    view.attack = { ids: new Set(foes.map(u => u.id)), until: view.lastNow + 8 };
    view.stats.attacks = (view.stats.attacks || 0) + 1;
    return true;
  }
  // Later scripts replace issueMove after this file runs: the hook is laid on top
  // of whatever is current, checked every frame.
  function ensureAttackHook() {
    if (typeof issueMove !== 'function' || issueMove.isoAttackV1) return;
    const baseIssueMove = issueMove;
    const hooked = function issueMoveIsoAttackV1(x, y) {
      if (view.on) { const e = enemyAt(x, y); if (e && attackOrder(e)) return; }
      return baseIssueMove(x, y);
    };
    // Carry the marks of the hooks below, so no hook wraps the chain twice.
    Object.assign(hooked, baseIssueMove);
    hooked.isoAttackV1 = true;
    issueMove = hooked;
  }

  // ---- sound from the Graphics Lab on top of the game's own (shots, guns, drums) ----
  // Hooves under galloping horse, a trumpet when horse charges, spoken commands when
  // a regiment opens fire or goes in with the bayonet. Follows the game's sound button.
  const labAudio = { ctl: null, hoofAt: 0, sayAt: 0, trumpetAt: 0, charging: new Set(), regFired: new Map() };
  (function loadLabAudio() {
    const s = document.createElement('script'); s.src = 'graphics-lab/iso-audio.js?v=iso1';
    s.onload = () => { if (global.NRTSIsoAudio) labAudio.ctl = global.NRTSIsoAudio.create(); };
    document.head.appendChild(s);
  })();
  const panOf = x => Math.max(-1, Math.min(1, (x - innerWidth / 2) / (innerWidth / 2)));
  function soundTick(now) {
    const A = labAudio.ctl; if (!A) return;
    const on = !!global.__TOPDOWN_AUDIO_V265__?.enabled?.();
    if (on !== A.isOn()) A.setOn(on);
    if (!on) return;
    const onScreen = u => { const X = sx(u.x), Y = gy(u.x, u.y); return X > 0 && X < innerWidth && Y > 0 && Y < innerHeight; };
    // Hooves: one beat stream for the galloping horse in view.
    const gallop = units.filter(u => !u.dead && u.type === 'cavalry' && onScreen(u) && (view.info.get(u.id)?.speed || 0) > 4.2);
    if (gallop.length && now >= labAudio.hoofAt) {
      const c = centroid(gallop); A.hooves(panOf(sx(c.x)), Math.min(1, 0.4 + gallop.length * 0.05)); labAudio.hoofAt = now + 0.12;
    }
    for (const u of units) {
      if (u.dead || !onScreen(u)) continue;
      const charging = u.chargeTimer > 0, was = labAudio.charging.has(u.id);
      if (charging && !was) {
        labAudio.charging.add(u.id);
        if (u.type === 'cavalry' && now >= labAudio.trumpetAt) { A.trumpet(panOf(sx(u.x))); labAudio.trumpetAt = now + 4; }
        else if (u.type !== 'cavalry' && now >= labAudio.sayAt) {
          A.say(u.side === 'france' ? 'En avant! À la baïonnette!' : 'Charge!', u.side === 'france' ? 'fr-FR' : 'en-GB'); labAudio.sayAt = now + 6;
        }
      } else if (!charging && was) labAudio.charging.delete(u.id);
    }
    // A regiment opening fire after a quiet spell: the order is heard.
    for (const [id, at] of view.regFire) {
      const last = labAudio.regFired.get(id) ?? -99;
      if (at > last + 8 && now - at < 0.5 && now >= labAudio.sayAt) {
        const reg = typeof getRegiment === 'function' ? getRegiment(id) : null;
        if (reg) { A.say(reg.side === 'france' ? 'Joue! Feu!' : 'Present! Fire!', reg.side === 'france' ? 'fr-FR' : 'en-GB'); labAudio.sayAt = now + 6; }
      }
      if (at > last) labAudio.regFired.set(id, at);
    }
  }

  // ---- panning: the game pans in top-down distances; the iso ground is half as
  // high on screen, so vertical panning by keys or one finger is doubled here.
  const panTouches = new Set();
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') panTouches.add(e.pointerId); });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, e => panTouches.delete(e.pointerId));
  function panFix() {
    const last = view.lastCam; view.lastCam = { y: camera.y, zoom: camera.zoom };
    if (!last || last.zoom !== camera.zoom) return;
    const keyPan = typeof keys !== 'undefined' && (keys.has('w') || keys.has('s') || keys.has('arrowup') || keys.has('arrowdown'));
    const dy = camera.y - last.y;
    if (dy && (keyPan || panTouches.size === 1) && Math.abs(dy) < 300 / camera.zoom) {
      camera.y += dy; view.lastCam.y = camera.y; view.stats.panFixes = (view.stats.panFixes || 0) + 1;
    }
  }

  // ---- chimney smoke: thin, slow, drifting downwind ----
  // Chimneys on each model (metres along its length) and their tops.
  const CHIMNEYS = { cottage: [[-2.0, 7.1]], cottage2: [[2.0, 6.9]], farmhouse: [[2.6, 8.5]], farmhouse2: [[-2.8, 8.6], [2.8, 8.6]],
    inn: [[-3.6, 10.5], [3.6, 10.5]] };
  function chimneys(house, kind, meta, heading) {
    const list = CHIMNEYS[kind]; if (!list) return;
    const r = strHash(String(house.id || house.x) + 's'); if (r > 0.7) return;
    const now = view.lastNow, every = 0.55 + r * 0.5;
    const key = house.id || house.x + ':' + house.y;
    // Each chimney starts at its own moment, then puffs at its own pace.
    if (!view.chimneyAt.has(key)) { view.chimneyAt.set(key, now - r * every); return; }
    if (now - view.chimneyAt.get(key) < every) return;
    view.chimneyAt.set(key, now);
    const s = houseScale(house, meta), psi = heading * 2 * Math.PI / view.village.headings;
    for (const [cx, top] of list) {
      // Model x and y axes on the game's ground (y down).
      const wx = house.x + Math.cos(psi) * cx * s - Math.sin(psi) * 0.4 * s, wy = house.y - Math.sin(psi) * cx * s - Math.cos(psi) * 0.4 * s;
      view.chimneySmoke.push({ wx, wy, lift: top * s * LIFT, born: now, life: 5 + r * 3, size: 0.28 * s, seed: r });
    }
    if (view.chimneySmoke.length > 400) view.chimneySmoke.splice(0, view.chimneySmoke.length - 400);
  }
  function drawChimneySmoke(now) {
    view.chimneySmoke = view.chimneySmoke.filter(p => now - p.born < p.life);
    const img = puff('m');
    for (const p of view.chimneySmoke) {
      const age = (now - p.born) / p.life, r = (p.size + age * p.size * 3) * z();
      const x = sx(p.wx + age * p.life * 6 + Math.sin(age * 5 + p.seed * 9) * 3), y = gy(p.wx, p.wy) - (p.lift + age * p.life * 9) * z();
      ctx.globalAlpha = 0.32 * (1 - age) * Math.min(1, age * 6); ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; view.stats.chimneySmoke = view.chimneySmoke.length;
  }
  // While the terrain is baked the village roofs are cut out (their yards stay):
  // the buildings stand there instead.
  const WINGS = { farmhouse: [[-0.27, 0.53, 0.43, 0.78]], inn: [[0.2, 0.51, 0.46, 0.66]], chapel: [[0, 0, 0.34, 1.45]] };
  function withoutRoofs(fn) {
    if (!view.village || typeof drawHouseV069 !== 'function') return fn();
    const base = drawHouseV069;
    drawHouseV069 = function drawHouseYardOnlyIsoV1(house, index, village) {
      // Kinds without a rendered sheet keep their 2D roof.
      if (!view.village.kinds[kindOf(house)]) return base(house, index, village);
      ctx.save();
      ctx.beginPath(); ctx.rect(house.x - 4000, house.y - 4000, 8000, 8000);
      const c = Math.cos(house.angle), s = Math.sin(house.angle), rear = house.side > 0 ? 1 : -1;
      const hole = (cx, cy, w, h) => {
        const pts = [[-w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2]]
          .map(([u, v]) => [house.x + (cx + u) * c - (cy + v) * s, house.y + (cx + u) * s + (cy + v) * c]);
        ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath();
      };
      hole(0, 0, house.w + 2, house.h + 2);
      for (const [x, y, w, h] of WINGS[house.kind] || []) hole(x * house.w, y * rear * house.h, w * house.w + 2, h * house.h + 2);
      ctx.clip('evenodd');
      try { return base(house, index, village); } finally { ctx.restore(); }
    };
    try { return fn(); } finally { drawHouseV069 = base; }
  }
  function drawSprite(atlas, anim, f, x, y, k, pose) {
    const src = atlas && atlas.byAnim.get(anim), name = src && src.sheet.animations[anim] && src.sheet.animations[anim][f];
    if (!name) { view.stats.missing++; if (view.missingNames.size < 20) view.missingNames.add((atlas ? '' : 'noatlas:') + anim); return false; }
    const fr = src.sheet.frames[name].frame, p = src.sheet.meta.pivot, s = src.scale || 1;
    if (src.fullSrc && !MOBILE_RENDER) {
      // 'used': last drawn magnified (larger than its half-size image would be sharp).
      const now = sharp.now, magnified = k * (canvas.width / innerWidth) / src.halfScale > SHARP_AT;
      if (magnified) { src.used = now; if (s < 1 && !src.sharpening) sharpen(src, now); }
    }
    const kx = k * (pose?.scaleX || 1), ky = k * (pose?.scaleY || 1);
    drawImage(src.image, fr.x * s, fr.y * s, fr.w * s, fr.h * s, x - p.x * kx, y - p.y * ky, fr.w * kx, fr.h * ky);
    return true;
  }
  let bandageStamp = null;
  function drawBandage(x,y,k){
    if(!bandageStamp){
      bandageStamp=document.createElement('canvas');bandageStamp.width=16;bandageStamp.height=10;
      const b=bandageStamp.getContext('2d');b.fillStyle='#eee7d7';b.fillRect(0,0,16,10);b.fillStyle='#963e38';b.fillRect(6,0,4,10);
    }
    // The same sprite run keeps the dressing above the body on both renderers.
    drawImage(bandageStamp,x-3*k,y,5*k,2.7*k);
  }

  // ---- terrain: the game's static terrain, baked into tiles and laid flat ----
  const groundDetail = atmosphere.createGroundCache({ mobile: MOBILE_RENDER,
    makeCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    height: (x, y) => heightPx(x, y) * LIFT,
    describe: (x, y) => {
      if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height || waterAtV067(x, y)) return {kind:'water'};
      const road = roadNetworkAtV066(x, y);
      if (road) { const a = road.road.points[road.segmentIndex], b = road.road.points[road.segmentIndex + 1];
        return {kind:'road', angle:Math.atan2(b.y-a.y,b.x-a.x)}; }
      const kind = terrainAtV06(x, y);
      if (kind === 'open' && [[24,0],[-24,0],[0,24],[0,-24]].some(([dx,dy]) => terrainAtV06(x+dx,y+dy) === 'woods')) return {kind:'fringe'};
      return {kind};
    }
  });
  let detailRelief = null;
  function drawGroundDetail() {
    view.stats.groundDetailDraws = 0;
    if (!assetState.ready || !detailed() || z() < .85) return;
    if (detailRelief !== view.relief) { groundDetail.reset(); detailRelief = view.relief; }
    const a = isoScreenToWorld(-40, -40), b = isoScreenToWorld(innerWidth + 40, innerHeight + 40), cell = groundDetail.cell;
    const want = [], cx = camera.x / cell, cy = camera.y / cell;
    for (let y = Math.max(0,Math.floor(a.y/cell)); y <= Math.min(Math.ceil(WORLD.height/cell)-1,Math.floor(b.y/cell)); y++)
      for (let x = Math.max(0,Math.floor(a.x/cell)); x <= Math.min(Math.ceil(WORLD.width/cell)-1,Math.floor(b.x/cell)); x++) want.push([x,y]);
    want.sort((p,q) => (p[0]-cx)**2+(p[1]-cy)**2-((q[0]-cx)**2+(q[1]-cy)**2));
    // A very large viewport must not cycle more visible tiles than fit in RAM.
    // Conservatively bound each tile by the map's full relief range. Keeping
    // the nearest set stable avoids rebuilding evicted tiles every idle frame.
    const limits=groundDetail.stats(),maxLift=(view.relief?.maxM||0)*PPM*LIFT;
    const tileBytes=Math.ceil((cell+44)*.5)*Math.ceil((cell*.5+44+maxLift)*.5)*4;
    want.length=Math.min(want.length,limits.maxTiles,Math.max(1,Math.floor(limits.maxBytes/tileBytes)));
    let budget = MOBILE_RENDER ? 2 : 3;
    ctx.globalAlpha = Math.min(1,(z()-.7)/.3) * (1 - (seasonState()?.snow || 0) * .95);
    for (const [x,y] of want) {
      let tile = groundDetail.get(x,y,false);
      if (!tile && budget > 0) { tile = groundDetail.get(x,y); budget--; }
      if (!tile) continue;
      drawImage(tile.canvas,sx(tile.x),sy(tile.y/SQ),tile.width*z(),tile.height*z());
      view.stats.groundDetailDraws++;
    }
    ctx.globalAlpha = 1;
  }
  const terrainSource = () => global.__MAP_AMBIENT_MOTION_V1__?.baseTerrainDraw || null;
  function tileSetup() {
    const r = z() * Math.min(devicePixelRatio || 1, 2);
    const raster = r <= 0.35 ? 0.25 : r <= 0.7 ? 0.5 : 1;
    const px = Math.min(512, 2 ** Math.floor(Math.log2(Math.max(128, Math.min(innerWidth, innerHeight)))));
    return { raster, px, world: px / raster };
  }
  function bakeTile(key, tx, ty, T) {
    const draw = terrainSource(); if (!draw) return null;
    const tile = document.createElement('canvas'); tile.width = tile.height = T.px;
    const left = tx * T.world, top = ty * T.world, old = [camera.x, camera.y, camera.zoom];
    ctx.save();
    try {
      camera.zoom = T.raster; camera.x = left + innerWidth / (2 * T.raster); camera.y = top + innerHeight / (2 * T.raster);
      if (typeof refreshWorldViewBounds === 'function') refreshWorldViewBounds();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, T.px, T.px);
      ctx.setTransform(T.raster, 0, 0, T.raster, -left * T.raster, -top * T.raster);
      ctx.beginPath(); ctx.rect(left, top, T.world, T.world); ctx.clip();
      global.__STATIC_TERRAIN_CAPTURE_V301__ = true;
      try { withoutRoofs(draw); } finally { global.__STATIC_TERRAIN_CAPTURE_V301__ = false; }
      tile.getContext('2d').drawImage(canvas, 0, 0, T.px, T.px, 0, 0, T.px, T.px);
    } catch (err) { console.warn('iso: terrein', err); return null; }
    finally { [camera.x, camera.y, camera.zoom] = old; ctx.restore();
      if (typeof refreshWorldViewBounds === 'function') refreshWorldViewBounds(); }
    view.stats.tilesBaked++;
    return tile;
  }
  function drawGround() {
    const G = view.ground, dpr = canvas.width / Math.max(1, innerWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#31402a'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    // Only the part on screen is copied: image pixels per game pixel are k across and
    // k/2 down; game (0, 0) at height 0 sits on image row pad (room above for the
    // raised northern edge). The image already shows the relief.
    const a = flatScreenToWorld(0, 0), b = flatScreenToWorld(innerWidth, innerHeight), k = G.k, h = k / 2;
    const c0 = Math.max(0, a.x * k), c1 = Math.min(G.img.width, b.x * k);
    const r0 = Math.max(0, G.pad + a.y * h), r1 = Math.min(G.img.height, G.pad + b.y * h);
    if (c1 <= c0 || r1 <= r0) return;
    ctx.imageSmoothingEnabled = true;
    drawImage(G.img, c0, r0, c1 - c0, r1 - r0, sx(c0 / k), sy((r0 - G.pad) / h), (c1 - c0) / k * z(), (r1 - r0) / h * z() * SQ);
  }
  function drawTerrain() {
    if (view.ground) { drawGround(); view.stats.ground = true; return; }
    view.stats.ground = false;
    const T = tileSetup(), a = isoScreenToWorld(0, 0), b = isoScreenToWorld(innerWidth, innerHeight);
    const x0 = Math.max(0, Math.floor(a.x / T.world)), x1 = Math.min(Math.ceil(WORLD.width / T.world) - 1, Math.floor(b.x / T.world));
    const y0 = Math.max(0, Math.floor(a.y / T.world)), y1 = Math.min(Math.ceil(WORLD.height / T.world) - 1, Math.floor(b.y / T.world));
    let budget = 3; view.stats.tilesDrawn = 0; view.tileTick++;
    const want = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) want.push([tx, ty]);
    // Nearest the centre first, so the middle of the screen fills in first.
    const cx = (a.x + b.x) / 2 / T.world, cy = (a.y + b.y) / 2 / T.world;
    want.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy));
    const tiles = [];
    for (const [tx, ty] of want) {
      const key = (view.village ? 'v' : '') + T.raster + ':' + T.px + ':' + tx + ':' + ty;
      let t = view.tiles.get(key);
      if (!t && budget > 0) { budget--; const c = bakeTile(key, tx, ty, T); if (c) { t = { c, used: 0 }; view.tiles.set(key, t); } }
      tiles.push([tx, ty, t]);
    }
    const dpr = canvas.width / Math.max(1, innerWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#31402a'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = '#5f7448';
    ctx.fillRect(sx(0), sy(0), WORLD.width * z(), WORLD.height * z() * SQ);
    ctx.imageSmoothingEnabled = true;
    for (const [tx, ty, t] of tiles) {
      if (!t) continue;
      t.used = view.tileTick;
      const X = sx(tx * T.world), Y = sy(ty * T.world), W = T.world * z(), H = T.world * z() * SQ;
      drawImage(t.c, Math.floor(X), Math.floor(Y), Math.ceil(W + 1), Math.ceil(H + 1));
      view.stats.tilesDrawn++;
    }
    // Keep at most 96 tiles (about 100 MB at 512 px): drop the least recently used.
    if (view.tiles.size > 96) {
      [...view.tiles.entries()].sort((p, q) => p[1].used - q[1].used).slice(0, view.tiles.size - 96).forEach(([k]) => view.tiles.delete(k));
    }
  }

  // ---- per-unit animation memory ----
  function infoOf(u) {
    let m = view.info.get(u.id);
    if (!m) { m = { walk: 0, x: u.x, y: u.y, hp: u.hp, dir: dirOf(u.facing || 0), motion: presentation.create(u), firedAt: -99, reload: u.reload, meleeStrikeAt: u.meleeStrikeAt, musketShotAt: u.musketShotAt, misfiredAt: u.misfiredAt, speed: 0, alive: true, u };
      view.info.set(u.id, m); }
    return m;
  }
  function track(u, m, now, dt, visible) {
    const d = presentation.update(m.motion, u, dt, now, elapsed, visible);
    // A real observed hit can kick up a little earth at the feet. Hidden units,
    // healing, close-combat reactions, water and bridge decks produce no dust.
    if (visible && u.hp < m.hp && u.type !== 'worker' && !(u.meleeActionUntil > elapsed) &&
      !global.__CHARGE_STUMBLE_V1__?.down(u) && !waterAtV067(u.x,u.y) && !deckAt(u.x,u.y)) {
      view.impacts.push({x:u.x,y:u.y,born:now,wet:(weather()?.wetness||0)>.4,seed:hash(u.id,Math.floor(elapsed*100))});
      const max = MOBILE_RENDER ? 48 : 96;
      if (view.impacts.length > max) view.impacts.splice(0,view.impacts.length-max);
    }
    m.hp = u.hp;
    if (d < 80) m.walk += d / PPM;
    m.speed = m.motion.speed; m.moving = m.motion.moving; m.dir = m.motion.dir;
    // A shot resets the reload clock upwards: that is when the man fired.
    const t = TYPES[u.type];
    const meleeStrike = u.type === 'cavalry' && Number.isFinite(u.meleeStrikeAt) && u.meleeStrikeAt !== m.meleeStrikeAt;
    const musketShot = Number.isFinite(u.musketShotAt) && u.musketShotAt !== m.musketShotAt;
    const misfire = Number.isFinite(u.misfiredAt) && u.misfiredAt !== m.misfiredAt;
    if (meleeStrike || musketShot || (!misfire && t && t.reload > 0 && u.reload > m.reload + t.reload * 0.4)) {
      m.firedAt = now; if (!m.moving) m.dir = dirOf(u.facing || 0);
      if (u.regimentId) view.regFire.set(u.regimentId, now);
      onShot(u, m, now);
    }
    m.meleeStrikeAt = u.meleeStrikeAt;
    m.musketShotAt = u.musketShotAt;m.misfiredAt = u.misfiredAt;
    m.x = u.x; m.y = u.y; m.reload = u.reload; m.u = u;
  }
  // Muzzle smoke, a little ahead of the man at shoulder height; a cloud for a gun.
  function onShot(u, m, now) {
    const a = u.facing || 0, gun = u.type === 'artillery';
    if (u.type === 'cavalry' || u.type === 'drummer' || u.type === 'worker' || u.attackMode === 'bayonet') return;
    if (u.side !== 'france' && typeof isVisibleToFrance === 'function' && !isVisibleToFrance(u)) return;
    const reach = gun ? 2.4 : 1.1, height = gun ? 0.9 : 1.45, n = gun ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const s = hash(u.id + i * 7, Math.floor(now * 10));
      view.smoke.push({ wx: u.x + Math.cos(a) * (reach + i * 0.6) * PPM, wy: u.y + Math.sin(a) * (reach + i * 0.6) * PPM,
        h: height, born: now, facing:a, life: (gun ? 5 : 3) + s * 1.5, size: (gun ? 1.1 : 0.35) + s * (gun ? 0.8 : 0.25), seed: s });
    }
    if (gun) view.gunFire.set(u.regimentId || u.id, now);
    if (view.smoke.length > SMOKE_MAX) view.smoke.splice(0, view.smoke.length - SMOKE_MAX);
  }

  // A man's look: grenadiers and voltigeurs (troops-v1) wear the elite
  // companies' uniforms (looks 4 and 5); on the open map the line keeps to the
  // three line looks, elsewhere a few men of each company are mixed in.
  const lookOf = u => {
    const p = (u.nativeSide || u.side) === 'france' ? 'fr' : 'br', h = hash(u.id, 7), kinds = !!global.__TROOPS_V1__;
    const key = u.troop === 'grenadier' ? p + '4' : u.troop === 'voltigeur' ? p + '5'
      : u.troop === 'guard' || u.troop === 'rifle' ? p + '6' : u.troop === 'sapper' ? p + '7'
      : !kinds && h < 0.1 ? p + '4' : !kinds && h < 0.2 ? p + '5' : p + ['', '2', '3'][Math.floor(hash(u.id, 13) * 3)];
    return view.atlases[key] ? key : p;
  };
  const crewIds = new Set();
  function refreshCrew() {
    crewIds.clear();
    for (const reg of regiments) {
      if (reg.destroyed) continue;
      const members = regimentMembers(reg);
      if (!members.some(u => u.type === 'artillery')) continue;
      for (const u of members) if (u.type !== 'artillery') crewIds.add(u.id);
    }
  }

  // Officers on horseback ride the cavalry officer's horse.
  const gunKey = (u, p) => { const k = p + 'g' + (GUN_MODEL[u.troop] || ''); return view.atlases[k] ? k : p + 'g'; };
  const mountedKey = (u, p) => u.type === 'officer' && u.troop === 'mounted' && view.atlases[p + 'co'] ? p + 'co' : null;
  function cavalryKey(u, p) {
    const coat = u.troop === 'cuirassier' ? (view.atlases[p + 'ck'] ? 'k' : '2') : u.troop === 'lancer' ? 'l' : u.troop === 'greys' ? 'g'
      : u.troop === 'hussar' ? '' : (hash(u.id, 5) < 0.5 ? '' : '2');
    return mountedKey(u, p) || (view.atlases[p + 'c' + coat] ? p + 'c' + coat : p + 'c');
  }
  // Animation for one live unit: [atlas key, animation, frame].
  function frameFor(u, m, now) {
    const p = (u.nativeSide || u.side) === 'france' ? 'fr' : 'br', d = DIRS[m.dir];
    if (global.__CHARGE_STUMBLE_V1__?.down(u)) {
      const age = elapsed - u.chargeFallAt, duration = u.chargeFallUntil - u.chargeFallAt;
      const f = fallOf(u, DIRS[dirOf(u.chargeFallFacing || 0)]);
      // Fall, briefly lie down, then rise; no corpse, blood or wounded entry.
      if (f) return [f.key, f.anim, presentation.fallFrame(u.id, age, duration)];
    }
    const action = !u.routing && u.meleeActionUntil > elapsed ? u.meleeAction : null;
    const actionAge = elapsed - (u.meleeActionAt || 0), actionDir = DIRS[dirOf(u.meleeActionFacing || 0)];
    const since = now - m.firedAt, step = (_stride, n) => Math.floor(m.motion.phase * n) % n;
    if (u.type === 'cavalry' || mountedKey(u, p)) {
      // Period regiments have their own riders (troops-v1); huzaren ride the bays.
      const key = cavalryKey(u, p);
      if (action === 'recoil' || action === 'brace') return [key, 'rear_' + actionDir, Math.min(1, Math.floor(actionAge / .2))];
      if (action === 'parry') return [key, 'slash_' + actionDir, actionAge < .12 ? 0 : 2];
      if (action === 'strike') {
        const f = presentation.strikeFrame(u, elapsed);
        return [key, 'slash_' + actionDir, u.meleeVariant ? 2 - f : f];
      }
      // A real sword blow finishes even while the horse takes a small step.
      if (since >= 0 && since < 0.54) return [key, 'slash_' + DIRS[dirOf(u.facing || 0)], Math.min(2, Math.floor(since / 0.18))];
      if (m.moving) {
        const gait = m.motion.gait;
        const stride = gait === 'gallop' ? 3.6 : gait === 'trot' ? 2.8 : 2.4;
        return [key, gait + '_' + d, step(stride, 6)];
      }
      return [key, 'idle_' + d, Math.floor(now / 0.7 + hash(u.id, 3) * 2) % 2];
    }
    if (u.type === 'worker') {
      const key = p + 'w';
      if (m.moving) return [key, 'march_' + d, step(MARCH_STRIDE, 6)];
      const builder=buildingPresentation?.worker(u,now);
      if(u.task==='build'&&buildingPresentation&&!builder)return [key,'idle_'+d,Math.floor(now/.7+hash(u.id,2))%2];
      // At work, facing what he works on, with the tool of the task: the axe on a
      // tree, the pickaxe on iron ore, the hoe on a field or a berry patch, the
      // hammer on a building going up.
      if (u.task && u.task !== 'idle' && u.task !== 'return') {
        const r = u.task === 'gather' || u.task === 'mine' ? u.resourceTarget : null, b = u.task === 'build' ? u.buildingTarget : null;
        const job = b ? 'build' : u.task === 'farm' ? 'farm' : r?.type === 'iron' ? 'mine' : r?.type === 'food' ? 'farm' : 'work';
        const at = r || b, wd = at ? DIRS[dirOf(Math.atan2(at.y - u.y, at.x - u.x))] : d;
        const anim = view.atlases[key]?.byAnim.has(job + '_e') ? job : 'work';
        return [key, anim + '_' + wd, anim==='build'&&builder?builder.frame:Math.floor(now / (anim === 'build' ? 0.22 : 0.3) + hash(u.id, 3) * 4) % 4];
      }
      return [key, 'idle_' + d, Math.floor(now / 0.7 + hash(u.id, 2) * 2) % 2];
    }
    if (u.type === 'artillery') {
      const g = gunKey(u, p);
      if (m.moving) return [g, 'roll_' + d, step(1.2, 4)];
      if (since < 0.3) return [g, 'fire_' + d, since < 0.12 ? 0 : 1];
      return [g, 'idle_' + d, 0];
    }
    if (crewIds.has(u.id)) {
      if (m.moving) return [p + 'a', 'march_' + d, step(MARCH_STRIDE, 6)];
      const gun = view.gunFire.get(u.regimentId) ?? -99, t = now - gun;
      if (t < 2.4 && hash(u.id, 9) < 0.5) return [p + 'a', 'ram_' + d, Math.floor(t / 0.3) % 4];
      if (t < 2.4) return [p + 'a', 'load_' + d, Math.floor(t / 0.6) % 2];
      return [p + 'a', (hash(u.id, 11) < 0.5 ? 'ready_' : 'idle_') + d, Math.floor(now / 0.8 + hash(u.id, 2)) % 2];
    }
    if (u.type === 'officer' || u.type === 'drummer') {
      const key = p + (u.type === 'officer' ? 'o' : 'd');
      if (m.moving) return [key, 'march_' + d, step(MARCH_STRIDE, 6)];
      const busy = now - (view.regFire.get(u.regimentId) ?? -99) < 6;
      return [key, (busy ? 'command_' : 'idle_') + d, Math.floor(now / (busy ? 0.45 : 0.6)) % 2];
    }
    // Musketeers.
    const key = lookOf(u);
    if (action === 'strike') return [key, 'thrust_' + actionDir, presentation.strikeFrame(u, elapsed)];
    if (action === 'parry') return [key, 'aim_' + actionDir, actionAge < .12 ? 0 : 1];
    if (action === 'recoil') return [key, 'charge_' + actionDir, actionAge < .1 ? 0 : 1];
    const dk = view.atlases[key + ':dig'] ? key + ':dig' : p + ':dig';
    if (m.digging && !m.moving && !u.routing && view.atlases[dk]) {
      // Each man at his own pace through set, push, lever, lift, throw and back.
      return [dk, 'dig_' + DIRS[dirOf(m.digging.facing)], Math.floor(now / 0.28 + hash(u.id, 6) * 6) % 6];
    }
    if (m.parapet && view.atlases[dk]?.byAnim.has('rest_e') && (since < 0.42 || since >= 2.1)) {
      // Front rank on the parapet: musket laid on the bank, fired over it.
      const d2 = DIRS[dirOf(m.parapet.facing)];
      if (since < 0.42) return [dk, 'rfire_' + d2, Math.min(2, Math.floor(since / 0.14))];
      return [dk, 'rest_' + d2, Math.floor(now / 1.4 + hash(u.id, 2) * 2) % 2];
    }
    if (u.routing) return [key, 'rout_' + d, step(1.6, 6)];
    if (m.moving) return [key, (u.chargeTimer > 0 ? 'charge_' : 'march_') + d, step(MARCH_STRIDE, 6)];
    if (u.attackMode === 'bayonet') return [key, 'aim_' + d, 1];
    const kneel = u.volleyRank === 0 && u.volleyRanks > 1;
    if (Number.isFinite(u.misfiredAt) && elapsed-u.misfiredAt>=0 && elapsed-u.misfiredAt<.42) return [key,'misfire_'+d,Math.min(2,Math.floor((elapsed-u.misfiredAt)/.14))];
    if (Number.isFinite(u.musketShotAt)) {
      const age=elapsed-u.musketShotAt;
      if(age>=0&&age<.42)return[key,(kneel?'kfire_':'fire_')+d,Math.min(2,Math.floor(age/.14))];
      if(kneel&&age>=.42&&age<.58*(u.volleyRanks-1)+.65)return[key,'kaim_'+d,0];
    }
    if(Number.isFinite(u.musketReload)&&u.reload>0){const p=Math.max(0,Math.min(1,1-u.reload/u.musketReload));return[key,'reload_'+d,Math.min(3,Math.floor(p*4))];}
    if(u.volleyFireAt>=elapsed&&u.volleyFireAt-elapsed<.45)return[key,(kneel?'kaim_':'aim_')+d,1];
    if (since < 0.42) return [key, 'fire_' + d, Math.min(2, Math.floor(since / 0.14))];
    if (since < 2.1) return [key, 'reload_' + d, Math.min(3, Math.floor((since - 0.42) / 0.42))];
    if (now - (view.regFire.get(u.regimentId) ?? -99) < 6) return [key, 'aim_' + d, 1];
    return [key, 'idle_' + d, Math.floor((now * 1000 + u.id * 137) / 500) % 2];
  }
  // Fall: the man's own look and a fall chosen by his id; it plays once and stays.
  // The atlas and fall of a man going down facing d (null for guns and peasants).
  function fallOf(u, d) {
    const p = (u.nativeSide || u.side) === 'france' ? 'fr' : 'br', fall = ['die', 'diefwd', 'dieside'][Math.floor(hash(u.id, 4) * 3)] + '_' + d;
    if (u.type === 'cavalry') return { key: cavalryKey(u, p), anim: 'die_' + d };
    if (mountedKey(u, p)) return { key: mountedKey(u, p), anim: 'die_' + d };
    if (u.type === 'artillery' || u.type === 'worker') return null;
    if (crewIds.has(u.id)) return { key: p + 'a', anim: fall };
    return { key: u.type === 'officer' || u.type === 'drummer' ? p : lookOf(u), anim: fall };
  }
  function addCorpse(m, now) {
    const f = fallOf(m.u, DIRS[m.dir]); if (!f) return;
    // A wounded man (medics-v1) lies there alive: he is drawn with the wounded, not as a corpse.
    const w = global.__MEDICS_V1__?.byId?.(m.u.id);
    if (w) { w.iso = { ...f, t0: now }; return; }
    pushCorpse(m.x, m.y, f, now, m.u.id);
  }
  function pushCorpse(x, y, f, t0, id = 0) {
    view.corpses.push({ x, y, key: f.key, anim: f.anim, t0, id });
    if (view.corpses.length > CORPSE_MAX) view.corpses.splice(0, view.corpses.length - CORPSE_MAX);
  }
  // ---- the wounded and the stretcher teams (medics-v1) ----
  // A wounded man lies as he fell, bleeding, with a small white mark so he is told
  // from the dead; the bearers carry him off between them on a canvas stretcher.
  function medicsDrawables(list, t, k) {
    const M = global.__MEDICS_V1__; if (!M) return;
    const seen = w => w.side === 'france' || typeof isVisibleToFrance !== 'function' || isVisibleToFrance({ side: w.side, x: w.x, y: w.y });
    let lying = 0, teams = 0;
    for (const w of M.wounded()) {
      if (!w.iso) w.iso = { ...(fallOf(w.u, 'e') || { key: '', anim: '' }), t0: t - 1 };
      if (w.state === 'dead' && !w.corpse) { w.corpse = true; if (w.iso.key) pushCorpse(w.x, w.y, w.iso, w.iso.t0); continue; }
      if (w.state !== 'lying' || !seen(w)) continue;
      const X = sx(w.x), Y = gy(w.x, w.y);
      if (X < -60 || X > innerWidth + 60 || Y < -40 || Y > innerHeight + 80) continue;
      lying++;
      list.push({ y: w.y - 0.5, draw: () => {
        bloodPool(X, Y, t - w.iso.t0, hash(w.id, 7));
        drawSprite(view.atlases[w.iso.key], w.iso.anim, Math.min(3, Math.floor((t - w.iso.t0) / DIE_FRAME)), X, Y, k);
        // Alive: a small white mark over him, slowly fading in and out.
        const a = 0.55 + 0.35 * Math.sin(t * 2.4 + w.id), mr = Math.max(2.2, 3 * z()), my = Y - 0.7 * LIFT * PPM * z();
        ctx.fillStyle = `rgba(250,248,240,${a})`; ctx.beginPath(); ctx.arc(X, my, mr, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(150,20,20,${a})`; ctx.fillRect(X - mr * 0.18, my - mr * 0.6, mr * 0.36, mr * 1.2); ctx.fillRect(X - mr * 0.6, my - mr * 0.18, mr * 1.2, mr * 0.36);
      } });
    }
    for (const tm of M.teams()) {
      if (!seenTeam(tm)) continue;
      const X = sx(tm.x), Y = gy(tm.x, tm.y);
      if (X < -80 || X > innerWidth + 80 || Y < -60 || Y > innerHeight + 100) continue;
      teams++;
      const carried = tm.state === 'carry' && tm.target, c = Math.cos(tm.facing), sn = Math.sin(tm.facing), half = 0.95 * PPM;
      const ends = [[tm.x - c * half, tm.y - sn * half], [tm.x + c * half, tm.y + sn * half]].sort((a, b) => a[1] - b[1]);
      list.push({ y: tm.y, draw: () => {
        const p = (tm.nativeSide || tm.side) === 'france' ? 'fr' : 'br', d = DIRS[dirOf(tm.facing)], atlas = view.atlases[p + 'w'];
        const anim = (tm.moving ? 'march_' : 'idle_') + d, f = tm.moving ? Math.floor((t * 4 + tm.id) % 6) : Math.floor(t / 0.7 + tm.id) % 2;
        drawSprite(atlas, anim, f, sx(ends[0][0]), gy(ends[0][0], ends[0][1]), k);
        // The stretcher at the bearers' hands: two poles and the canvas between.
        const lift = 0.75 * LIFT * PPM * z(), nx = -sn * 0.3 * PPM, ny = c * 0.3 * PPM;
        const corner = (ex, ey, s) => [sx(ex + nx * s), gy(ex + nx * s, ey + ny * s) - lift];
        const a = [tm.x - c * half * 0.8, tm.y - sn * half * 0.8], b = [tm.x + c * half * 0.8, tm.y + sn * half * 0.8];
        const q = [corner(a[0], a[1], -1), corner(b[0], b[1], -1), corner(b[0], b[1], 1), corner(a[0], a[1], 1)];
        ctx.fillStyle = '#d9d1ba'; ctx.beginPath(); ctx.moveTo(...q[0]); for (const pt of q.slice(1)) ctx.lineTo(...pt); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5a4026'; ctx.lineWidth = Math.max(1, 1.6 * z()); ctx.beginPath(); ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.moveTo(...q[3]); ctx.lineTo(...q[2]); ctx.stroke();
        if (carried && tm.target.iso?.key) drawSprite(view.atlases[tm.target.iso.key], tm.target.iso.anim, 3, X, Y - lift * 0.85, k * 0.95);
        drawSprite(atlas, anim, (f + 3) % (tm.moving ? 6 : 2), sx(ends[1][0]), gy(ends[1][0], ends[1][1]), k);
      } });
    }
    st().wounded = lying; st().stretcherTeams = teams;
  }
  // ---- wildlife (wildlife-v1): deer and rabbits, seen only where France can see ----
  const WILD_KEY = { stag: 'wds', hind: 'wdh', rabbit: 'wrb' };
  function wildlifeDrawables(list, t, k) {
    const W = global.__WILDLIFE_V1__; if (!W) return;
    let n = 0;
    for (const a of W.animals()) {
      const X = sx(a.x), Y = gy(a.x, a.y);
      if (X < -60 || X > innerWidth + 60 || Y < -40 || Y > innerHeight + 60) continue;
      if (typeof isVisibleToFrance === 'function' && !isVisibleToFrance({ side: 'wild', x: a.x, y: a.y })) continue;
      const atlas = view.atlases[WILD_KEY[a.kind]]; if (!atlas) continue;
      const rabbit = a.kind === 'rabbit', d = DIRS[dirOf(a.facing)], ph = hash(a.id, 5) * 8;
      const anim = a.state === 'run' ? (rabbit ? 'hop' : 'run') : a.state === 'walk' ? (rabbit ? 'hop' : 'walk') : a.state;
      const frames = anim === 'walk' || anim === 'run' ? 6 : anim === 'hop' ? 4 : 2;
      const rate = anim === 'run' ? 0.09 : anim === 'hop' ? (a.state === 'run' ? 0.08 : 0.13) : anim === 'walk' ? 0.16 : 0.9;
      const f = Math.floor(t / rate + ph) % frames;
      list.push({ gpu: true, y: a.y, draw: () => drawSprite(atlas, anim + '_' + d, f, X, Y, k) });
      n++;
    }
    st().wildlife = n;
  }
  const seenTeam = tm => tm.side === 'france' || typeof isVisibleToFrance !== 'function' || isVisibleToFrance({ side: tm.side, x: tm.x, y: tm.y });
  const st = () => view.stats;
  // ---- hand grenades (grenades-v1): the lit grenade in its arc, the burst, the scorch ----
  const burstSeen = new WeakSet();
  function drawGrenades() {
    const G = global.__GRENADES_V1__; if (!G) return;
    for (const g of G.flying()) {
      const f = Math.min(1, (elapsed - g.t0) / g.flight), x = g.x0 + (g.x1 - g.x0) * f, y = g.y0 + (g.y1 - g.y0) * f;
      const h = (1.4 + Math.sin(f * Math.PI) * 2.6) * LIFT * PPM * z(), X = sx(x), Y = gy(x, y), r = Math.max(1.4, 1.9 * z());
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(X, Y, r * 1.1, r * 0.45, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1b1a18'; ctx.beginPath(); ctx.arc(X, Y - h, r, 0, 7); ctx.fill();
      // The fuse fizzing.
      ctx.fillStyle = Math.random() < 0.5 ? '#ffd27a' : '#ff8a2a'; ctx.beginPath(); ctx.arc(X + r * 0.8, Y - h - r * 0.9, Math.max(1, r * 0.55), 0, 7); ctx.fill();
    }
    const now = performance.now() / 1000;
    for (const b of G.bursts()) {
      const age = elapsed - b.t; if (age < 0 || age > 0.5) continue;
      const X = sx(b.x), Y = gy(b.x, b.y), R = G.config.radius * z() * (0.4 + age * 1.4);
      if (!burstSeen.has(b)) {
        burstSeen.add(b);
        // Smoke from the burst, and the bang.
        for (let i = 0; i < 6; i++) { const s = hash(b.x + i, b.y); view.smoke.push({ wx: b.x + (s - 0.5) * 30, wy: b.y + (hash(i, b.x) - 0.5) * 20, h: 0.4 + s * 0.6, born: now, life: 2.5 + s * 2, size: 0.5 + s * 0.4, seed: s }); }
        if (view.smoke.length > SMOKE_MAX) view.smoke.splice(0, view.smoke.length - SMOKE_MAX);
        try { labAudio.ctl?.cannon?.(panOf(X), true); } catch (_) {}
      }
      const a = 1 - age / 0.5, gr = ctx.createRadialGradient(X, Y - R * 0.3, 0, X, Y - R * 0.3, R);
      gr.addColorStop(0, `rgba(255,244,200,${a})`); gr.addColorStop(0.35, `rgba(255,160,60,${0.85 * a})`); gr.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(X, Y - R * 0.3, R, R * 0.8, 0, 0, 7); ctx.fill();
    }
  }
  function drawScorches() {
    const G = global.__GRENADES_V1__; if (!G) return;
    for (const c of G.scorches()) {
      const age = elapsed - c.t; if (age < 0 || age > 60) continue;
      const X = sx(c.x), Y = gy(c.x, c.y); if (X < -40 || X > innerWidth + 40 || Y < -40 || Y > innerHeight + 40) continue;
      const r = 0.75 * PPM * z(), a = Math.min(1, (60 - age) / 20);
      ctx.fillStyle = `rgba(30,24,18,${0.5 * a})`; ctx.beginPath(); ctx.ellipse(X, Y, r, r * SQ, 0, 0, 7); ctx.fill();
    }
  }
  // Blood seeping out under a fallen man: a dark pool that spreads over a few seconds.
  function bloodPool(X, Y, age, seed) {
    const g = Math.min(1, Math.max(0, age) / BLOOD_SPREAD), r = (0.25 + 0.4 * g) * PPM * z() * (0.85 + seed * 0.3);
    const ox = (seed - 0.5) * 0.5 * PPM * z();
    ctx.fillStyle = `rgba(92,10,8,${0.55 + 0.25 * g})`; ctx.beginPath(); ctx.ellipse(X + ox, Y, r, r * SQ * 0.9, seed * 2, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(55,4,4,${0.5 * g})`; ctx.beginPath(); ctx.ellipse(X + ox * 0.8, Y, r * 0.55, r * 0.55 * SQ, seed * 2, 0, 7); ctx.fill();
  }

  // ---- props for buildings and resources ----
  const BUILDING_PROP = { towncenter: 'barracks', barracks: 'barracks', house: 'cottage', stable:'barn', foundry:'barn', tower: 'tower', hospital: 'hospital' };
  const SIDED_PROPS = new Set(['barracks', 'tower', 'hospital']);
  // Two tiny cached overlays; upgraded towers still use the GPU sprite batch.
  const towerWorks = new Map();
  function towerWorksSprite(level) {
    if (towerWorks.has(level)) return towerWorks.get(level);
    const c = document.createElement('canvas'); c.width = 160; c.height = 84;
    const g = c.getContext('2d');
    for (let edge = 0; edge < 2; edge++) for (let i = 0; i < 9; i++) {
      const x = 20 + edge * 60 + i * 7.5, y = 30 + (edge ? 1 - i / 8 : i / 8) * 28;
      if (level === 2) {
        g.fillStyle = i % 2 ? '#705034' : '#8a653c';
        g.fillRect(x - 3, y - 21, 6, 23);
        g.fillStyle = '#b39462'; g.beginPath(); g.moveTo(x - 3, y - 21); g.lineTo(x, y - 26); g.lineTo(x + 3, y - 21); g.fill();
      } else {
        for (let row = 0; row < 2; row++) {
          g.fillStyle = (i + row) % 2 ? '#a99a75' : '#c0af86'; g.strokeStyle = '#75694e'; g.lineWidth = 1;
          g.beginPath(); g.ellipse(x, y - row * 7 - 3, 6, 5, edge ? -.35 : .35, 0, Math.PI * 2); g.fill(); g.stroke();
        }
      }
    }
    towerWorks.set(level, c); return c;
  }
  function buildingDrawable(b) {
    if (b.dead) return null;
    if (b.side === 'britain' && typeof isVisibleToFrance === 'function' && !isVisibleToFrance(b)) return null;
    const margin=Math.max(180,b.w*z()*2,b.h*z()*3),cx=sx(b.x),cy=gy(b.x,b.y);
    if(cx < -margin || cx > innerWidth+margin || cy < -margin || cy > innerHeight+margin)return null;
    if (b.type === 'farm') return { y: b.y, draw: () => drawFarm(b) };
    const siteArt=b.type==='mine'?global.__MINING_ART_V1__:b.type==='lumbercamp'?global.__LUMBER_ART_V1__:null;
    if (siteArt) {
      const image=siteArt.sprite(b.type,b.nativeSide||b.side),base={image,w:256,h:224,pivot:{x:128,y:144}},prop=z()>=.85&&!view.overview?buildingPresentation?.decorate(b.type,b.nativeSide||b.side,base)||base:base,k=b.w*z()*1.5/256;
      return {gpu:b.complete!==false,y:b.y+b.h*.3,cover:b.complete!==false||(b.construction||0)>=.6,box:box(sx(b.x),gy(b.x,b.y),128,144,256,224,k),draw:()=>{
        if(b.complete===false)drawConstruction(b,prop,k);
        else drawScenery(prop.image,sx(b.x)-128*k,gy(b.x,b.y)-144*k,256*k,224*k);
        view.stats.props++;
      }};
    }
    const base = BUILDING_PROP[b.type] || 'cottage', kind = SIDED_PROPS.has(base) ? base + '_' + ((b.nativeSide || b.side) === 'france' ? 'fr' : 'br') : base;
    let prop = view.props[kind]; if (!prop) return null;
    if(z()>=.85&&!view.overview)prop=buildingPresentation?.decorate(b.type,b.nativeSide||b.side,prop)||prop;
    // Fit the rendered building to the game's footprint (a little larger: the
    // props carry their eaves and yard beyond the walls).
    // A tower stands tall over the men (a bit over half true size, like a
    // house's miniature footprint would make it a stump next to them).
    const k = b.type === 'tower' ? spriteK() * 0.55 : b.type === 'hospital' ? spriteK() * 0.7 : b.w * z() * 1.45 / prop.w;
    if (b.type === 'tower') towerSmoke(b, prop, k);
    // A site whose walls are still low hides no one behind it: no see-through yet.
    return { gpu: b.complete !== false, y: b.y + b.h * 0.3, cover: b.complete !== false || (b.construction || 0) >= 0.6, box: box(sx(b.x), gy(b.x, b.y), prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
      if (b.complete === false) { drawConstruction(b, prop, k); view.stats.props++; return; }
      drawScenery(prop.image, sx(b.x) - prop.pivot.x * k, gy(b.x, b.y) - prop.pivot.y * k, prop.w * k, prop.h * k);
      if (b.type === 'tower' && b.towerLevel >= 2) {
        const w = b.w * z() * 1.8;
        drawScenery(towerWorksSprite(b.towerLevel), sx(b.x) - w / 2, gy(b.x, b.y) - w * 30 / 160, w, w * 84 / 160);
      }
      view.stats.props++;
    } };
  }
  // A building going up, in stages: first the plot pegged out with timber and
  // stone stacked by it; then the building rises from the ground, course by
  // course, a scaffold of poles and planks along the line being built and the
  // rest of it a faint outline still to come.
  // The first and last rows (0..1) of a prop's picture with anything solid in them.
  function propRows(prop) {
    if (prop.rows) return prop.rows;
    try {
      const c = document.createElement('canvas'), W = 64, H = 128; c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(prop.image, 0, 0, W, H);
      const a = g.getImageData(0, 0, W, H).data, solid = y => { for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 200) return true; return false; };
      let t = 0, b = H - 1; while (t < H - 1 && !solid(t)) t++; while (b > t && !solid(b)) b--;
      prop.rows = [t / H, (b + 1) / H];
    } catch (_) { prop.rows = [0, 1]; }
    return prop.rows;
  }
  function drawConstruction(b, prop, k) {
    if(buildingPresentation){view.stats.underConstruction=(view.stats.underConstruction||0)+1;buildingPresentation.construction(ctx,b,prop,k,sx(b.x),gy(b.x,b.y),z());return;}
    const p = Math.max(0, Math.min(1, b.construction || 0)), X = sx(b.x), Y = gy(b.x, b.y);
    view.stats.underConstruction = (view.stats.underConstruction || 0) + 1;
    const left = X - prop.pivot.x * k, top = Y - prop.pivot.y * k, w = prop.w * k, h = prop.h * k;
    // The footprint on the ground: a pegged-out plot of bare earth.
    const fw = b.w * z() * 0.62, fh = fw * SQ;
    ctx.fillStyle = 'rgba(105,82,55,.55)'; ctx.beginPath(); ctx.moveTo(X - fw, Y); ctx.lineTo(X, Y - fh); ctx.lineTo(X + fw, Y); ctx.lineTo(X, Y + fh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(70,52,32,.8)'; ctx.lineWidth = Math.max(1, z()); ctx.stroke();
    // Building materials beside it, used up as it rises: timber and stone.
    const left2 = Math.max(0, 1 - p * 1.2);
    if (left2 > 0) {
      for (let i = 0; i < 4; i++) {
        const mx = X + fw * 0.85 + i * 3 * z(), my = Y + fh * 0.45 - i * 2 * z(), len = 14 * z() * left2;
        ctx.fillStyle = i % 2 ? '#8a6a42' : '#9c7a4c'; ctx.fillRect(mx - len / 2, my - 2 * z() - i * 2.2 * z(), len, 2.4 * z());
      }
      ctx.fillStyle = '#a49c8c';
      for (let i = 0; i < Math.ceil(5 * left2); i++) ctx.fillRect(X - fw * 0.95 + (i % 3) * 4 * z(), Y + fh * 0.3 - Math.floor(i / 3) * 3 * z(), 3.5 * z(), 2.8 * z());
    }
    // Stage 1 (to 15%): only the plot, its corner stakes and a string line.
    if (p < 0.15) {
      ctx.strokeStyle = '#6b4e2e'; ctx.lineWidth = Math.max(1, 1.4 * z());
      for (const [cx, cy] of [[X - fw, Y], [X, Y - fh], [X + fw, Y], [X, Y + fh]]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 6 * z()); ctx.stroke(); }
      return;
    }
    // Stage 2: the building rises from the bottom up; above the line, a faint outline.
    // The line climbs over the building itself (its opaque rows), not the empty margin of its picture.
    const rows = propRows(prop), rise = (p - 0.15) / 0.85, cut = top + h * (rows[0] + (rows[1] - rows[0]) * (1 - rise));
    ctx.save(); ctx.globalAlpha *= 0.16; drawScenery(prop.image, left, top, w, h); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(left - 2, cut, w + 4, top + h - cut + 2); ctx.clip();
    drawScenery(prop.image, left, top, w, h); ctx.restore();
    if (rise < 0.98) {
      // The scaffold: poles from the ground to just above the line, a plank walk along it.
      const pole = '#6b4e2e', poles = 5, x0 = X - fw * 0.95, x1 = X + fw * 0.95, ground = Y + fh * 0.2;
      ctx.strokeStyle = pole; ctx.lineWidth = Math.max(1, 1.5 * z());
      for (let i = 0; i < poles; i++) {
        const px = x0 + (x1 - x0) * i / (poles - 1);
        ctx.beginPath(); ctx.moveTo(px, ground - Math.abs(i - 2) * fh * 0.4); ctx.lineTo(px, Math.min(ground, cut - 5 * z())); ctx.stroke();
      }
      ctx.fillStyle = '#9a7a50'; ctx.fillRect(x0 - 2 * z(), cut - 2 * z(), x1 - x0 + 4 * z(), 2.6 * z());
      ctx.strokeStyle = 'rgba(80,60,36,.9)'; ctx.lineWidth = Math.max(1, z());
      ctx.beginPath(); ctx.moveTo(x0, cut + 8 * z()); ctx.lineTo(x1, cut - 2 * z()); ctx.moveTo(x0, cut - 2 * z()); ctx.lineTo(x1, cut + 8 * z()); ctx.stroke();
    }
  }
  // Powder smoke from the tower's firing slits when its garrison fires (watchtower-v1).
  function towerSmoke(b, prop, k) {
    if (!b.firedAt || view.towerFired.get(b.id) === b.firedAt) return;
    view.towerFired.set(b.id, b.firedAt);
    const now = performance.now() / 1000, a = b.towerFacing || 0;
    // The slits sit about 6.3 m up the model: that height on screen, in the smoke's metres.
    const h = 6.3 * SPRITE_PPM * k * 0.87 / (LIFT * PPM * z());
    for (let i = 0; i < 3; i++) {
      const s = hash(b.id + i * 5, Math.floor(now * 10));
      view.smoke.push({ wx: b.x + Math.cos(a + (i - 1) * 0.5) * b.w * 0.45, wy: b.y + Math.sin(a + (i - 1) * 0.5) * b.h * 0.45,
        h, born: now, life: 3 + s * 1.5, size: 0.35 + s * 0.25, seed: s });
    }
    view.stats.towerVolleys = (view.stats.towerVolleys || 0) + 1;
  }
  function drawFarm(b) {
    const x = sx(b.x - b.w / 2), y = sy(b.y - b.h / 2) - liftAt(b.x, b.y), w = b.w * z(), h = b.h * z() * SQ;
    ctx.fillStyle = b.complete === false ? 'rgba(150,130,80,.55)' : '#b59b52'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90,70,30,.45)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x, y + h * i / 8); ctx.lineTo(x + w, y + h * i / 8); ctx.stroke(); }
    view.stats.props++;
  }
  function resourceDrawable(r) {
    if(r.deposit&&!r.dead&&global.__MINING_ART_V1__){
      const image=global.__MINING_ART_V1__.sprite(r.amount>0?'deposit':'empty'),k=r.radius*2*z()/256;
      const h=buildings.some(b=>!b.dead&&b.type==='mine'&&Math.hypot(b.x-r.x,b.y-r.y)<2)?188:224;
      return {gpu:true,y:r.y-.01,box:box(sx(r.x),gy(r.x,r.y),128,144,256,h,k),draw:()=>{drawScenery(image,0,0,256,h,sx(r.x)-128*k,gy(r.x,r.y)-144*k,256*k,h*k);view.stats.props++;}};
    }
    if (r.dead || r.amount <= 0) return null;
    if (r.type === 'wood') {
      const kind=tree(['oak', 'beech', 'birch', 'pine', 'spruce', 'oak', 'poplar'][Math.floor(hash(r.id, 3) * 7)]),prop=view.props[kind]; if (!prop) return null;
      const k = spriteK() * (0.55 + hash(r.id, 5) * 0.25);
      return { gpu: true, y: r.y, box: box(sx(r.x), gy(r.x, r.y), prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
        drawPlant(prop,kind,r.x,r.y, sx(r.x) - prop.pivot.x * k, gy(r.x, r.y) - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.props++; } };
    }
    if (r.type === 'iron') return { y: r.y, draw: () => drawRock(r) };
    // Berry bushes: some hawthorns with their red haws among the bushes.
    const kind=hash(r.id, 9) < 0.5 && view.props.hawthorn ? 'hawthorn' : 'bush',prop=view.props[kind]; if (!prop) return null;
    return { y: r.y, draw: () => { const k = spriteK() * 0.75;
      drawPlant(prop,kind,r.x,r.y, sx(r.x) - prop.pivot.x * k, gy(r.x, r.y) - prop.pivot.y * k, prop.w * k, prop.h * k);
      ctx.fillStyle = '#8c1f2a'; for (let i = 0; i < 5; i++) { ctx.beginPath();
        ctx.arc(sx(r.x) + (hash(r.id, i) - .5) * 18 * z(), gy(r.x, r.y) - (4 + hash(i, r.id) * 10) * z(), 1.6 * z() + .6, 0, 7); ctx.fill(); }
      view.stats.props++; } };
  }
  function drawRock(r) {
    const x = sx(r.x), y = gy(r.x, r.y), s = 9 * z() + 2;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + s * .2, y + s * .1, s * 1.2, s * .45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7c7a73'; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * .5, y - s * 1.1); ctx.lineTo(x + s * .4, y - s * 1.3);
    ctx.lineTo(x + s, y - s * .3); ctx.lineTo(x + s * .6, y + s * .2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9a978d'; ctx.beginPath(); ctx.moveTo(x - s * .5, y - s * 1.1); ctx.lineTo(x + s * .4, y - s * 1.3); ctx.lineTo(x + s * .1, y - s * .5); ctx.closePath(); ctx.fill();
    view.stats.props++;
  }
  // Workers have no sprites yet: a peasant in a smock and hat, facing his way.
  function drawWorker(u, m) {
    const x = sx(u.x), y = gy(u.x, u.y), s = z() * PPM, bob = m.moving ? Math.sin(m.walk * 7) * .04 * s : 0;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, .32 * s, .14 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4b3b2a'; ctx.fillRect(x - .16 * s, y - .8 * s * LIFT + bob, .12 * s, .8 * s * LIFT); ctx.fillRect(x + .04 * s, y - .8 * s * LIFT - bob, .12 * s, .8 * s * LIFT);
    ctx.fillStyle = u.side === 'france' ? '#c9c2a8' : '#b9b49c'; ctx.fillRect(x - .24 * s, y - 1.45 * s * LIFT, .48 * s, .72 * s * LIFT);
    ctx.fillStyle = '#d9a782'; ctx.beginPath(); ctx.arc(x, y - 1.6 * s * LIFT, .13 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d3022'; ctx.beginPath(); ctx.ellipse(x, y - 1.72 * s * LIFT, .22 * s, .07 * s, 0, 0, 7); ctx.fill();
    if (u.carry > 0) { ctx.fillStyle = u.carryType === 'wood' ? '#7a5532' : '#b58b4a'; ctx.fillRect(x + .2 * s, y - 1.3 * s * LIFT, .22 * s, .3 * s); }
    view.stats.workers++;
  }

  // ---- smoke, shot, fog, selection ----
  const PUFFS = {};
  function puff(kind) {
    if (PUFFS[kind]) return PUFFS[kind];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), dust = kind === 'dust' || kind === 'mud';
    const color = kind === 'mud' ? '77,66,47' : dust ? '163,139,101' : '237,235,225';
    // A few soft lobes are baked once instead of redrawn for every cloud.
    for (let i = 0; i < 5; i++) {
      const x = 20 + hash(i,3)*24, y = 20 + hash(i,8)*24, r = 17 + hash(i,9)*8;
      const grad = g.createRadialGradient(x,y,1,x,y,r);
      grad.addColorStop(0,`rgba(${color},${dust ? .42 : .48})`); grad.addColorStop(.5,`rgba(${color},.18)`); grad.addColorStop(1,`rgba(${color},0)`);
      g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);
    }
    return (PUFFS[kind] = c);
  }
  function drawSmoke(now) {
    view.smoke = view.smoke.filter(s => now - s.born < s.life);
    if(view.smoke.length>SMOKE_MAX)view.smoke.splice(0,view.smoke.length-SMOKE_MAX);
    const img = puff('m'), wind = global.__MAP_AMBIENT_MOTION_V1__?.currentWind?.() || {x:.72,y:-.28,strength:1};
    let drawn = 0;
    for (const s of view.smoke) {
      atmosphere.advanceSmoke(s,now,wind);
      // Smoke stays thin enough to see the men through it (thinner still in Overzicht).
      const p = atmosphere.smokeProfile(s,now), r = p.radius * PPM * z();
      const x = sx(p.x), y = gy(p.x,p.y) - p.height * LIFT * PPM * z();
      if(x+r<0||x-r>innerWidth||y+r<0||y-r>innerHeight)continue;
      ctx.globalAlpha = p.opacity * (view.overview ? .52 : 1); ctx.drawImage(img,x-r*p.stretch,y-r,r*2*p.stretch,r*2); drawn++;
    }
    ctx.globalAlpha = 1; view.stats.smoke = view.smoke.length; view.stats.smokeDraws = drawn;
  }
  function drawHitDust(now) {
    view.impacts = view.impacts.filter(p=>now-p.born<(p.wet ? .45 : .65));
    let drawn = 0;
    for(const p of view.impacts){
      const age=(now-p.born)/(p.wet ? .45 : .65),r=(5+age*(p.wet?9:17))*z()*(.9+p.seed*.2);
      const x=sx(p.x),y=gy(p.x,p.y)-Math.sin(age*Math.PI)*(p.wet?2:6)*z();
      if(x+r<0||x-r>innerWidth||y+r<0||y-r>innerHeight)continue;
      ctx.globalAlpha=(1-age)*.65*(view.overview ? .4 : 1);
      ctx.drawImage(puff(p.wet?'mud':'dust'),x-r,y-r*.65,r*2,r*1.3);drawn++;
    }
    ctx.globalAlpha=1;view.stats.hitDust=view.impacts.length;view.stats.hitDustDraws=drawn;
  }
  // Musket balls fly at shoulder height; round shot arcs from the muzzle to
  // its first graze (a shadow under it), then skips on along the ground.
  const shotFrom = new WeakMap();
  function drawProjectiles() {
    for (const p of projectiles) {
      if (p.dead) continue;
      if (!p.artillery) {
        ctx.fillStyle = 'rgba(30,28,24,.9)';
        ctx.beginPath(); ctx.arc(sx(p.x), gy(p.x, p.y) - 1.2 * LIFT * PPM * z(), Math.max(1, 1.4 * z()), 0, 7); ctx.fill();
        continue;
      }
      let from = shotFrom.get(p);
      if (!from) { from = { x: p.x, y: p.y, d: Math.max(1, Math.hypot((p.target?.x ?? p.x) - p.x, (p.target?.y ?? p.y) - p.y)) }; shotFrom.set(p, from); }
      const left = Math.hypot((p.target?.x ?? p.x) - p.x, (p.target?.y ?? p.y) - p.y), f = Math.max(0, Math.min(1, 1 - left / from.d));
      const h = (0.9 + Math.sin(f * Math.PI) * Math.min(4, from.d / PPM * 0.12)) * LIFT * PPM * z();
      const X = sx(p.x), Y = gy(p.x, p.y), r = Math.max(1.6, 2.4 * z());
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(X, Y, r * 1.2, r * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1d1c1a'; ctx.beginPath(); ctx.arc(X, Y - h, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - h - r * 0.35, r * 0.35, 0, 7); ctx.fill();
    }
  }
  // Where round shot fell (battle-depth-v1): a scorched crater that fades over
  // a minute and a half; fresh, a spray of earth and the ball skipping on.
  function drawCraters() {
    const D = global.__BATTLE_DEPTH_V1__; if (!D) return;
    let n = 0;
    for (const c of D.craters()) {
      const age = elapsed - c.t; if (age > 90 || age < 0) continue;
      const X = sx(c.x), Y = gy(c.x, c.y);
      if (X < -60 || X > innerWidth + 60 || Y < -60 || Y > innerHeight + 60) continue;
      const r = 0.9 * PPM * z(), a = Math.min(1, (90 - age) / 30);
      ctx.fillStyle = `rgba(52,40,28,${0.55 * a})`; ctx.beginPath(); ctx.ellipse(X, Y, r, r * SQ, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(28,22,15,${0.6 * a})`; ctx.beginPath(); ctx.ellipse(X, Y, r * 0.55, r * 0.55 * SQ, 0, 0, 7); ctx.fill();
      if (age < 0.9) {
        // Earth thrown up, and the ball skipping on along its line.
        ctx.fillStyle = `rgba(120,96,62,${0.8 * (1 - age / 0.9)})`;
        for (let i = 0; i < 7; i++) {
          const ang = hash(c.t * 10 + i, 3) * 7, sp = (0.6 + hash(i, c.t) * 0.8) * PPM * z() * age * 2.2;
          ctx.beginPath(); ctx.arc(X + Math.cos(ang) * sp, Y + Math.sin(ang) * sp * SQ - Math.sin(Math.min(1, age / 0.9) * Math.PI) * 0.9 * PPM * z(), Math.max(1, 1.6 * z()), 0, 7); ctx.fill();
        }
        if (age < 0.6) {
          const run = age / 0.6, bx = c.x + c.dx * run * 3.5 * PPM, by = c.y + c.dy * run * 3.5 * PPM, bh = Math.sin(run * Math.PI) * 0.8 * LIFT * PPM * z();
          ctx.fillStyle = '#1d1c1a'; ctx.beginPath(); ctx.arc(sx(bx), gy(bx, by) - bh, Math.max(1.6, 2.4 * z()), 0, 7); ctx.fill();
        }
      }
      n++;
    }
    view.stats.craters = n;
    drawScorches();
  }
  // ---- fog of war, in three shades as in the classic RTS games ----
  // Never seen: under drifting clouds. Seen before (the game's explored cells):
  // a thin haze - ground, roads and villages show, men do not. In sight: clear.
  // Edges are round and soft (explored cells as overlapping discs, blurred),
  // every shape lies on the relief, and redraws are blended into each other.
  // Two mist canvases: the newest and the one before, blended over the time
  // between redraws, so edges glide as men move instead of stepping.
  const fogA = document.createElement('canvas'), fogB = document.createElement('canvas'), fogMix = document.createElement('canvas');
  const mixCtx = fogMix.getContext('2d');
  // The masks stay on the graphics chip (their blur is cheap there); only the
  // small copy that shapes the billowing rim is read back (billowEdges).
  for (const c of [fogA, fogB]) c.getContext('2d');
  let fog = fogA, fogCtx2 = fogA.getContext('2d');
  const seenLayer = document.createElement('canvas'), seenCtx = seenLayer.getContext('2d');
  const sightLayer = document.createElement('canvas'), sightCtx = sightLayer.getContext('2d');
  const FOG_SOFT = 'filter' in fogCtx2;
  const SEEN_VEIL = 0.76;   // share of the cloud lifted over ground seen before (a thin haze stays)
  // Cloud textures: tiling fractal noise (five octaves), lit from the upper left
  // like the props - bright tops, blue-grey undersides - and thicker where the
  // noise is high. 'base' is the deck of cloud, 'wisp' a lighter, finer layer
  // drifting over it.
  function cloudTiles() {
    if (view.clouds !== undefined) return view.clouds;
    const N = 256, g = 4, rnd = [];
    for (let i = 0; i < 4096; i++) rnd.push(hash(i, 1811));
    const noise = (o, u, v, p) => { const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y,
      ax = fx * fx * (3 - 2 * fx), ay = fy * fy * (3 - 2 * fy), at = (i, j) => rnd[(o + ((j % p + p) % p) * p + ((i % p + p) % p)) % 4096];
      return (at(x, y) * (1 - ax) + at(x + 1, y) * ax) * (1 - ay) + (at(x, y + 1) * (1 - ax) + at(x + 1, y + 1) * ax) * ay; };
    const fbm = (o, x, y) => { let n = 0, amp = 0.5, p = g;
      for (let k = 0; k < 5; k++) { n += amp * noise(o + k * 997, x / N * p, y / N * p, p); amp *= 0.5; p *= 2; }
      return n / 0.97; };
    const make = (o, dense) => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const cx = c.getContext('2d'), img = cx.createImageData(N, N), F = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) F[y * N + x] = fbm(o, x, y);
      if (dense) {
        // A smoother field (three octaves) for the shape of the cloud edges.
        const E = new Float32Array(N * N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          let n = 0, amp = 0.55, p = 4;
          for (let k = 0; k < 3; k++) { n += amp * noise(o + 7001 + k * 997, x / N * p, y / N * p, p); amp *= 0.45; p *= 2; }
          E[y * N + x] = n / 0.9;
        }
        view.cloudField = E;
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const n = F[y * N + x], up = F[((y - 3 + N) % N) * N + (x - 3 + N) % N];
        // Light: brighter where the cloud rises towards the sun (upper left).
        const lit = Math.max(0, Math.min(1, 0.58 + (n - up) * 6.5 + (n - 0.5) * 0.9)), i = (y * N + x) * 4;
        img.data[i] = 104 + lit * 146; img.data[i + 1] = 114 + lit * 138; img.data[i + 2] = 134 + lit * 120;
        const thick = Math.max(0, Math.min(1, dense ? 0.55 + (n - 0.42) * 2.2 : (n - 0.45) * 2.6));
        img.data[i + 3] = 255 * (dense ? 0.86 + 0.14 * thick : 0.75 * thick);
      }
      cx.putImageData(img, 0, 0);
      return mixCtx.createPattern(c, 'repeat');
    };
    view.clouds = { base: make(0, true), wisp: make(5003, false) };
    return view.clouds;
  }
  // The fog canvas reaches FOG_M (half-size px) past each screen edge, so while
  // the camera pans it is shifted and only redrawn every 60 ms.
  const FOG_M = 64;
  // These are the exact rasterized polygons from the previous mask update.
  // Wind, cloud-edge noise and crossfades still update on their original clocks.
  const fogGeometry = { seen: null, sight: null };
  function sameFogGeometry(cache, points, w, h) {
    if (!cache || cache.x !== camera.x || cache.y !== camera.y || cache.zoom !== z() ||
        cache.w !== w || cache.h !== h || cache.relief !== view.relief || cache.points.length !== points.length) return false;
    for (let i = 0; i < points.length; i++) if (points[i] !== cache.points[i]) return false;
    return true;
  }
  function drawFogGeometry(name, c, points, segments, w, h) {
    if (sameFogGeometry(fogGeometry[name], points, w, h)) {
      view.stats.fogGeometryReuses = (view.stats.fogGeometryReuses || 0) + 1;
      return;
    }
    c.clearRect(0, 0, w, h); c.fillStyle = '#000'; c.beginPath();
    for (let i = 0; i < points.length; i += 3) groundPath(c, disc(points[i], points[i + 1], points[i + 2], segments));
    c.fill();
    fogGeometry[name] = { x: camera.x, y: camera.y, zoom: z(), w, h, relief: view.relief, points };
    const counter = name === 'seen' ? 'fogSeenBuilds' : 'fogSightBuilds';
    view.stats[counter] = (view.stats[counter] || 0) + 1;
  }
  // Redraws of the mask (ms): it is cross-faded, so a few a second look smooth.
  const FOG_REDRAW_MOVING = 180, FOG_REDRAW_STILL = 320;
  const disc = (x, y, r, n) => Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * Math.PI * 2) * r, y + Math.sin(i / n * Math.PI * 2) * r]);
  // A ground shape (game px) lifted onto the relief, at half size.
  function groundPath(c, pts) {
    c.moveTo(sx(pts[0][0]) / 2 + FOG_M, gy(pts[0][0], pts[0][1]) / 2 + FOG_M);
    for (let i = 1; i < pts.length; i++) c.lineTo(sx(pts[i][0]) / 2 + FOG_M, gy(pts[i][0], pts[i][1]) / 2 + FOG_M);
    c.closePath();
  }
  function drawFog() {
    if (typeof frenchVisionSources !== 'function' || typeof visionRadius !== 'function') return;
    const w = Math.ceil(innerWidth / 2) + 2 * FOG_M, h = Math.ceil(innerHeight / 2) + 2 * FOG_M, now = performance.now();
    for (const c of [fogA, fogB, fogMix, seenLayer, sightLayer]) if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h; view.fogCam = null; view.fogPrev = null;
      fogGeometry.seen = fogGeometry.sight = null;
    }
    // Shift since the last redraw (screen px); redraw when zoomed, shifted far, or stale.
    const F = view.fogCam, dx = F ? (F.x - camera.x) * z() : 0, dy = F ? (F.y - camera.y) * z() * SQ : 0;
    const moved = !F || F.zoom !== camera.zoom || dx !== 0 || dy !== 0;
    if (!F || F.zoom !== camera.zoom || Math.abs(dx) > FOG_M || Math.abs(dy) > FOG_M || now - view.fogAt > (moved ? FOG_REDRAW_MOVING : FOG_REDRAW_STILL)) {
      // The newest becomes the one before; draw into the other canvas.
      view.fogPrev = F && F.zoom === camera.zoom ? { canvas: fog, cam: F } : null;
      view.fogFade = Math.min(400, Math.max(50, now - view.fogAt));
      fog = fog === fogA ? fogB : fogA; fogCtx2 = fog.getContext('2d');
      view.fogCam = { x: camera.x, y: camera.y, zoom: camera.zoom }; view.fogAt = now;
      const pad = 2 * FOG_M + 2 * PPM * z(), a = isoScreenToWorld(-pad, -pad), b = flatScreenToWorld(innerWidth + pad, innerHeight + pad);
      // The cover mask: full where never seen, part where seen before, none in sight.
      const f = fogCtx2;
      f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1; f.filter = 'none'; f.clearRect(0, 0, w, h);
      f.fillStyle = '#fff'; f.fillRect(0, 0, w, h);
      // Ground seen before: a disc on every explored cell on screen (they overlap
      // into a rounded outline), lifted onto the relief.
      const seenPoints = [];
      if (typeof exploredCells !== 'undefined' && typeof EXPLORE_CELL === 'number') {
        const C = EXPLORE_CELL, gx0 = Math.floor(Math.min(a.x, b.x) / C) - 1, gx1 = Math.ceil(Math.max(a.x, b.x) / C) + 1;
        const gy0 = Math.floor(Math.min(a.y, b.y) / C) - 1, gy1 = Math.ceil(Math.max(a.y, b.y) / C) + 1 + Math.ceil((view.relief ? view.relief.maxM : 0) * PPM / C * 2);
        for (let cy = gy0; cy <= gy1; cy++) for (let cx = gx0; cx <= gx1; cx++) {
          if (!exploredCells.has(`${cx},${cy}`)) continue;
          seenPoints.push((cx + 0.5) * C, (cy + 0.5) * C, C * 0.8);
        }
      }
      drawFogGeometry('seen', seenCtx, seenPoints, 14, w, h);
      // In sight now: each source's circle, its rim lying on the relief.
      const sightPoints = [];
      for (const src of frenchVisionSources()) {
        const r = visionRadius(src);
        if (src.x + r < a.x || src.x - r > b.x || src.y + r < a.y || src.y - r > b.y + (view.relief ? view.relief.maxM * PPM * 2 : 0)) continue;
        sightPoints.push(src.x, src.y, r);
      }
      drawFogGeometry('sight', sightCtx, sightPoints, 48, w, h);
      // Cut both out of the mist, blurred so the edges are soft.
      const soft = Math.max(3, 30 * z());
      f.globalCompositeOperation = 'destination-out';
      if (FOG_SOFT) f.filter = `blur(${soft}px)`;
      f.globalAlpha = SEEN_VEIL; f.drawImage(seenLayer, 0, 0);
      if (FOG_SOFT) f.filter = `blur(${soft}px)`;
      f.globalAlpha = 1; f.drawImage(sightLayer, 0, 0);
      f.filter = 'none'; f.globalCompositeOperation = 'source-over';
      billowEdges(f, w, h, now);
      view.stats.fogCells = seenPoints.length / 3; view.stats.fogSources = sightPoints.length / 3;
    }
    const cached = view.cloudCam;
    if (cached && cached.zoom === z() && cached.maskAt === view.fogAt &&
        now - cached.at < 1000 / 15 && Math.abs((cached.x-camera.x)*z()) < 96 && Math.abs((cached.y-camera.y)*z()*SQ) < 96 &&
        cached.width === innerWidth && cached.height === innerHeight) {
      view.stats.cloudReuses = (view.stats.cloudReuses || 0) + 1; blitClouds(cached); return;
    }
    // Blend the one before into the newest (additive mix of the two at weights
    // 1-t and t is an exact cross-fade), each shifted for the camera since.
    const off = cam => [(cam.x - camera.x) * z() / 2, (cam.y - camera.y) * z() * SQ / 2];
    const t = view.fogPrev ? Math.min(1, (now - view.fogAt) / view.fogFade) : 1;
    const [ox, oy] = off(view.fogCam);
    mixCtx.globalCompositeOperation = 'source-over'; mixCtx.globalAlpha = 1; mixCtx.clearRect(0, 0, w, h);
    if (t >= 1) mixCtx.drawImage(fog, ox, oy);
    else {
      const [px, py] = off(view.fogPrev.cam);
      mixCtx.globalCompositeOperation = 'lighter';
      mixCtx.globalAlpha = 1 - t; mixCtx.drawImage(view.fogPrev.canvas, px, py);
      mixCtx.globalAlpha = t; mixCtx.drawImage(fog, ox, oy);
      mixCtx.globalCompositeOperation = 'source-over'; mixCtx.globalAlpha = 1;
    }
    drawClouds(now, w, h);
  }
  // Cloud edges: the soft ramp of the mask is pushed in or out by the cloud
  // noise (where the cloud is thick it reaches farther), then sharpened - so
  // the rim billows like a cloud instead of fading like an airbrush. Done on each
  // redraw of the mask (3-5 times a second); the noise is fixed to the ground
  // and drifts with the cloud deck. Both rims are shaped: cloud to haze over
  // ground seen before, and haze (or cloud) to clear ground in sight.
  const EDGE_SPAN = 1300, EDGE_PUSH = 1.1;
  // Shaped at half the mask's size (a quarter of its pixels), then laid back
  // smoothly: the rim is soft and the noise coarse, the look is the same and
  // each redraw of the mask reads back and walks a quarter of the pixels.
  const edgeCv = document.createElement('canvas'), edgeCtx = edgeCv.getContext('2d', { willReadFrequently: true });
  function billowEdges(f, w, h, now) {
    const F = view.cloudField; if (!F) return;
    const bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    if (edgeCv.width !== bw || edgeCv.height !== bh) { edgeCv.width = bw; edgeCv.height = bh; }
    edgeCtx.globalCompositeOperation = 'copy'; edgeCtx.drawImage(f.canvas, 0, 0, bw, bh);
    edgeCtx.globalCompositeOperation = 'source-over';
    let img;
    try { img = edgeCtx.getImageData(0, 0, bw, bh); } catch (_) { return; }
    const d = img.data, N = 256, L = 1 - SEEN_VEIL, zz = z(), drift = (now / 1000 * 9) % EDGE_SPAN;
    // Ground position of each column and row (flat; the noise needs no relief).
    const us = new Int32Array(bw), us2 = new Int32Array(bw);
    for (let x = 0; x < bw; x++) {
      const wx = ((x * 2 + 0.5 - FOG_M) * 2 - innerWidth / 2) / zz + camera.x - drift, u = wx / EDGE_SPAN * N;
      us[x] = ((Math.floor(u) % N) + N) % N; us2[x] = ((Math.floor(u * 2.1 + 91) % N) + N) % N;
    }
    for (let y = 0; y < bh; y++) {
      const wy = ((y * 2 + 0.5 - FOG_M) * 2 - innerHeight / 2) / (zz * SQ) + camera.y, v = wy / EDGE_SPAN * N;
      const row = (((Math.floor(v) % N) + N) % N) * N, row2 = (((Math.floor(v * 2.1 + 37) % N) + N) % N) * N;
      for (let x = 0, i = y * bw * 4 + 3; x < bw; x++, i += 4) {
        const a = d[i] / 255;
        if (a <= 0.004 || a >= 0.996 || Math.abs(a - L) < 0.004) continue;
        const n = 0.72 * F[row + us[x]] + 0.28 * F[row2 + us2[x]] - 0.5;
        // Which rim: between clear and haze, or between haze and cloud.
        const lo = a < L ? 0 : L, hi = a < L ? L : 1, t = (a - lo) / (hi - lo);
        let e = (t + n * EDGE_PUSH - 0.5) * 3.0 + 0.5;
        e = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
        d[i] = (lo + (hi - lo) * e) * 255;
      }
    }
    edgeCtx.putImageData(img, 0, 0);
    f.globalCompositeOperation = 'copy'; f.drawImage(edgeCv, 0, 0, w, h);
    f.globalCompositeOperation = 'source-over';
  }
  // Clouds through the cover mask: a deck and a lighter layer of wisps, each
  // drifting with the wind at its own speed, and their shadow on the ground
  // just below and to the right (the sun is upper left).
  const cloudCv = document.createElement('canvas'), cloudCtx = cloudCv.getContext('2d');
  const shadeCv = document.createElement('canvas'), shadeCtx = shadeCv.getContext('2d');
  // Drawn at a quarter of the screen size (half the mask's): clouds are soft anyway.
  function drawClouds(now, mw, mh) {
    const w = Math.ceil(mw / 2), h = Math.ceil(mh / 2), M = FOG_M / 2;
    for (const c of [cloudCv, shadeCv]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const T = cloudTiles(), sec = now / 1000, ok = T.base && T.base.setTransform && typeof DOMMatrix === 'function';
    const layer = (pat, span, vx, vy) => {
      const k = span * z() / 4 / 256, dx = (sec * vx) % span, dy = (sec * vy) % span;
      pat.setTransform(new DOMMatrix().translate(sx(dx) / 4 + M, sy(dy) / 4 + M).scale(k, k * SQ));
      cloudCtx.fillStyle = pat; cloudCtx.fillRect(0, 0, w, h);
    };
    cloudCtx.globalCompositeOperation = 'source-over'; cloudCtx.globalAlpha = 1; cloudCtx.clearRect(0, 0, w, h);
    if (ok) { layer(T.base, 2600, 9, 2); cloudCtx.globalAlpha = 0.8; layer(T.wisp, 1000, 16, -3); cloudCtx.globalAlpha = 1; }
    else { cloudCtx.fillStyle = '#c9cfd6'; cloudCtx.fillRect(0, 0, w, h); }
    cloudCtx.globalCompositeOperation = 'destination-in'; cloudCtx.drawImage(fogMix, 0, 0, w, h);
    cloudCtx.globalCompositeOperation = 'source-over';
    // Shadow: the cover, dark and faint, offset down-right.
    shadeCtx.globalCompositeOperation = 'source-over'; shadeCtx.clearRect(0, 0, w, h);
    shadeCtx.fillStyle = 'rgba(12,18,28,.32)'; shadeCtx.fillRect(0, 0, w, h);
    shadeCtx.globalCompositeOperation = 'destination-in'; shadeCtx.drawImage(fogMix, 0, 0, w, h);
    // The cloud over its own shadow, in one picture: one full-screen copy a frame, not two.
    const so = Math.max(3, 14*z()) / 4;
    shadeCtx.globalCompositeOperation = 'source-over'; shadeCtx.drawImage(cloudCv, -so, -so * 1.6);
    view.cloudCam = { x: camera.x, y: camera.y, zoom: z(), at: now, maskAt: view.fogAt, width: innerWidth, height: innerHeight };
    view.stats.cloudBuilds = (view.stats.cloudBuilds || 0) + 1;
    blitClouds(view.cloudCam);
  }
  function blitClouds(cam) {
    const dx = (cam.x-camera.x)*z(), dy = (cam.y-camera.y)*z()*SQ, so = Math.max(3, 14*z());
    ctx.drawImage(shadeCv, -2*FOG_M+so+dx, -2*FOG_M+so*1.6+dy, shadeCv.width*4, shadeCv.height*4);
  }
  // Height gives sight: on high ground a man sees farther (up to half as far
  // again on a hilltop), on the relief of this map (iso view only).
  const HEIGHT_SIGHT = 0.035, HEIGHT_SIGHT_MAX = 0.5;
  function installHeightSight() {
    if (view.heightSight || typeof visionRadius !== 'function') return;
    const base = visionRadius;
    visionRadius = function visionRadiusOnRelief(e) {
      const r = base(e);
      return view.relief && e && Number.isFinite(e.x) ? r * (1 + Math.min(HEIGHT_SIGHT_MAX, heightPx(e.x, e.y) / PPM * HEIGHT_SIGHT)) : r;
    };
    view.heightSight = true;
  }
  // Firing reach of what is selected, on the ground: one soft field with a
  // clear edge round the whole selection (each shooter's reach merged), and
  // the reach of a selected schiettoren. Enemies inside it get shot at.
  function rangeOf(u) {
    if (u.dead || u.routing) return 0;
    if (u.type === 'artillery') return u.artilleryMode === 'grape' ? 145 : TYPES.artillery?.range || 0;
    return u.type === 'infantry' ? TYPES.infantry?.range || 0 : 0;
  }
  function drawTerritories() {
    view.stats.territories = 0;
    const s = global.__TERRITORIES__?.state();
    if (!s) return;
    for (const p of s.points) {
      const X=sx(p.x),Y=gy(p.x,p.y),r=s.radius*z();
      if(X+r<0||X-r>innerWidth||Y+r<0||Y-r>innerHeight)continue;
      const color=p.owner==='france'?'#74a4ef':p.owner==='britain'?'#ef8877':'#efd88e',h=Math.max(20,28*z());
      ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.globalAlpha=.55;
      ctx.beginPath();ctx.ellipse(X,Y,r,r*SQ,0,0,Math.PI*2);ctx.stroke();
      if(p.claim){ctx.globalAlpha=.9;ctx.strokeStyle='#efb24f';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(X,Y,r,r*SQ,0,-Math.PI/2,-Math.PI/2+Math.PI*2*p.progress);ctx.stroke();}
      ctx.globalAlpha=1;ctx.strokeStyle='#ddd3b8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(X,Y);ctx.lineTo(X,Y-h);ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(X,Y-h);ctx.lineTo(X+15,Y-h+3);ctx.lineTo(X+13,Y-h+12);ctx.lineTo(X,Y-h+9);ctx.closePath();ctx.fill();
      ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#172019';ctx.strokeText(p.label,X,Y-h-6);ctx.fillStyle='#f7edcf';ctx.fillText(p.label,X,Y-h-6);ctx.restore();
      view.stats.territories++;
    }
  }
  function drawRanges() {
    const circles = [];
    for (const u of selectedUnits) { const r = rangeOf(u); if (r) circles.push([u.x, u.y, r]); }
    const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
    const tower = b && !b.dead && b.type === 'tower' && b.complete !== false ? global.__WATCHTOWER_V1__?.levelOf(b)?.range : 0;
    if (tower) circles.push([b.x, b.y, tower]);
    view.stats.rangeRings = circles.length;
    if (!circles.length) { view.stats.inReach = 0; return; }
    const W = innerWidth, H = innerHeight;
    let oc = view.rangeLayer;
    if (!oc || oc.width !== W || oc.height !== H) { oc = view.rangeLayer = document.createElement('canvas'); oc.width = W; oc.height = H; }
    const g = oc.getContext('2d'), edge = Math.max(2, 1.6 * z());
    const shape = grow => { g.beginPath(); for (const [x, y, r] of circles) { const rx = Math.max(1, r * z() + grow); g.moveTo(sx(x) + rx, gy(x, y)); g.ellipse(sx(x), gy(x, y), rx, rx * SQ, 0, 0, 7); } };
    const foe = b && tower && b.side !== 'france' || [...selectedUnits].some(u => u.side !== 'france');
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    g.fillStyle = foe ? '#ff8a7a' : '#ffe08a'; shape(0); g.fill();
    ctx.globalAlpha = 0.24; ctx.drawImage(oc, 0, 0); ctx.globalAlpha = 1;
    // The edge: what is left of the merged field once every circle, a little smaller, is cut out.
    g.globalCompositeOperation = 'destination-out'; shape(-edge); g.fill(); g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9; ctx.drawImage(oc, 0, 0); ctx.globalAlpha = 1;
    // Enemies within reach: a red mark at their feet.
    const side = b && tower ? b.side : [...selectedUnits][0]?.side;
    ctx.strokeStyle = 'rgba(235,60,45,.95)'; ctx.lineWidth = Math.max(1.5, 1.4 * z()); ctx.beginPath();
    let marked = 0;
    for (const e of units) {
      if (e.dead || e.side === side || (side === 'france' && typeof isVisibleToFrance === 'function' && !isVisibleToFrance(e))) continue;
      if (!circles.some(([x, y, r]) => (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r)) continue;
      const rr = (e.type === 'cavalry' ? 1.1 : 0.55) * PPM * z();
      ctx.moveTo(sx(e.x) + rr, gy(e.x, e.y)); ctx.ellipse(sx(e.x), gy(e.x, e.y), rr, rr * SQ, 0, 0, 7); marked++;
    }
    ctx.stroke(); view.stats.inReach = marked;
  }
  function drawSelection() {
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(245,220,112,.95)'; ctx.beginPath();
    for (const u of selectedUnits) {
      if (u.dead) continue;
      const r = (u.type === 'cavalry' ? 1.2 : u.type === 'artillery' ? 1.4 : 0.5) * PPM * z();
      ctx.moveTo(sx(u.x) + r, gy(u.x, u.y)); ctx.ellipse(sx(u.x), gy(u.x, u.y), r, r * SQ, 0, 0, 7);
    }
    ctx.stroke();
    const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
    if (b && !b.dead) { ctx.strokeRect(sx(b.x - b.w / 2), sy(b.y - b.h / 2) - liftAt(b.x, b.y), b.w * z(), b.h * z() * SQ); }
  }
  function drawDragBox() {
    if (!drag.active || !drag.moved || buildMode) return;
    const x = Math.min(drag.startX, drag.x), y = Math.min(drag.startY, drag.y), w = Math.abs(drag.x - drag.startX), h = Math.abs(drag.y - drag.startY);
    ctx.strokeStyle = 'rgba(245,220,112,.9)'; ctx.fillStyle = 'rgba(245,220,112,.12)'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  }

  // ---- the frame ----
  function render(now) {
    global.__STATIC_SPRITE_CACHE_V1__?.beginFrame();
    global.__SEASONAL_PROPS_V1__?.beginFrame();
    gpu?.beginFrame(innerWidth, innerHeight, canvas.width / Math.max(1, innerWidth), now);
    sharp.now = performance.now(); sweepSharp(sharp.now);
    const t = now / 1000, dt = view.lastNow ? Math.min(0.1, t - view.lastNow) : 0; view.lastNow = t;
    view.frames++;
    if (view.frames % 30 === 1) refreshCrew();
    const st = view.stats; st.drawn = st.sprites = st.workers = st.props = st.houses = st.dressing = st.bridges = st.onBridge = st.stances = st.digging = st.leaning = st.gabions = st.fascines = st.underConstruction = 0;
    buildingPresentation?.prepare(units,buildings);
    panFix();
    ensureAttackHook();
    gpu?.begin(ctx);
    drawTerrain();
    drawGroundDetail();
    gpu?.end();
    view.stats.trenches = 0;
    drawSeasonGround();
    drawWetGround(t);
    drawTrenchBeds(t);
    drawCraters();
    const k = spriteK(), seen = new Set(), list = [], trackWetness = Math.max(weather()?.wetness || 0,(seasonState()?.snow || 0)*.8);
    // The faint rings in the side's colour under every man, horse and gun lie on
    // the ground under everything: gathered into one path a side, filled once.
    const rings = { france: new Path2D(), britain: new Path2D() };
    const visible = u => u.side === 'france' || typeof isVisibleToFrance !== 'function' || isVisibleToFrance(u);
    // Where the front rank of each manned trench stands (across the trench).
    const frontV = new Map(), O = global.__REGIMENT_ORDERS_V1__;
    if (O?.trenches?.().length) for (const u of units) {
      if (u.dead || u.type !== 'infantry') continue;
      const tr = O.trenchAt(u.x, u.y); if (!tr) continue;
      const v = (u.x - tr.x) * Math.cos(tr.facing) + (u.y - tr.y) * Math.sin(tr.facing);
      if (v > (frontV.get(tr.id) ?? -Infinity)) frontV.set(tr.id, v);
    }
    for (const u of units) {
      if (u.dead) continue;
      seen.add(u.id);
      const onScreen = visible(u) && sx(u.x) >= -80 && sx(u.x) <= innerWidth + 80 && gy(u.x, u.y) >= -40 && gy(u.x, u.y) <= innerHeight + 140;
      const m = infoOf(u); track(u, m, t, dt, onScreen);
      if (!onScreen) {
        wetTracks.sample(u, m, trackWetness, elapsed, false); continue;
      }
      const orders = global.__REGIMENT_ORDERS_V1__, deck = deckAt(u.x, u.y);
      const sunk = !deck && (orders?.trenchAt?.(u.x, u.y) || orders?.diggingAt?.(u.x, u.y));
      const musketeer = u.type === 'infantry' && !crewIds.has(u.id);
      // Musketeers in a trench being dug are at work with the spade, deeper as it grows.
      // ...also while they revet or fortify a finished one (an upgrade bought for resources).
      m.digging = sunk && (sunk.progress < 1 || sunk.upgrade) && musketeer && orders?.diggingAt?.(u.x, u.y) ? sunk : null;
      if (m.digging) st.digging++;
      wetTracks.sample(u, m, trackWetness, elapsed, !deck && !sunk);
      // The front rank of a finished trench steps up to the parapet and leans on it.
      let wx = u.x, wy = u.y;
      m.parapet = null;
      if (sunk && sunk.progress >= 1 && !m.digging && musketeer && !m.moving && !u.routing) {
        const nx = Math.cos(sunk.facing), ny = Math.sin(sunk.facing), v = (u.x - sunk.x) * nx + (u.y - sunk.y) * ny;
        // Front rank: within half a rank of the man nearest the parapet.
        if (v > (frontV.get(sunk.id) ?? v) - 8) {
          const to = sunk.width / 2 - TRENCH_LEAN_GAP - v;
          wx += nx * to; wy += ny * to; m.parapet = sunk; st.leaning++;
        }
      }
      // The front rank stands up on the fire-step, the ranks behind down on the bed.
      // Over a bank on the near side the steep view would show him to the knees
      // from the fire-step, so he stands a little lower there: chest over the crest.
      const step = m.parapet ? (Math.sin(sunk.facing) > 0.3 ? FIRE_STEP_NEAR : FIRE_STEP) : TRENCH_SINK;
      const X = sx(wx), depth = sunk ? step * Math.min(1, sunk.progress) : 0;
      const up = deck ? deck.h * LIFT * z() : sunk ? -depth * PPM * LIFT * z() : 0, Y = gy(wx, wy) - up;
      const lift = (u.type === 'cavalry' ? 1.6 : u.type === 'artillery' ? 0.5 : 0.9) * LIFT * PPM * z();
      if (deck) st.onBridge++;
      // Men in a trench: with the bank on the near side (enemy to the south)
      // they are drawn before it and it hides them to the chest; otherwise they
      // are drawn after it, leaning on it. Among themselves they keep their
      // order (a tiny share of their own y). The near wall hides their legs.
      const ridge = sunk && sunk.y + Math.sin(sunk.facing) * (sunk.width / 2 + 7);
      const key = deck ? Math.max(u.y, deck.b.y + deck.b.width / 2 + 1)
        : sunk ? ridge + (Math.sin(sunk.facing) > 0 && !m.parapet ? -0.5 : 0.5) + (u.y - sunk.y) * 0.002 + (m.parapet ? 0.001 : 0) : u.y;
      if (sunk) st.inTrench = (st.inTrench || 0) + 1;
      // Leaning over a bank on the near side: drawn after the bank, but cut off
      // along its crest, so chest, arms and musket hang over it.
      const crest = m.parapet && Math.sin(sunk.facing) > 0 ? view.trenchCrests.get(sunk.id) : null;
      const lip = !crest && sunk && view.trenchLips.get(sunk.id);
      const rr = (u.type === 'cavalry' ? 0.95 : u.type === 'artillery' ? 1.1 : 0.42) * PPM * z(), ring = rings[u.side] || rings.britain;
      ring.moveTo(X + rr, Y); ring.ellipse(X, Y, rr, rr * SQ, 0, 0, Math.PI * 2);
      list.push({ gpu: !crest && !lip && (u.type !== 'worker' || !!view.atlases[((u.nativeSide || u.side) === 'france' ? 'fr' : 'br') + 'w']), y: key, unit: { x: X, y: Y - lift, wy: key }, draw: () => {
        if (crest) { ctx.save(); const dy = CREST_OVERHANG * PPM * LIFT * z(); clipBelowLine(crest.map(q => [q[0], q[1] + dy])); }
        else if (lip) { ctx.save(); clipAboveLip(lip); }
        if (u.type === 'worker' && !view.atlases[((u.nativeSide || u.side) === 'france' ? 'fr' : 'br') + 'w']) { drawWorker(u, m); if (crest || lip) ctx.restore(); return; }
        const [key, anim, f] = frameFor(u, m, t);
        // Until its atlas has loaded a unit is simply not drawn yet.
        const buildPose=u.type==='worker'&&!m.moving?buildingPresentation?.worker(u,t):null;
        const pose = buildPose||(!anim.startsWith('die') && !m.digging && !m.parapet && u.type !== 'artillery' ? m.motion : null);
        const dx = (pose?.dx || 0) * z(), dy = (pose?.dy || 0) * z();
        if (drawSprite(view.atlases[key], anim, f, X + dx, Y + dy, k, pose)) st.sprites++;
        if(buildPose?.contact){gpu?.end();buildingPresentation.drawWork(ctx,u,buildPose,X,Y,z());}
        if(u.injuryLevel||(Number.isFinite(u.bandagedAt)&&elapsed-u.bandagedAt<45)){
          const by=Y+dy-(u.type==='cavalry'?1.9:1.1)*LIFT*PPM*z()*(pose?.scaleY || 1);
          drawBandage(X+dx,by,z());
        }
        if (crest || lip) ctx.restore();
      } });
      st.drawn++;
    }
    // Men who fell (or left the list) since the last frame.
    for (const [id, m] of view.info) {
      if (seen.has(id)) continue;
      if (m.alive && visible(m.u) && (!global.__ONLINE_MATCH_V1__?.active || m.u.dead)) addCorpse(m, t);
      view.info.delete(id);
    }
    for (const c of view.corpses) {
      const X = sx(c.x), Y = gy(c.x, c.y);
      if (X < -60 || X > innerWidth + 60 || Y < -40 || Y > innerHeight + 80) continue;
      list.push({ y: c.y - 0.5, draw: () => { bloodPool(X, Y, t - c.t0, hash(c.x, c.y)); drawSprite(view.atlases[c.key], c.anim, presentation.fallFrame(c.id, t - c.t0), X, Y, k); } });
    }
    st.corpses = view.corpses.length;
    medicsDrawables(list, t, k);
    wildlifeDrawables(list, t, k);
    for (const b of buildings) { const d = buildingDrawable(b); if (d) list.push(d); }
    for (const h of villageHouses()) { const d = houseDrawable(h); if (d) list.push(d); }
    for (const b of crossings()) { const d = bridgeDrawable(b); if (d) list.push(d); }
    for (const tr of trenchList()) { const d = parapetDrawable(tr); if (d) list.push(d); list.push(...revetmentDrawables(tr)); }
    if (view.village && view.props.well && !view.dressing) view.dressing = buildDressing();
    for (const it of view.dressing || []) { const d = dressingDrawable(it); if (d) list.push(d); }
    if (view.props.oak && !view.woodTrees) view.woodTrees = buildWoodTrees();
    for (const tr of view.woodTrees || []) { const d = woodTreeDrawable(tr); if (d) list.push(d); }
    for (const r of resources) {
      const X = sx(r.x), Y = gy(r.x, r.y);
      if (X < -120 || X > innerWidth + 120 || Y < -30 || Y > innerHeight + 260) continue;
      const d = resourceDrawable(r); if (d) list.push(d);
    }
    drawRanges();
    drawSelection();
    drawOrders(t);
    ctx.fillStyle = 'rgba(70,110,230,.38)'; ctx.fill(rings.france);
    ctx.fillStyle = 'rgba(225,60,50,.38)'; ctx.fill(rings.britain);
    list.sort((p, q) => p.y - q.y);
    const men = list.filter(d => d.unit), covered = new Set();
    st.seeThrough = 0;
    for (const d of list) {
      if (d.gpu) gpu?.begin(ctx); else gpu?.end();
      if (!d.box) { d.draw(); continue; }
      // Scenery with a soldier behind it (inside its picture) turns see-through.
      const [x0, y0, x1, y1] = d.box, ix = (x1 - x0) * 0.12, iy = (y1 - y0) * 0.08;
      let a = view.overview ? OVERVIEW_ALPHA : 1;
      let covering=false;
      if (d.cover !== false) for (const man of men) { const p=man.unit; if (p.wy < d.y && p.x > x0 + ix && p.x < x1 - ix && p.y > y0 + iy && p.y < y1 - iy) { covering=true; covered.add(man); } }
      if(covering){a=Math.min(a,COVER_ALPHA);st.seeThrough++;}
      ctx.globalAlpha = a; d.draw(); ctx.globalAlpha = 1;
    }
    // Several faded crowns can still hide a soldier. Reuse only the covered
    // visible unit drawables in depth order, including their trench clipping.
    // This adds no textures, world scans or information from outside vision.
    st.readabilityOverlays=covered.size;
    for(const man of men)if(covered.has(man)){if(man.gpu)gpu?.begin(ctx);else gpu?.end();man.draw();}
    gpu?.end();
    drawProjectiles();
    drawGrenades();
    drawStances();
    if (detailed()) drawChimneySmoke(t);
    drawSmoke(t);
    drawHitDust(t);
    drawFog();
    drawTerritories();
    drawWeather(t);
    drawDayNight();
    drawDragBox();
    drawFacingArrow();
    soundTick(t);
    if (now - view.miniAt > 200 && typeof drawMinimap === 'function') { view.miniAt = now; try { drawMinimap(); } catch (_) {} }
  }

  // ---- hooks: the game's frame calls renderStableFrameV1(draw) when it exists ----
  let inner = global.renderStableFrameV1;
  function stableFrame(drawGame, now) {
    if (!assetState.ready) return;
    if (!view.on) return typeof inner === 'function' ? inner(drawGame, now) : drawGame();
    // The game is drawn in the iso view only: the 2D renderer does not run at all
    // (its effect lists are capped where they are filled; exploring is simulation).
    const t0 = performance.now();
    const oldWidth = frameWidth, oldHeight = frameHeight;
    frameWidth = innerWidth; frameHeight = innerHeight;
    try { render(now); view.stats.renderMs = Math.round((view.stats.renderMs * 0.9 + (performance.now() - t0) * 0.1) * 10) / 10; }
    finally {
      gpu?.end(); const dpr = canvas.width / Math.max(1, frameWidth); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frameWidth = oldWidth; frameHeight = oldHeight;
    }
  }
  Object.defineProperty(global, 'renderStableFrameV1', { configurable: true, get: () => stableFrame, set: v => { inner = v; } });

  // A click on a man's body (above his feet) selects him, as a click on his feet would.
  function snapToBody(wx, wy) {
    if (!view.on) return null;
    const px = sx(wx), py = gy(wx, wy), reach = Math.max(14, 26 * z());
    let best = null, bd = reach;
    for (const u of units) {
      if (u.dead) continue;
      const lift = ((u.type === 'cavalry' ? 1.6 : u.type === 'artillery' ? 0.5 : 0.9) * PPM + (deckAt(u.x, u.y)?.h || 0)) * LIFT * z();
      const d = Math.hypot(sx(u.x) - px, gy(u.x, u.y) - lift - py);
      if (d < bd) { best = u; bd = d; }
    }
    return best;
  }
  // A man clicked on is chosen before the building behind him: the click lands on
  // his feet, and men by a barracks door stand within its footprint.
  function selectUnitDirect(u, add) {
    if (!add) selectedUnits.clear();
    selectedBuilding = null;
    const reg = u.regimentId && typeof getRegiment === 'function' ? getRegiment(u.regimentId) : null;
    if (reg) { regimentMembers(reg).forEach(m => selectedUnits.add(m)); currentFormation = reg.formation; }
    else if (add && selectedUnits.has(u)) selectedUnits.delete(u);
    else selectedUnits.add(u);
    actionSignature = ''; updateHud(true);
  }
  if (typeof selectPoint === 'function') {
    const baseSelectPoint = selectPoint;
    selectPoint = function selectPointIsoV1(x, y, add) {
      const u = snapToBody(x, y);
      if (u && u.side === 'france') { view.stats.unitPicks = (view.stats.unitPicks || 0) + 1; return selectUnitDirect(u, add); }
      return u ? baseSelectPoint(u.x, u.y, add) : baseSelectPoint(x, y, add);
    };
  }
  // What the pointer is on, by what is drawn there: a tree's crown or a
  // building's roof counts, not only the ground under the cursor (which lies
  // behind what stands up from it).
  function pickDrawn(list, drawableOf, px, py) {
    let best = null, bd = Infinity;
    for (const o of list) {
      if (o.dead) continue;
      const X = sx(o.x), Y = gy(o.x, o.y);
      if (X < -250 || X > innerWidth + 250 || Y < -120 || Y > innerHeight + 450) continue;
      const d = drawableOf(o); if (!d) continue;
      const r = 14 + 22 * z();
      const [x0, y0, x1, y1] = d.box || [X - r, Y - r * 1.6, X + r, Y + r * 0.4];
      const ix = (x1 - x0) * 0.15;
      if (px < x0 + ix || px > x1 - ix || py < y0 + (y1 - y0) * 0.12 || py > y1) continue;
      // Of overlapping pictures, the one in front (drawn last) is what the eye sees.
      if (-o.y < bd) { bd = -o.y; best = o; }
    }
    return best;
  }
  if (typeof resourceAt === 'function') {
    const baseResourceAt = resourceAt;
    resourceAt = function resourceAtIsoV1(wx, wy) {
      if (!view.on) return baseResourceAt(wx, wy);
      const p = isoWorldToScreen(wx, wy);
      return pickDrawn(resources.filter(r => r.amount > 0), resourceDrawable, p.x, p.y) || baseResourceAt(wx, wy);
    };
  }
  if (typeof buildingAt === 'function') {
    const baseBuildingAt = buildingAt;
    buildingAt = function buildingAtIsoV1(wx, wy, side = null) {
      if (!view.on) return baseBuildingAt(wx, wy, side);
      const p = isoWorldToScreen(wx, wy);
      return pickDrawn(buildings.filter(b => !side || b.side === side), buildingDrawable, p.x, p.y) || baseBuildingAt(wx, wy, side);
    };
  }
  // ---- weather (weather-v1): wet ground darkens and gathers puddles, and
  // whatever crosses it leaves tracks - boots, hooves, wheel ruts - that fade
  // as it dries; rain falls slanting with the wind, fog and cloud veil the
  // field. ----
  const TRACK_CAPACITY = 2600;
  const wetTracks = global.__WET_TRACKS_V1__.create({ capacity: TRACK_CAPACITY, ppm: PPM });
  const weather = () => global.__WEATHER_V1__?.state?.();
  // Small reusable vector stamps, matching the sprites' eight headings. There
  // are no image uploads or per-track canvas contexts. Hooves are open-backed
  // horseshoes, boots have a separate heel, wheels keep their paired ruts.
  const trackShapes = Array.from({ length: 8 }, (_, dir) => {
    const ca = Math.cos(dir * Math.PI / 4), sa = Math.sin(dir * Math.PI / 4);
    const polygon = (path, points, along = 0, across = 0) => {
      points.forEach(([d, e], i) => {
        d += along; e += across;
        const x = ca * d - sa * e, y = (sa * d + ca * e) * SQ;
        if (i) path.lineTo(x, y); else path.moveTo(x, y);
      }); path.closePath();
    };
    const boots = [0, 1].map(step => {
      const p = new Path2D(), across = step ? 0.14 : -0.14;
      polygon(p, [[-.04,-.085],[.14,-.085],[.20,-.04],[.20,.04],[.14,.085],[-.04,.085]], 0, across);
      polygon(p, [[-.19,-.075],[-.09,-.075],[-.09,.075],[-.19,.075]], 0, across); return p;
    });
    const hoof = new Path2D(), wheel = new Path2D();
    const shoe = [[-.10,-.10],[.06,-.12],[.14,-.06],[.16,0],[.14,.06],[.06,.12],[-.10,.10],[-.10,.045],[.04,.055],[.085,0],[.04,-.055],[-.10,-.045]];
    for (const [d,e] of [[.3,.23],[.3,-.23],[-.4,.2],[-.4,-.2]]) polygon(hoof, shoe, d, e);
    for (const e of [.75,-.75]) polygon(wheel, [[-.4,-.055],[.4,-.055],[.4,.055],[-.4,.055]], 0, e);
    return { boots, hoof, wheel };
  });
  const trackBatches = Array.from({ length: 16 }, () => ({ path: null, count: 0 }));
  const trackMatrix = new DOMMatrix(), trackOpacity = new Uint8Array(TRACK_CAPACITY);
  let trackCache = null;
  function clearTrackPaths() {
    trackCache = null;
    for (const batch of trackBatches) { batch.path = null; batch.count = 0; }
  }
  function drawWetGround(now) {
    const w = weather(); if (!w) return;
    const snow=seasonState()?.snow||0,wet=Math.max(w.wetness,snow*.8),surfaceWet=w.wetness*(1-snow);
    if (surfaceWet > 0.02) {
      // Soaked earth and grass: darker, a little cooler.
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(150,158,170,${0.55 * surfaceWet})`; ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = 'source-over';
      // Puddles in low spots (a fixed scatter over the map), reflecting the sky.
      if (surfaceWet > 0.35) {
        const cell = 150, x0 = flatScreenToWorld(-60, -60), x1 = flatScreenToWorld(innerWidth + 60, innerHeight + 60);
        for (let gx = Math.floor(x0.x / cell); gx <= Math.ceil(x1.x / cell); gx++) for (let gyy = Math.floor(x0.y / cell); gyy <= Math.ceil(x1.y / cell); gyy++) {
          if (hash(gx * 92821 + gyy, 7) > 0.22) continue;
          const wx = (gx + hash(gx, gyy)) * cell, wy = (gyy + hash(gyy, gx + 3)) * cell, r = (8 + hash(gx + 5, gyy) * 16) * z() * Math.min(1, (surfaceWet - 0.35) * 2.5);
          const X = sx(wx), Y = gy(wx, wy);
          const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
          g.addColorStop(0, 'rgba(112,126,138,.42)'); g.addColorStop(0.6, 'rgba(84,92,98,.34)'); g.addColorStop(0.85, 'rgba(58,50,40,.25)'); g.addColorStop(1, 'rgba(58,50,40,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, r * 1.4, r * SQ, hash(gx, gyy + 9) * 0.6, 0, 7); ctx.fill();
        }
      }
    }
    // One bounded ring, pruned even when no new unit crosses it. The existing
    // fog is drawn later and still covers unknown ground and enemy trails.
    wetTracks.prune(elapsed, wet);
    view.stats.tracks = view.stats.trackDrawCalls = 0;
    const store = wetTracks.stats();
    if (!store.count) { clearTrackPaths(); return; }
    const life = wetTracks.lifetime(wet), scale = PPM * z();
    let opacityIndex = 0;
    wetTracks.forEach(tr => {
      const alpha = Math.min(1, (1 - (elapsed - tr.t) / life) * 1.4) * (0.5 + 0.5 * Math.max(wet, 0.3));
      trackOpacity[opacityIndex++] = Math.min(15, Math.max(0, Math.round(alpha * 15)));
    });
    const C = trackCache;
    let same = C && C.emitted === store.emitted && C.count === store.count && C.x === camera.x && C.y === camera.y &&
      C.zoom === z() && C.w === innerWidth && C.h === innerHeight && C.relief === view.relief;
    if (same) for (let i = 0; i < store.count; i++) if (trackOpacity[i] !== C.opacity[i]) { same = false; break; }
    let n = same ? C.drawn : 0;
    if (same) view.stats.trackCacheReuses = (view.stats.trackCacheReuses || 0) + 1;
    else {
      clearTrackPaths();
      let index = 0;
      trackMatrix.a = trackMatrix.d = scale;
      wetTracks.forEach(tr => {
        const bucket = trackOpacity[index++];
        const X = sx(tr.x), Y = gy(tr.x, tr.y);
        if (X < -30 || X > innerWidth + 30 || Y < -30 || Y > innerHeight + 30) return;
        const batch = trackBatches[bucket];
        if (!bucket) return;
        if (!batch.path) batch.path = new Path2D();
        trackMatrix.e = X; trackMatrix.f = Y;
        const stamp = trackShapes[tr.direction];
        batch.path.addPath(tr.kind === 'boot' ? stamp.boots[tr.step] : stamp[tr.kind], trackMatrix);
        batch.count++; n++;
      });
      trackCache = { emitted: store.emitted, count: store.count, x: camera.x, y: camera.y, zoom: z(),
        w: innerWidth, h: innerHeight, relief: view.relief, opacity: trackOpacity.slice(0, store.count), drawn: n };
      view.stats.trackCacheBuilds = (view.stats.trackCacheBuilds || 0) + 1;
    }
    ctx.fillStyle = '#38291c';
    let draws = 0;
    for (let i = 1; i < trackBatches.length; i++) {
      const batch = trackBatches[i]; if (!batch.count) continue;
      ctx.globalAlpha = i / 15 * 0.72; ctx.fill(batch.path); draws++;
    }
    ctx.globalAlpha = 1; view.stats.tracks = n; view.stats.trackDrawCalls = draws;
  }

  function drawDayNight() {
    const light = global.__DAY_NIGHT_V1__?.state();
    view.stats.dayNight = light || null; view.stats.dayNightDraws = 0;
    if (!light?.tint) return;
    // Grade the battlefield, fog and weather together. The DOM HUD and the
    // drag/facing feedback drawn afterwards retain their original brightness.
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = light.tint; ctx.fillRect(0, 0, frameWidth || innerWidth, frameHeight || innerHeight); ctx.restore();
    view.stats.dayNightDraws = 1;
  }
  function drawWeather(now) {
    const w = weather(); if (!w) return;
    const W = innerWidth, H = innerHeight;
    if (w.dark > 0.01) { ctx.fillStyle = `rgba(28,34,46,${0.5 * w.dark})`; ctx.fillRect(0, 0, W, H); }
    if (w.fog > 0.01) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(214,219,224,${0.6 * w.fog})`); g.addColorStop(0.55, `rgba(214,219,224,${0.4 * w.fog})`); g.addColorStop(1, `rgba(214,219,224,${0.28 * w.fog})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (w.rain > 0.02) {
      // Streaks slanting with the wind, a fixed set wrapped over the screen.
      const wind = global.__MAP_AMBIENT_MOTION_V1__?.currentWind?.() || { x: 0.4, y: 0 };
      const vx = Math.max(-1, Math.min(1, wind.x)) * 160, vy = 620, len = 16, nx = vx / Math.hypot(vx, vy), ny = vy / Math.hypot(vx, vy);
      const n = Math.round((W * H / 3600) * w.rain),snow=seasonState()?.snow||0,flakes=Math.round(n*snow),drops=n-flakes;
      ctx.strokeStyle = 'rgba(205,214,228,.38)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < drops; i++) {
        const x = ((hash(i, 1) * (W + 200) + now * vx * (0.8 + hash(i, 2) * 0.4)) % (W + 200) + (W + 200)) % (W + 200) - 100;
        const y = ((hash(i, 3) * (H + 100) + now * vy * (0.8 + hash(i, 4) * 0.4)) % (H + 100)) - 50;
        ctx.moveTo(x, y); ctx.lineTo(x - nx * len, y - ny * len);
      }
      if(drops)ctx.stroke();
      if(flakes){
        ctx.fillStyle='rgba(244,248,252,.82)';ctx.beginPath();
        for(let i=0;i<flakes;i++){
          const x=((hash(i,21)*(W+100)+now*vx*.25+Math.sin(now*.7+i)*9)%(W+100)+(W+100))%(W+100)-50;
          const y=(hash(i,23)*(H+40)+now*(45+hash(i,24)*35))%(H+40)-20,r=1+hash(i,25)*1.2;
          ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);
        }ctx.fill();
      }
      view.stats.rainDrops = drops;view.stats.snowFlakes=flakes;view.stats.precipitationParticles=n;
    } else view.stats.rainDrops = view.stats.snowFlakes = view.stats.precipitationParticles = 0;
  }
  // ---- trenches (regiment-orders-v1): a rounded cut in the ground whose far
  // wall shows its depth, the parapet of thrown-up earth towards the enemy,
  // earth flying while it is dug. Men in it stand down on the bed (the near
  // wall hides them below the lip); the front rank leans on the parapet ----
  // CREST_OVERHANG: how far (m, on screen) below the crest a man leaning over it still
  // shows: his forearms and musket lie on the far side of the bank.
  const DITCH_FROM = 34, DITCH_TO = 50, GABION_GAP = 1.25;
  const TRENCH_SINK = 1.1, FIRE_STEP = 0.5, FIRE_STEP_NEAR = 0.9, PARAPET_H = 0.5, TRENCH_LEAN_GAP = 3, CREST_OVERHANG = 0.12;
  const trenchList = () => global.__REGIMENT_ORDERS_V1__?.trenches?.() || [];
  function trenchFrame(t) {
    const ax = Math.cos(t.facing + Math.PI / 2), ay = Math.sin(t.facing + Math.PI / 2), nx = Math.cos(t.facing), ny = Math.sin(t.facing);
    const half = t.length / 2, w = t.width / 2;
    const at = (u, v, up = 0) => { const x = t.x + ax * u + nx * v, y = t.y + ay * u + ny * v; return [sx(x), gy(x, y) - up * PPM * LIFT * z()]; };
    // Half-width of the cut along its length: straight sides, round ends.
    const across = u => { const e = Math.max(0, Math.abs(u) - (half - w)) / w; return e >= 1 ? 0 : w * Math.sqrt(1 - e * e); };
    return { half, w, at, across, ny };
  }
  // Outline of the cut (or of the bed, inset and lowered), a little uneven: dug by hand.
  function trenchOutline(t, f, inset = 0, up = 0, grow = 0) {
    const n = Math.max(12, Math.round(f.half / 5)), pts = [];
    for (let side = 1; side >= -1; side -= 2) for (let i = 0; i <= n; i++) {
      const u = (side > 0 ? -1 : 1) * f.half * Math.cos(Math.PI * i / n) * (1 + grow / f.half), wob = 1 + 0.08 * (hash(t.id * 7 + i, side + 3) - 0.5);
      pts.push(f.at(u, side * Math.max(0, f.across(u / (1 + grow / f.half)) * wob - inset + grow), up));
    }
    return pts;
  }
  function smoothFill(pts, fill) {
    // Closed curve through the midpoints, so the cut has no corners.
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = pts.length;
    ctx.beginPath(); const m0 = mid(pts[n - 1], pts[0]); ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function poly(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
  // Clip to everything above the near lip of a cut (screen space), so the men
  // standing in it are hidden below ground by its near wall.
  function clipAboveLip(lip) {
    // The near lip is the lower envelope of the outline: for each screen x the
    // lowest point of the cut there.
    let x0 = Infinity, x1 = -Infinity;
    for (const p of lip) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
    const low = [], n = 28;
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * Math.min(1, Math.max(0, k / n)) + (k === 0 ? 0.01 : k === n ? -0.01 : 0);
      let y = -Infinity;
      for (let i = 0; i < lip.length; i++) {
        const a = lip[i], b = lip[(i + 1) % lip.length];
        if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
        y = Math.max(y, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
      }
      if (y > -Infinity) low.push([x, y]);
    }
    clipBelowLine(low);
  }
  // Clip away what lies below a line running left to right across the screen
  // (only between its ends).
  function clipBelowLine(low) {
    if (low.length < 2) return;
    // Only below the lip and between its ends: beside the cut (a muzzle over
    // the bank of a trench running up the screen) nothing is cut away.
    ctx.beginPath(); ctx.moveTo(-1e4, -1e4); ctx.lineTo(-1e4, 1e4); ctx.lineTo(low[0][0], 1e4);
    for (const p of low) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(low[low.length - 1][0], 1e4); ctx.lineTo(1e4, 1e4); ctx.lineTo(1e4, -1e4); ctx.closePath(); ctx.clip();
  }
  function drawTrenchBeds(now) {
    view.trenchLips.clear(); view.trenchCrests.clear();
    for (const t of trenchList()) {
      const X = sx(t.x), Y = gy(t.x, t.y);
      if (X < -400 || X > innerWidth + 400 || Y < -200 || Y > innerHeight + 200) continue;
      const f = trenchFrame(t), { half, w, at } = f, p = Math.min(1, t.progress), depth = TRENCH_SINK * p;
      const lip = trenchOutline(t, f);
      view.trenchLips.set(t.id, lip);
      const ps = parapetShape(t, f);
      view.trenchCrests.set(t.id, ps.us.map(u => at(u, ps.lipV(u) + 7, ps.lift(u))).sort((a, b) => a[0] - b[0]));
      // The ditch dug in front of the parapet (enemy side): a shallow trough,
      // its far bank catching the light.
      if (p >= 0.5) {
        const dn = ps.us.map(u => u * 1.04), inner = dn.map(u => at(u, ps.lipV(u / 1.04) + DITCH_FROM)), outer = dn.map(u => at(u, ps.lipV(u / 1.04) + DITCH_TO));
        const [gx0, gy0] = at(0, w + DITCH_FROM), [gx1, gy1] = at(0, w + DITCH_TO), dg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        dg.addColorStop(0, 'rgba(78,64,42,.85)'); dg.addColorStop(0.45, 'rgba(46,37,25,.95)'); dg.addColorStop(0.8, 'rgba(70,58,38,.9)'); dg.addColorStop(1, 'rgba(120,104,70,.55)');
        ctx.globalAlpha = Math.min(1, (p - 0.5) * 2);
        smoothFill([...inner, ...outer.slice().reverse()], dg);
        ctx.globalAlpha = 1;
      }
      // Trodden, spoil-strewn ground round the cut.
      ctx.globalAlpha = 0.5 + 0.5 * p;
      smoothFill(trenchOutline(t, f, 0, 0, 7), 'rgba(104,86,58,.55)');
      smoothFill(trenchOutline(t, f, 0, 0, 3), 'rgba(92,74,50,.8)');
      ctx.globalAlpha = 1;
      // The cut: inside the lip the far wall runs down to the bed; the bed is
      // narrower (sloped walls) and lies the depth lower on screen.
      ctx.save(); smoothFill(lip); ctx.clip();
      const dpx = depth * PPM * LIFT * z(), ys = lip.map(q => q[1]), top = Math.min(...ys), bottom = Math.max(...ys) + dpx;
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, '#7a6242'); g.addColorStop(0.45, '#4d3c28'); g.addColorStop(1, '#2a2016');
      ctx.fillStyle = g; ctx.fillRect(-1e4, top - 2, 2e4, bottom - top + 4);
      // Once dug, the walls are revetted with fascines (Blender brushwood
      // bundles), darker towards the bottom.
      const tile = view.props.fascine_wall;
      // Fascines come with level 2 (bought), growing in while the men put them up.
      const lvl = t.level || 1, revet = lvl >= 2 ? 1 : t.upgrade?.to === 2 ? t.upgrade.progress : 0;
      if (tile && p > 0.6 && revet > 0) {
        if (!tile.pattern) tile.pattern = ctx.createPattern(tile.image, 'repeat');
        const k = PPM * z() / tile.pxPerM;
        tile.pattern.setTransform(new DOMMatrix([k, 0, 0, k, sx(t.x), top]));
        ctx.globalAlpha = Math.min(1, (p - 0.6) / 0.4) * revet; ctx.fillStyle = tile.pattern; ctx.fillRect(-1e4, top - 2, 2e4, bottom - top + 4);
        const sh = ctx.createLinearGradient(0, top, 0, bottom);
        sh.addColorStop(0, 'rgba(20,14,8,0)'); sh.addColorStop(1, 'rgba(20,14,8,.6)');
        ctx.fillStyle = sh; ctx.fillRect(-1e4, top - 2, 2e4, bottom - top + 4); ctx.globalAlpha = 1;
        view.stats.fascines = (view.stats.fascines || 0) + 1;
      }
      // Layers of soil showing in the far wall.
      ctx.strokeStyle = 'rgba(30,22,14,.28)'; ctx.lineWidth = Math.max(0.6, 0.8 * z());
      for (const k of [0.3, 0.62]) { smoothFill(trenchOutline(t, f, w * 0.12 * k, -depth * k)); ctx.stroke(); }
      smoothFill(trenchOutline(t, f, w * 0.18, -depth), '#3b2e20');
      // The fire-step along the parapet wall: a ledge the front rank stands on.
      if (p > 0.5) {
        const n = Math.max(8, Math.round(half / 6)), us = [];
        for (let i = 0; i <= n; i++) us.push(-(half - w * 0.4) * Math.cos(Math.PI * i / n));
        const step = FIRE_STEP * p, edge = us.map(u => at(u, f.across(u) * 0.5, -step)), back = us.map(u => at(u, f.across(u) * 0.97, -step));
        const riser = us.map(u => at(u, f.across(u) * 0.5, -depth));
        smoothFill([...riser, ...edge.slice().reverse()], '#2f2419');
        smoothFill([...edge, ...back.slice().reverse()], '#6a5536');
        ctx.strokeStyle = 'rgba(160,134,92,.6)'; ctx.lineWidth = Math.max(0.8, 1.2 * z());
        ctx.beginPath(); ctx.moveTo(edge[0][0], edge[0][1]); for (const q of edge.slice(1)) ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      // Trodden duckboard line down the middle of the bed.
      if (p >= 1) {
        ctx.strokeStyle = 'rgba(110,86,56,.55)'; ctx.lineWidth = Math.max(1, 2.2 * z());
        ctx.beginPath(); const a0 = at(-half + w, 0, -depth), a1 = at(half - w, 0, -depth); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
      }
      ctx.restore();
      // A crumbly light lip.
      ctx.strokeStyle = 'rgba(168,142,100,.6)'; ctx.lineWidth = Math.max(0.8, 1.1 * z()); smoothFill(lip); ctx.stroke();
      if ((t.progress < 1 || t.upgrade) && elapsed - (t.dugAt ?? -99) < 2) {
        // Earth flying from the spades towards the parapet.
        ctx.fillStyle = 'rgba(120,96,62,.9)';
        for (let i = 0; i < 9; i++) {
          const ph = (now * 1.7 + i * 0.37) % 1, u = (hash(t.id, i) * 2 - 1) * (half - w * 0.5), [px, py] = at(u, w * (0.2 + ph), 0.5 + Math.sin(ph * Math.PI) * 0.9);
          ctx.beginPath(); ctx.arc(px, py, Math.max(1.2, 2.4 * z()) * (1 - ph * 0.5), 0, 7); ctx.fill();
        }
      }
      view.stats.trenches = (view.stats.trenches || 0) + 1;
    }
  }
  // Crest line of the parapet along the cut: where along it (u), how high (lift).
  function parapetShape(t, f) {
    const { half, w, across } = f, h = PARAPET_H * Math.min(1, t.progress * 1.4);
    const n = Math.max(8, Math.round(half / 6)), us = [];
    for (let i = 0; i <= n; i++) us.push(-(half + 6) * Math.cos(Math.PI * i / n));
    const lift = u => { const e = Math.min(1, Math.max(0, (half + 6 - Math.abs(u)) / (w * 1.2))); return h * e * e * (3 - 2 * e) * (0.88 + 0.22 * hash(t.id * 31 + Math.round(u), 5)); };
    const lipV = u => Math.max(across(u), 2);
    return { n, us, lift, lipV };
  }
  function parapetDrawable(t) {
    const X = sx(t.x), Y = gy(t.x, t.y);
    if (X < -400 || X > innerWidth + 400 || Y < -200 || Y > innerHeight + 200) return null;
    const f = trenchFrame(t), { half, w, at, across } = f, h = PARAPET_H * Math.min(1, t.progress * 1.4);
    const ridgeY = t.y + Math.sin(t.facing) * (w + 7);
    // A rounded bank of thrown-up earth: a short steep face to the trench, a
    // long gentle slope out towards the enemy that greens over at its foot,
    // tapering off round the ends of the cut.
    return { y: ridgeY, draw: () => {
      const { n, us, lift, lipV } = parapetShape(t, f);
      const inner = us.map(u => at(u, lipV(u))), ridge = us.map(u => at(u, lipV(u) + 7, lift(u)));
      const outer = us.map((u, i) => at(u * 1.05, lipV(u) + 30 + 8 * hash(t.id + i, 4)));
      // Steep inner face, darker.
      smoothFill([...inner, ...ridge.slice().reverse()], '#4a3a27');
      const [x0, y0] = at(0, w + 7, h), [x1, y1] = at(0, w + 36), g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#8d7652'); g.addColorStop(0.55, '#74663f'); g.addColorStop(1, 'rgba(90,107,55,0)');
      smoothFill([...ridge, ...outer.slice().reverse()], g);
      // Rounded crest catching the light.
      ctx.strokeStyle = 'rgba(184,160,116,.6)'; ctx.lineWidth = Math.max(1, 1.6 * z()); ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(ridge[1][0], ridge[1][1]);
      for (let i = 1; i < ridge.length - 2; i++) { const m = [(ridge[i][0] + ridge[i + 1][0]) / 2, (ridge[i][1] + ridge[i + 1][1]) / 2]; ctx.quadraticCurveTo(ridge[i][0], ridge[i][1], m[0], m[1]); }
      ctx.stroke();
      // Clods on the slope.
      for (let i = 0; i < n * 2; i++) {
        const u = (hash(t.id, i + 40) * 2 - 1) * half * 0.95, v = lipV(u) + 9 + hash(i, t.id + 3) * 16, [px, py] = at(u, v, lift(u) * (1 - (v - lipV(u) - 7) / 27) * 0.9);
        ctx.fillStyle = i % 3 ? 'rgba(74,58,38,.55)' : 'rgba(150,128,90,.5)';
        ctx.beginPath(); ctx.ellipse(px, py, (1.5 + hash(i, 7) * 2) * z(), (1 + hash(i, 8)) * z(), 0, 0, 7); ctx.fill();
      }
    } };
  }
  // Gabions (wicker baskets of earth) in a row along the inside of the
  // parapet, gaps between them for the muskets; on a parapet running across
  // the screen a course of sandbags along its crest. Drawn after the leaning
  // front rank when the bank is on the camera side (they stand in front of
  // the men), before them otherwise.
  function revetmentDrawables(t) {
    const gab = view.props.gabion, bags = view.props.sandbags;
    // Gabions and sandbags come with level 3, set up one by one while the men build.
    const build = (t.level || 1) >= 3 ? 1 : t.upgrade?.to === 3 ? t.upgrade.progress : 0;
    if (!gab || t.progress < 1 || build <= 0) return [];
    const X = sx(t.x), Y = gy(t.x, t.y);
    if (X < -400 || X > innerWidth + 400 || Y < -200 || Y > innerHeight + 200) return [];
    const f = trenchFrame(t), { half, w, at } = f, { lift, lipV } = parapetShape(t, f);
    const near = Math.sin(t.facing) > 0, ridge = t.y + Math.sin(t.facing) * (w + 7);
    const step = GABION_GAP * PPM, n = Math.max(1, Math.floor((2 * half - w * 1.2) / step));
    const k = spriteK(), out = [];
    out.push({ y: ridge + (near ? 1 : 0.2), draw: () => {
      // Back to front on screen, so nearer baskets overlap farther ones.
      const spots = [];
      for (let i = 0; i <= n; i++) {
        if (build < 1 && hash(t.id * 7 + i, 9) > build) continue;
        const u = -n * step / 2 + i * step + (hash(t.id * 13 + i, 2) - 0.5) * 3;
        spots.push(at(u, lipV(u) + 3, Math.min(lift(u), 0.12)));
      }
      spots.sort((a, b) => a[1] - b[1]);
      const baskets = () => { for (const [x, y] of spots) ctx.drawImage(gab.image, x - gab.pivot.x * k, y - gab.pivot.y * k, gab.w * k, gab.h * k); };
      // Sandbags lie along X in their picture: only on a parapet running across
      // the screen; on the crest, so behind the baskets when the bank is far.
      const sacks = () => {
        if (!bags || build < 1 || Math.abs(Math.sin(t.facing)) <= 0.82) return;
        const bs = 1.7 * PPM, m = Math.max(1, Math.floor((2 * half - w * 1.6) / bs));
        for (let i = 0; i <= m; i++) {
          const u = -m * bs / 2 + i * bs, [x, y] = at(u, lipV(u) + 8, lift(u) * 0.95);
          ctx.drawImage(bags.image, x - bags.pivot.x * k * 0.8, y - bags.pivot.y * k * 0.8, bags.w * k * 0.8, bags.h * k * 0.8);
        }
      };
      if (near) { baskets(); sacks(); } else { sacks(); baskets(); }
      view.stats.gabions = (view.stats.gabions || 0) + spots.length;
    } });
    return out;
  }
  // A shield over each regiment in the defensive stance: outlined while it
  // braces, filled once braced (regiment-orders-v1).
  // Morale over every regiment in sight (battle-depth-v1): a bar from green to
  // red, a red "!" when it wavers, a white flag when most of it runs; a small
  // drum and sword show the drummer and officer who hold it together.
  function drawMorale() {
    const D = global.__BATTLE_DEPTH_V1__; if (!D) return;
    let n = 0;
    for (const reg of regiments) {
      if (reg.destroyed) continue;
      const m = regimentMembers(reg).filter(u => !u.dead); if (!m.length) continue;
      if (reg.side === 'britain' && typeof isVisibleToFrance === 'function' && !m.some(u => isVisibleToFrance(u))) continue;
      const info = D.regimentMorale(reg); if (!info) continue;
      const c = centroid(m), X = sx(c.x), Y = gy(c.x, c.y) - 2.4 * LIFT * PPM * z() - (reg.defend ? 34 : 14);
      if (X < -60 || X > innerWidth + 60 || Y < -40 || Y > innerHeight + 40) continue;
      const w = 34 + 6 * Math.min(2, z()), h = 5, f = Math.max(0, Math.min(1, info.morale / 100));
      ctx.fillStyle = 'rgba(15,13,10,.75)'; ctx.fillRect(X - w / 2 - 1.5, Y - 1.5, w + 3, h + 3);
      ctx.fillStyle = `hsl(${Math.round(f * 115)},70%,${42 + f * 8}%)`; ctx.fillRect(X - w / 2, Y, w * f, h);
      ctx.strokeStyle = reg.side === 'france' ? 'rgba(120,150,235,.9)' : 'rgba(230,110,100,.9)'; ctx.lineWidth = 1; ctx.strokeRect(X - w / 2 - 1.5, Y - 1.5, w + 3, h + 3);
      ctx.font = '600 10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      if (info.routing >= 0.5) { ctx.fillStyle = '#fff'; ctx.fillText('🏳', X, Y - 2); }
      else if (info.wavering) { ctx.fillStyle = (Math.floor(performance.now() / 350) % 2) ? '#ff5a45' : '#ffd0c8'; ctx.font = '800 12px system-ui,sans-serif'; ctx.fillText('!', X, Y - 1); }
      const cohesionLabel = global.__BATTLE_COHESION_V1__?.label(reg);
      if (cohesionLabel) {
        ctx.font = '700 9px system-ui,sans-serif';ctx.fillStyle = reg.cohesionPhase === 'ready' ? '#b8e4a7' : '#ffe0a1';
        ctx.fillText(cohesionLabel, X, Y - 15);
        ctx.fillStyle = 'rgba(15,13,10,.75)';ctx.fillRect(X - w / 2, Y + h + 3, w, 3);
        ctx.fillStyle = '#d7ad64';ctx.fillRect(X - w / 2, Y + h + 3, w * Math.max(0,Math.min(1,(reg.cohesion ?? 100)/100)), 3);
      }
      ctx.font = '9px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText((info.officer ? '⚔' : '') + (info.drummer ? '🥁' : ''), X + w / 2 + 4, Y + h / 2);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      n++;
    }
    view.stats.moraleBars = n;
  }
  function drawStances() {
    drawMorale();
    const R = global.__REGIMENT_ORDERS_V1__; if (!R) return;
    for (const reg of regiments) {
      if (reg.destroyed || !reg.defend) continue;
      const m = regimentMembers(reg); if (!m.length) continue;
      if (reg.side === 'britain' && typeof isVisibleToFrance === 'function' && !m.some(u => isVisibleToFrance(u))) continue;
      const c = centroid(m), X = sx(c.x), Y = gy(c.x, c.y) - 2.4 * LIFT * PPM * z() - 14, s = 7 + 4 * z();
      if (X < -40 || X > innerWidth + 40 || Y < -40 || Y > innerHeight + 40) continue;
      const braced = R.isBraced(reg);
      ctx.beginPath();
      ctx.moveTo(X - s, Y - s); ctx.lineTo(X + s, Y - s); ctx.lineTo(X + s, Y);
      ctx.quadraticCurveTo(X + s, Y + s * 0.9, X, Y + s * 1.4); ctx.quadraticCurveTo(X - s, Y + s * 0.9, X - s, Y); ctx.closePath();
      ctx.fillStyle = reg.side === 'france' ? (braced ? 'rgba(52,92,200,.92)' : 'rgba(52,92,200,.25)') : (braced ? 'rgba(200,52,46,.92)' : 'rgba(200,52,46,.25)');
      ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,248,230,.95)'; ctx.stroke();
      view.stats.stances = (view.stats.stances || 0) + 1;
    }
  }

  // ---- switching ----
  // The 2D game's own layers; overlays drawn on top of any view (data-overlay) stay.
  const otherLayers = () => [...document.querySelectorAll('canvas')].filter(c => c !== canvas && c.id !== 'minimap' && !c.dataset.overlay);
  // The iso view is the game's only view: on for good, the 2D layers hidden
  // (there is no switch back to the 2D map).
  function setOn(on) {
    view.on = on;
    screenToWorld = on ? isoScreenToWorld : topDown.s2w;
    worldToScreen = on ? isoWorldToScreen : topDown.w2s;
    for (const c of otherLayers()) c.style.visibility = on ? 'hidden' : '';
  }
  // Overzicht: decoration dimmed and the small village detail hidden, for a clear view of the battle.
  const overview = document.createElement('button');
  overview.id = 'isoOverviewToggle'; overview.type = 'button';
  overview.style.cssText = 'position:fixed;z-index:40;top:58px;right:10px;padding:6px 10px;border-radius:8px;border:1px solid rgba(244,216,109,.55);' +
    'background:rgba(16,20,17,.86);color:#f5f1e8;font:650 13px system-ui,sans-serif;cursor:pointer';
  const setOverview = on => { view.overview = on; overview.textContent = on ? '👁 Overzicht: aan' : '👁 Overzicht: uit';
    overview.setAttribute('aria-pressed', String(on)); };
  overview.addEventListener('click', () => setOverview(!view.overview));
  document.body.appendChild(overview);
  // The phone menu opens Nieuwe slag at the top right: keep it tappable.
  const overviewStyle = document.createElement('style');
  overviewStyle.textContent = '@media (pointer:coarse),(max-width:860px){body.mobile-menu-open #isoOverviewToggle{right:auto!important;left:10px}}';
  document.head.appendChild(overviewStyle);
  setOverview(false);
  // Other layers may be created after this file runs: hide them as they appear.
  new MutationObserver(() => { if (view.on) for (const c of otherLayers()) c.style.visibility = 'hidden'; })
    .observe(document.body, { childList: true, subtree: true });
  setOn(true);
  loadAll();
  // By load, every legacy reset and the responsive HUD have finished booting.
  if (document.readyState === 'complete') frameStartingForce();
  else global.addEventListener('load', frameStartingForce, { once: true });
  global.NRTS?.events?.on?.('game:reset', () => {
    // Unit ids restart at one; no animation, corpse or shot may refer to the
    // previous battle. Keep the loaded artwork and static terrain caches.
    for (const map of [view.info, view.regFire, view.gunFire, view.towerFired, view.trenchLips, view.trenchCrests]) map.clear();
    view.corpses.length = view.smoke.length = view.impacts.length = 0;
    groundDetail.reset(); detailRelief = null;
    wetTracks.reset(); clearTrackPaths(); global.__SEASONAL_PROPS_V1__?.reset(); view.stats.tracks = view.stats.rainDrops = view.stats.trackDrawCalls = 0;
    view.attack = view.lastCam = view.fogCam = view.fogPrev = view.cloudCam = null;
    fogGeometry.seen = fogGeometry.sight = null;
    view.lastNow = view.fogAt = 0;
    view.stats.corpses = view.stats.smoke = view.stats.hitDust = view.stats.hitDustDraws = view.stats.groundDetailDraws = 0;
    queueMicrotask(frameStartingForce);
  });

  global.__ISO_VIEW_V1__ = Object.freeze({
    version: 'iso-view-v1', optIn: 'view=iso',
    isOn: () => view.on, setOn, setOverview, atlasKeys: () => Object.keys(view.atlases), lookOf,
    animsOf: key => [...(view.atlases[key]?.byAnim.keys() || [])],
    // The sprite a unit is drawn with now ([atlas, anim, frame]), and the kinds of tree and bush on the map.
    frameOf: id => { const u = units.find(q => q.id === id), m = view.info.get(id); return u && m ? frameFor(u, m, performance.now() / 1000) : null; },
    presentationOf: id => { const p = view.info.get(id)?.motion; return p ? { ...p } : null; },
    plantKinds: () => (view.woodTrees || []).reduce((n, tr) => (n[tr.kind] = (n[tr.kind] || 0) + 1, n), {}),
    stats: () => ({ ...view.stats, assets: { ...assetState }, sceneryCache: global.__STATIC_SPRITE_CACHE_V1__?.stats(), gpu: global.__ISO_GPU_V1__?.stats(), on: view.on, atlases: Object.keys(view.atlases).length, props: Object.keys(view.props).length,
      tiles: view.tiles.size, info: view.info.size, woodTrees: view.woodTrees ? view.woodTrees.length : 0,
      wetTracks: wetTracks.stats(), groundDetail:groundDetail.stats(), seasonalProps: global.__SEASONAL_PROPS_V1__?.stats(), buildingPresentation:buildingPresentation?.stats(),
      fogGeometryPoints: ((fogGeometry.seen?.points.length || 0) + (fogGeometry.sight?.points.length || 0)) / 3,
      sharpSheets: sharp.parts.size, sharpMB: Math.round(sharp.bytes / 2 ** 20), sharpBudgetMB: SHARP_BUDGET / 2 ** 20, sharpLoading: sharp.loading,
      workerSprites: !!view.atlases.frw, digSprites: !!view.atlases['fr:dig'] && !!view.atlases['br:dig'], labAudio: !!labAudio.ctl, overview: !!view.overview, detailed: detailed(), villageKinds: view.village ? Object.keys(view.village.kinds).length : 0,
      relief: view.relief ? view.relief.maxM : 0, heightSight: !!view.heightSight, villageHouses: villageHouses().length, openMap: global.__OPEN_MAP_V1__?.after || null, dressingItems: view.dressing ? view.dressing.length : 0, ppm: PPM, zoom: camera.zoom, missingNames: [...view.missingNames] }),
    tracks: () => wetTracks.snapshot(),
    atmosphere: () => ({ smoke:view.smoke.map(s=>({...s,...atmosphere.smokeProfile(s,performance.now()/1000)})), hits:view.impacts.map(p=>({...p})) }),
    screenOf: (wx, wy) => ({ x: sx(wx), y: gy(wx, wy) }),
    // Door direction of each village house against its gate on the road (for tests).
    doorCheck: () => villageHouses().filter(h => Number.isFinite(h.accessX)).map(h => {
      const psi = headingOf(h, view.village ? view.village.headings : 16) * 2 * Math.PI / (view.village ? view.village.headings : 16);
      const fx = Math.sin(psi), fy = Math.cos(psi), gx = h.accessX - h.x, gy = h.accessY - h.y, l = Math.hypot(gx, gy) || 1;
      return (fx * gx + fy * gy) / l;
    }),
    bodyOf: u => ({ x: sx(u.x), y: gy(u.x, u.y) - ((u.type === 'cavalry' ? 1.6 : 0.9) * PPM + (deckAt(u.x, u.y)?.h || 0)) * LIFT * z() }),
    deckAt
  });
})(window);
