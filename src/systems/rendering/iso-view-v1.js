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

  const ASSETS = 'graphics-lab/assets/';
  // Scale: a line's files stand 18 px apart in the game and 0.8 m apart in the lab.
  const PPM = 22.5, SQ = 0.5, SPRITE_PPM = 128 / 3.1, LIFT = 0.866;
  const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  const HD = params.has('hd');
  const MARCH_STRIDE = 1.5, DIE_FRAME = 0.17, CORPSE_MAX = 320, SMOKE_MAX = 260;
  // Village houses in the game are about a third of real size next to its
  // soldiers; drawn at their footprint they would be shorter than a man. They are
  // drawn this much larger than the footprint (the footprint still decides where
  // men can walk).
  const VILLAGE_SCALE = 2.0;
  const view = { on: true, atlases: {}, props: {}, village: null, dressing: null, chimneyAt: new Map(), chimneySmoke: [], info: new Map(), missingNames: new Set(), corpses: [], smoke: [], tiles: new Map(),
    tileTick: 0, frames: 0, lastNow: 0, regFire: new Map(), gunFire: new Map(), miniAt: 0, fogAt: 0,
    stats: { renderMs: 0, houses: 0, dressing: 0, chimneySmoke: 0, drawn: 0, sprites: 0, workers: 0, props: 0, tilesBaked: 0, tilesDrawn: 0, corpses: 0, smoke: 0, missing: 0 } };

  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177) >>> 0; h ^= h >>> 13;
    return (Math.imul(h, 1103515245) >>> 0) / 4294967296; };
  // Game facing/heading (radians, y down) -> sprite direction index.
  const dirOf = a => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;

  // ---- projection ----
  const z = () => camera.zoom;
  const sx = wx => (wx - camera.x) * z() + innerWidth / 2;
  const sy = wy => (wy - camera.y) * z() * SQ + innerHeight / 2;
  const spriteK = () => z() * PPM / SPRITE_PPM;
  function isoScreenToWorld(px, py) {
    return { x: (px - innerWidth / 2) / camera.zoom + camera.x, y: (py - innerHeight / 2) / (camera.zoom * SQ) + camera.y };
  }
  function isoWorldToScreen(wx, wy) { return { x: sx(wx), y: sy(wy) }; }
  const topDown = { s2w: screenToWorld, w2s: worldToScreen };

  // ---- atlases (the lab's, half resolution unless ?hd=1) ----
  const loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im);
    im.onerror = () => rej(new Error('iso: ontbreekt ' + src)); im.src = src; });
  function loadSheet(prefix, kind) {
    const dir = ASSETS + 'sprites/iso/';
    return fetch(dir + prefix + '_iso_' + kind + '_atlas.json').then(r => { if (!r.ok) throw new Error('iso: atlas ' + prefix + ' ' + kind); return r.json(); })
      .then(sheet => { const half = !HD && sheet.meta.half;
        return loadImage(dir + (half ? half.image : sheet.meta.image)).then(image => ({ sheet, image, scale: half ? half.scale : 1 })); });
  }
  function indexAtlas(parts) {
    const byAnim = new Map();
    for (const p of parts) for (const a of Object.keys(p.sheet.animations)) byAnim.set(a, p);
    return { ...parts[0], byAnim };
  }
  const load = (key, kinds) => Promise.all(kinds.map(k => loadSheet(key, k))).then(indexAtlas)
    .then(a => { view.atlases[key] = a; }).catch(err => console.warn(err.message));
  const INFANTRY = ['infantry', 'fallen', 'combat', 'morale'];
  function loadAll() {
    const first = [load('fr', INFANTRY), load('br', INFANTRY)];
    for (const p of ['fr', 'br']) {
      first.push(load(p + 'o', ['officer']), load(p + 'd', ['drummer']), load(p + 'c', ['cavalry', 'cavfight']),
        load(p + 'g', ['gun']), load(p + 'a', ['gunner', 'gunner2']));
    }
    first.push(loadProps(), loadVillage());
    // Extra looks stream in afterwards; until then everyone uses the base look.
    return Promise.all(first).then(() => Promise.all(['2', '3', '4', '5'].flatMap(l => ['fr', 'br'].map(p => load(p + l, INFANTRY)))
      .concat(['fr', 'br'].flatMap(p => [load(p + 'c2', ['cavalry', 'cavfight']), load(p + 'co', ['cavalry', 'cavfight'])]))));
  }
  function loadProps() {
    return fetch(ASSETS + 'iso/props/props.json').then(r => r.json()).then(m => Promise.all(Object.entries(m.props)
      .map(([kind, meta]) => loadImage(ASSETS + 'iso/props/' + meta.image).then(image => { view.props[kind] = { ...meta, image }; }))))
      .catch(err => console.warn('iso: props', err));
  }
  // Village buildings: one sheet per kind with 16 headings (scripts/render-iso-village.py).
  function loadVillage() {
    const dir = ASSETS + 'iso/village/';
    return fetch(dir + 'village.json').then(r => r.json()).then(m => Promise.all(Object.entries(m.kinds)
      .map(([kind, meta]) => loadImage(dir + meta.image).then(image => [kind, { ...meta, image }])))
      .then(list => { view.village = { kinds: Object.fromEntries(list), pxPerM: m.pxPerM, headings: m.headings }; }))
      .catch(err => console.warn('iso: dorpen', err));
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
    const X = sx(house.x), Y = sy(house.y), reach = house.w * VILLAGE_SCALE * z();
    if (X < -reach || X > innerWidth + reach || Y < -reach * 0.6 || Y > innerHeight + reach * 1.4) return null;
    const heading = headingOf(house, V.headings), f = meta.frames[heading];
    chimneys(house, kind, meta, heading);
    return { y: house.y, draw: () => {
      // Screen pixels per sheet pixel.
      const k = houseScale(house, meta) * z() / V.pxPerM;
      ctx.drawImage(meta.image, f.x, f.y, f.w, f.h, X - f.px * k, Y - f.py * k, f.w * k, f.h * k);
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
        if (!farm && h.kind !== 'chapel' && r > 0.3) {
          const p = at((0.5 - r) * h.w * 1.2, depth + 26);
          if (clearSpot(p.x, p.y, 12, near)) items.push({ prop: r > 0.75 ? 'poplar' : 'oak', ...p, scale: 0.42 + r * 0.12 });
        }
        // The back of the plot: a hedge behind cottages, a fence behind farms.
        if (h.kind !== 'chapel' && r > 0.15) {
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
    const X = sx(it.x), Y = sy(it.y);
    if (X < -150 || X > innerWidth + 150 || Y < -60 || Y > innerHeight + 220) return null;
    if (it.prop) {
      const prop = view.props[it.prop]; if (!prop) return null;
      return { y: it.y, draw: () => { const k = DRESS_PPM * it.scale * z() / SPRITE_PPM;
        ctx.drawImage(prop.image, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.dressing++; } };
    }
    const V = view.village, meta = V && V.kinds[it.edge]; if (!meta) return null;
    const f = meta.frames[((Math.round(-it.angle / (2 * Math.PI / V.headings)) % V.headings) + V.headings) % V.headings];
    return { y: it.y, draw: () => { const k = DRESS_PPM * z() / V.pxPerM;
      ctx.drawImage(meta.image, f.x, f.y, f.w, f.h, X - f.px * k, Y - f.py * k, f.w * k, f.h * k); view.stats.dressing++; } };
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
      const x = sx(p.wx + age * p.life * 6 + Math.sin(age * 5 + p.seed * 9) * 3), y = sy(p.wy) - (p.lift + age * p.life * 9) * z();
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
  function drawSprite(atlas, anim, f, x, y, k) {
    const src = atlas && atlas.byAnim.get(anim), name = src && src.sheet.animations[anim] && src.sheet.animations[anim][f];
    if (!name) { view.stats.missing++; if (view.missingNames.size < 20) view.missingNames.add((atlas ? '' : 'noatlas:') + anim); return false; }
    const fr = src.sheet.frames[name].frame, p = src.sheet.meta.pivot, s = src.scale || 1;
    ctx.drawImage(src.image, fr.x * s, fr.y * s, fr.w * s, fr.h * s, x - p.x * k, y - p.y * k, fr.w * k, fr.h * k);
    return true;
  }

  // ---- terrain: the game's static terrain, baked into tiles and laid flat ----
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
  function drawTerrain() {
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
      ctx.drawImage(t.c, Math.floor(X), Math.floor(Y), Math.ceil(W + 1), Math.ceil(H + 1));
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
    if (!m) { m = { walk: 0, x: u.x, y: u.y, dir: dirOf(u.facing || 0), firedAt: -99, reload: u.reload, speed: 0, alive: true, u };
      view.info.set(u.id, m); }
    return m;
  }
  function track(u, m, now, dt) {
    const d = Math.hypot(u.x - m.x, u.y - m.y);
    m.speed = dt > 0 ? m.speed * 0.7 + (d / PPM / dt) * 0.3 : m.speed;
    if (d > 0.05) { m.walk += d / PPM; if (d > 0.4) m.dir = dirOf(Math.atan2(u.y - m.y, u.x - m.x)); }
    else if (!m.moving) m.dir = dirOf(u.facing || 0);
    m.moving = m.speed > 0.25;
    // A shot resets the reload clock upwards: that is when the man fired.
    const t = TYPES[u.type];
    if (t && t.reload > 0 && u.reload > m.reload + t.reload * 0.4) {
      m.firedAt = now; if (!m.moving) m.dir = dirOf(u.facing || 0);
      if (u.regimentId) view.regFire.set(u.regimentId, now);
      onShot(u, m, now);
    }
    m.x = u.x; m.y = u.y; m.reload = u.reload; m.u = u;
  }
  // Muzzle smoke, a little ahead of the man at shoulder height; a cloud for a gun.
  function onShot(u, m, now) {
    const a = u.facing || 0, gun = u.type === 'artillery';
    if (u.type === 'cavalry' || u.type === 'drummer' || u.type === 'worker') return;
    const reach = gun ? 2.4 : 1.1, height = gun ? 0.9 : 1.45, n = gun ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const s = hash(u.id + i * 7, Math.floor(now * 10));
      view.smoke.push({ wx: u.x + Math.cos(a) * (reach + i * 0.6) * PPM, wy: u.y + Math.sin(a) * (reach + i * 0.6) * PPM,
        h: height, born: now, life: (gun ? 6 : 4) + s * 2, size: (gun ? 1.6 : 0.55) + s * (gun ? 1.2 : 0.4), seed: s });
    }
    if (gun) view.gunFire.set(u.regimentId || u.id, now);
    if (view.smoke.length > SMOKE_MAX) view.smoke.splice(0, view.smoke.length - SMOKE_MAX);
  }

  const lookOf = u => {
    const p = u.side === 'france' ? 'fr' : 'br', h = hash(u.id, 7);
    const key = h < 0.1 ? p + '4' : h < 0.2 ? p + '5' : p + ['', '2', '3'][Math.floor(hash(u.id, 13) * 3)];
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

  // Animation for one live unit: [atlas key, animation, frame].
  function frameFor(u, m, now) {
    const p = u.side === 'france' ? 'fr' : 'br', d = DIRS[m.dir];
    const since = now - m.firedAt, step = (stride, n) => Math.floor((m.walk % stride) / stride * n) % n;
    if (u.type === 'cavalry') {
      const key = view.atlases[p + 'c' + (hash(u.id, 5) < 0.5 ? '' : '2')] ? p + 'c' + (hash(u.id, 5) < 0.5 ? '' : '2') : p + 'c';
      if (m.moving) {
        const gait = m.speed > 4.5 || u.chargeTimer > 0 ? 'gallop' : m.speed > 2.4 ? 'trot' : 'walk';
        const stride = gait === 'gallop' ? 3.6 : gait === 'trot' ? 2.8 : 2.4;
        return [key, gait + '_' + d, step(stride, 6)];
      }
      if (since < 0.6 || u.chargeTimer > 0) return [key, 'slash_' + d, Math.floor(now / 0.18) % 3];
      return [key, 'idle_' + d, Math.floor(now / 0.7 + hash(u.id, 3) * 2) % 2];
    }
    if (u.type === 'artillery') {
      if (m.moving) return [p + 'g', 'roll_' + d, step(1.2, 4)];
      if (since < 0.3) return [p + 'g', 'fire_' + d, since < 0.12 ? 0 : 1];
      return [p + 'g', 'idle_' + d, 0];
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
    if (u.routing) return [key, 'rout_' + d, step(1.6, 6)];
    if (m.moving) return [key, (u.chargeTimer > 0 ? 'charge_' : 'march_') + d, step(MARCH_STRIDE, 6)];
    if (since < 0.42) return [key, 'fire_' + d, Math.min(2, Math.floor(since / 0.14))];
    if (since < 2.1) return [key, 'reload_' + d, Math.min(3, Math.floor((since - 0.42) / 0.42))];
    if (now - (view.regFire.get(u.regimentId) ?? -99) < 6) return [key, 'aim_' + d, 1];
    return [key, 'idle_' + d, Math.floor((now * 1000 + u.id * 137) / 500) % 2];
  }
  // Fall: the man's own look and a fall chosen by his id; it plays once and stays.
  function addCorpse(m, now) {
    const u = m.u, p = u.side === 'france' ? 'fr' : 'br', d = DIRS[m.dir];
    let key, anim;
    if (u.type === 'cavalry') { key = p + 'c'; anim = 'die_' + d; }
    else if (u.type === 'artillery') return;
    else if (crewIds.has(u.id)) { key = p + 'a'; anim = ['die', 'diefwd', 'dieside'][Math.floor(hash(u.id, 4) * 3)] + '_' + d; }
    else if (u.type === 'worker') return;
    else { key = u.type === 'officer' || u.type === 'drummer' ? p : lookOf(u); anim = ['die', 'diefwd', 'dieside'][Math.floor(hash(u.id, 4) * 3)] + '_' + d; }
    view.corpses.push({ x: m.x, y: m.y, key, anim, t0: now });
    if (view.corpses.length > CORPSE_MAX) view.corpses.splice(0, view.corpses.length - CORPSE_MAX);
  }

  // ---- props for buildings and resources ----
  const BUILDING_PROP = { towncenter: 'barracks', barracks: 'barracks', house: 'cottage' };
  function buildingDrawable(b) {
    if (b.dead) return null;
    if (b.side === 'britain' && typeof isVisibleToFrance === 'function' && !isVisibleToFrance(b)) return null;
    if (b.type === 'farm') return { y: b.y, draw: () => drawFarm(b) };
    const base = BUILDING_PROP[b.type] || 'cottage', kind = base === 'barracks' ? 'barracks_' + (b.side === 'france' ? 'fr' : 'br') : base;
    const prop = view.props[kind]; if (!prop) return null;
    return { y: b.y + b.h * 0.3, draw: () => {
      // Fit the rendered building to the game's footprint (a little larger: the
      // props carry their eaves and yard beyond the walls).
      const k = b.w * z() * 1.45 / prop.w;
      ctx.globalAlpha = b.complete === false ? 0.45 + 0.5 * (b.construction || 0) : 1;
      ctx.drawImage(prop.image, sx(b.x) - prop.pivot.x * k, sy(b.y) - prop.pivot.y * k, prop.w * k, prop.h * k);
      ctx.globalAlpha = 1; view.stats.props++;
    } };
  }
  function drawFarm(b) {
    const x = sx(b.x - b.w / 2), y = sy(b.y - b.h / 2), w = b.w * z(), h = b.h * z() * SQ;
    ctx.fillStyle = b.complete === false ? 'rgba(150,130,80,.55)' : '#b59b52'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90,70,30,.45)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x, y + h * i / 8); ctx.lineTo(x + w, y + h * i / 8); ctx.stroke(); }
    view.stats.props++;
  }
  function resourceDrawable(r) {
    if (r.dead || r.amount <= 0) return null;
    if (r.type === 'wood') {
      const prop = view.props[hash(r.id, 3) < 0.65 ? 'oak' : 'poplar']; if (!prop) return null;
      return { y: r.y, draw: () => { const k = spriteK() * (0.55 + hash(r.id, 5) * 0.25);
        ctx.drawImage(prop.image, sx(r.x) - prop.pivot.x * k, sy(r.y) - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.props++; } };
    }
    if (r.type === 'iron') return { y: r.y, draw: () => drawRock(r) };
    const prop = view.props.bush; if (!prop) return null;
    return { y: r.y, draw: () => { const k = spriteK() * 0.75;
      ctx.drawImage(prop.image, sx(r.x) - prop.pivot.x * k, sy(r.y) - prop.pivot.y * k, prop.w * k, prop.h * k);
      ctx.fillStyle = '#8c1f2a'; for (let i = 0; i < 5; i++) { ctx.beginPath();
        ctx.arc(sx(r.x) + (hash(r.id, i) - .5) * 18 * z(), sy(r.y) - (4 + hash(i, r.id) * 10) * z(), 1.6 * z() + .6, 0, 7); ctx.fill(); }
      view.stats.props++; } };
  }
  function drawRock(r) {
    const x = sx(r.x), y = sy(r.y), s = 9 * z() + 2;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + s * .2, y + s * .1, s * 1.2, s * .45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7c7a73'; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * .5, y - s * 1.1); ctx.lineTo(x + s * .4, y - s * 1.3);
    ctx.lineTo(x + s, y - s * .3); ctx.lineTo(x + s * .6, y + s * .2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9a978d'; ctx.beginPath(); ctx.moveTo(x - s * .5, y - s * 1.1); ctx.lineTo(x + s * .4, y - s * 1.3); ctx.lineTo(x + s * .1, y - s * .5); ctx.closePath(); ctx.fill();
    view.stats.props++;
  }
  // Workers have no sprites yet: a peasant in a smock and hat, facing his way.
  function drawWorker(u, m) {
    const x = sx(u.x), y = sy(u.y), s = z() * PPM, bob = m.moving ? Math.sin(m.walk * 7) * .04 * s : 0;
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
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, kind === 'gun' ? 'rgba(232,228,218,.85)' : 'rgba(240,238,230,.8)'); grad.addColorStop(1, 'rgba(225,222,212,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64); return (PUFFS[kind] = c);
  }
  function drawSmoke(now) {
    view.smoke = view.smoke.filter(s => now - s.born < s.life);
    const img = puff('m'), wind = 0.35;
    for (const s of view.smoke) {
      const age = (now - s.born) / s.life, r = (s.size + age * 2.2) * PPM * z();
      const x = sx(s.wx + wind * (now - s.born) * PPM), y = sy(s.wy) - (s.h + age * 1.6) * LIFT * PPM * z();
      ctx.globalAlpha = (1 - age) * 0.75; ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; view.stats.smoke = view.smoke.length;
  }
  function drawProjectiles() {
    ctx.fillStyle = 'rgba(30,28,24,.9)';
    for (const p of projectiles) {
      if (p.dead) continue;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y) - 1.2 * LIFT * PPM * z(), Math.max(1, 1.4 * z()), 0, 7); ctx.fill();
    }
  }
  const fog = document.createElement('canvas'), fogCtx2 = fog.getContext('2d');
  function drawFog() {
    if (typeof frenchVisionSources !== 'function' || typeof visionRadius !== 'function') return;
    const w = Math.ceil(innerWidth / 2), h = Math.ceil(innerHeight / 2);
    if (fog.width !== w || fog.height !== h) { fog.width = w; fog.height = h; }
    // The fog changes slowly: redraw it five times a second.
    if (performance.now() - view.fogAt > 200) {
      view.fogAt = performance.now();
      fogCtx2.globalCompositeOperation = 'source-over'; fogCtx2.clearRect(0, 0, w, h);
      fogCtx2.fillStyle = 'rgba(4,7,9,.82)'; fogCtx2.fillRect(0, 0, w, h);
      fogCtx2.globalCompositeOperation = 'destination-out'; fogCtx2.fillStyle = '#000';
      for (const s of frenchVisionSources()) {
        const r = visionRadius(s) * z() / 2;
        fogCtx2.beginPath(); fogCtx2.ellipse(sx(s.x) / 2, sy(s.y) / 2, r, r * SQ, 0, 0, 7); fogCtx2.fill();
      }
      fogCtx2.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(fog, 0, 0, innerWidth, innerHeight);
  }
  function drawSelection() {
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(245,220,112,.95)'; ctx.beginPath();
    for (const u of selectedUnits) {
      if (u.dead) continue;
      const r = (u.type === 'cavalry' ? 1.2 : u.type === 'artillery' ? 1.4 : 0.5) * PPM * z();
      ctx.moveTo(sx(u.x) + r, sy(u.y)); ctx.ellipse(sx(u.x), sy(u.y), r, r * SQ, 0, 0, 7);
    }
    ctx.stroke();
    const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
    if (b && !b.dead) { ctx.strokeRect(sx(b.x - b.w / 2), sy(b.y - b.h / 2), b.w * z(), b.h * z() * SQ); }
  }
  function drawDragBox() {
    if (!drag.active || !drag.moved || buildMode) return;
    const x = Math.min(drag.startX, drag.x), y = Math.min(drag.startY, drag.y), w = Math.abs(drag.x - drag.startX), h = Math.abs(drag.y - drag.startY);
    ctx.strokeStyle = 'rgba(245,220,112,.9)'; ctx.fillStyle = 'rgba(245,220,112,.12)'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  }

  // ---- the frame ----
  function render(now) {
    const t = now / 1000, dt = view.lastNow ? Math.min(0.1, t - view.lastNow) : 0; view.lastNow = t;
    view.frames++;
    if (view.frames % 30 === 1) refreshCrew();
    const st = view.stats; st.drawn = st.sprites = st.workers = st.props = st.houses = st.dressing = 0;
    drawTerrain();
    const k = spriteK(), seen = new Set(), list = [];
    const visible = u => u.side === 'france' || typeof isVisibleToFrance !== 'function' || isVisibleToFrance(u);
    for (const u of units) {
      if (u.dead) continue;
      seen.add(u.id);
      const m = infoOf(u); track(u, m, t, dt);
      if (!visible(u)) continue;
      const X = sx(u.x), Y = sy(u.y);
      if (X < -80 || X > innerWidth + 80 || Y < -40 || Y > innerHeight + 140) continue;
      list.push({ y: u.y, draw: () => {
        if (u.type === 'worker') { drawWorker(u, m); return; }
        const [key, anim, f] = frameFor(u, m, t);
        // Until its atlas has loaded a unit is simply not drawn yet.
        if (drawSprite(view.atlases[key], anim, f, X, Y, k)) st.sprites++;
      } });
      st.drawn++;
    }
    // Men who fell (or left the list) since the last frame.
    for (const [id, m] of view.info) {
      if (seen.has(id)) continue;
      if (m.alive && visible(m.u)) addCorpse(m, t);
      view.info.delete(id);
    }
    for (const c of view.corpses) {
      const X = sx(c.x), Y = sy(c.y);
      if (X < -60 || X > innerWidth + 60 || Y < -40 || Y > innerHeight + 80) continue;
      list.push({ y: c.y - 0.5, draw: () => drawSprite(view.atlases[c.key], c.anim, Math.min(3, Math.floor((t - c.t0) / DIE_FRAME)), X, Y, k) });
    }
    st.corpses = view.corpses.length;
    for (const b of buildings) { const d = buildingDrawable(b); if (d) list.push(d); }
    for (const h of villageHouses()) { const d = houseDrawable(h); if (d) list.push(d); }
    if (view.village && view.props.well && !view.dressing) view.dressing = buildDressing();
    for (const it of view.dressing || []) { const d = dressingDrawable(it); if (d) list.push(d); }
    for (const r of resources) {
      const X = sx(r.x), Y = sy(r.y);
      if (X < -120 || X > innerWidth + 120 || Y < -30 || Y > innerHeight + 260) continue;
      const d = resourceDrawable(r); if (d) list.push(d);
    }
    drawSelection();
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();
    drawProjectiles();
    drawChimneySmoke(t);
    drawSmoke(t);
    drawFog();
    drawDragBox();
    if (now - view.miniAt > 200 && typeof drawMinimap === 'function') { view.miniAt = now; try { drawMinimap(); } catch (_) {} }
  }

  // ---- hooks: the game's frame calls renderStableFrameV1(draw) when it exists ----
  let inner = global.renderStableFrameV1;
  function stableFrame(drawGame, now) {
    if (!view.on) return typeof inner === 'function' ? inner(drawGame, now) : drawGame();
    // Once a second the 2D renderer runs too (its output is painted over), so
    // effects it keeps for its own frames are still consumed and pruned.
    // It runs with its own (top-down) projection.
    if (view.frames % 60 === 0) {
      screenToWorld = topDown.s2w; worldToScreen = topDown.w2s;
      try { typeof inner === 'function' ? inner(drawGame, now) : drawGame(); } catch (_) {}
      finally { screenToWorld = isoScreenToWorld; worldToScreen = isoWorldToScreen; }
    }
    const t0 = performance.now();
    try { render(now); view.stats.renderMs = Math.round((view.stats.renderMs * 0.9 + (performance.now() - t0) * 0.1) * 10) / 10; }
    finally { const dpr = canvas.width / Math.max(1, innerWidth); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  }
  Object.defineProperty(global, 'renderStableFrameV1', { configurable: true, get: () => stableFrame, set: v => { inner = v; } });

  // A click on a man's body (above his feet) selects him, as a click on his feet would.
  function snapToBody(wx, wy) {
    if (!view.on) return null;
    const px = sx(wx), py = sy(wy), reach = Math.max(14, 26 * z());
    let best = null, bd = reach;
    for (const u of units) {
      if (u.dead) continue;
      const lift = (u.type === 'cavalry' ? 1.6 : u.type === 'artillery' ? 0.5 : 0.9) * LIFT * PPM * z();
      const d = Math.hypot(sx(u.x) - px, sy(u.y) - lift - py);
      if (d < bd) { best = u; bd = d; }
    }
    return best;
  }
  if (typeof selectPoint === 'function') {
    const baseSelectPoint = selectPoint;
    selectPoint = function selectPointIsoV1(x, y, add) { const u = snapToBody(x, y); return u ? baseSelectPoint(u.x, u.y, add) : baseSelectPoint(x, y, add); };
  }

  // ---- switching ----
  const otherLayers = () => [...document.querySelectorAll('canvas')].filter(c => c !== canvas && c.id !== 'minimap');
  function setOn(on) {
    view.on = on;
    screenToWorld = on ? isoScreenToWorld : topDown.s2w;
    worldToScreen = on ? isoWorldToScreen : topDown.w2s;
    for (const c of otherLayers()) c.style.visibility = on ? 'hidden' : '';
    // Back in 2D: let the 2D terrain caches start afresh.
    if (!on) { try { global.__DESKTOP_TERRAIN_TILES_V301__?.invalidate?.(); } catch (_) {} }
    button.textContent = on ? '🗺 2D-kaart' : '🏰 Iso-weergave';
    button.setAttribute('aria-pressed', String(on));
  }
  const button = document.createElement('button');
  button.id = 'isoViewToggle'; button.type = 'button';
  button.style.cssText = 'position:fixed;z-index:40;top:58px;right:10px;padding:6px 10px;border-radius:8px;border:1px solid rgba(244,216,109,.55);' +
    'background:rgba(16,20,17,.86);color:#f5f1e8;font:650 13px system-ui,sans-serif;cursor:pointer';
  button.addEventListener('click', () => setOn(!view.on));
  document.body.appendChild(button);
  // Other layers may be created after this file runs: hide them as they appear.
  new MutationObserver(() => { if (view.on) for (const c of otherLayers()) c.style.visibility = 'hidden'; })
    .observe(document.body, { childList: true, subtree: true });
  setOn(true);
  loadAll();

  global.__ISO_VIEW_V1__ = Object.freeze({
    version: 'iso-view-v1', optIn: 'view=iso',
    isOn: () => view.on, setOn,
    stats: () => ({ ...view.stats, on: view.on, atlases: Object.keys(view.atlases).length, props: Object.keys(view.props).length,
      tiles: view.tiles.size, info: view.info.size, villageKinds: view.village ? Object.keys(view.village.kinds).length : 0,
      villageHouses: villageHouses().length, dressingItems: view.dressing ? view.dressing.length : 0, ppm: PPM, zoom: camera.zoom, missingNames: [...view.missingNames] }),
    screenOf: (wx, wy) => ({ x: sx(wx), y: sy(wy) }),
    // Door direction of each village house against its gate on the road (for tests).
    doorCheck: () => villageHouses().filter(h => Number.isFinite(h.accessX)).map(h => {
      const psi = headingOf(h, view.village ? view.village.headings : 16) * 2 * Math.PI / (view.village ? view.village.headings : 16);
      const fx = Math.sin(psi), fy = Math.cos(psi), gx = h.accessX - h.x, gy = h.accessY - h.y, l = Math.hypot(gx, gy) || 1;
      return (fx * gx + fy * gy) / l;
    }),
    bodyOf: u => ({ x: sx(u.x), y: sy(u.y) - (u.type === 'cavalry' ? 1.6 : 0.9) * LIFT * PPM * z() })
  });
})(window);
