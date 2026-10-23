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
  const VILLAGE_SCALE = 1.6;
  // Readability: scenery in front of soldiers turns see-through, and below this
  // zoom (or with Overzicht on) the small village dressing and chimney smoke go.
  const COVER_ALPHA = 0.32, OVERVIEW_ALPHA = 0.5, DETAIL_ZOOM = 0.55;
  const detailed = () => !view.overview && z() >= DETAIL_ZOOM;
  // Screen box of a sprite drawn at (X, Y) with its pivot, for the see-through test.
  const box = (X, Y, px, py, w, h, k) => [X - px * k, Y - py * k, X + (w - px) * k, Y + (h - py) * k];
  const view = { on: true, atlases: {}, props: {}, village: null, dressing: null, chimneyAt: new Map(), chimneySmoke: [], info: new Map(), missingNames: new Set(), corpses: [], smoke: [], tiles: new Map(), trenchLips: new Map(), trenchCrests: new Map(), towerFired: new Map(),
    tileTick: 0, frames: 0, lastNow: 0, regFire: new Map(), gunFire: new Map(), miniAt: 0, fogAt: 0,
    stats: { renderMs: 0, seeThrough: 0, flags: 0, ground: false, houses: 0, dressing: 0, chimneySmoke: 0, drawn: 0, sprites: 0, workers: 0, props: 0, tilesBaked: 0, tilesDrawn: 0, corpses: 0, smoke: 0, missing: 0 } };

  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177) >>> 0; h ^= h >>> 13;
    return (Math.imul(h, 1103515245) >>> 0) / 4294967296; };
  // Game facing/heading (radians, y down) -> sprite direction index.
  const dirOf = a => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;

  // ---- projection ----
  const z = () => camera.zoom;
  const sx = wx => (wx - camera.x) * z() + innerWidth / 2;
  const sy = wy => (wy - camera.y) * z() * SQ + innerHeight / 2;
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
    first.push(loadProps(), loadVillage(), loadGround(), load('frw', ['worker']), load('brw', ['worker']));
    // Extra looks stream in afterwards; until then everyone uses the base look.
    return Promise.all(first).then(() => Promise.all(['2', '3', '4', '5'].flatMap(l => ['fr', 'br'].map(p => load(p + l, INFANTRY)))
      .concat(['fr', 'br'].flatMap(p => [load(p + 'c2', ['cavalry', 'cavfight']), load(p + 'co', ['cavalry', 'cavfight'])]))
      // Spade work in a trench being dug, per look.
      .concat(['', '2', '3', '4', '5'].flatMap(l => ['fr', 'br'].map(p => loadSheet(p + l, 'dig')
        .then(part => { view.atlases[p + l + ':dig'] = indexAtlas([part]); }).catch(err => console.warn(err.message)))))));
  }
  function loadProps() {
    return fetch(ASSETS + 'iso/props/props.json').then(r => r.json()).then(m => Promise.all(Object.entries(m.props)
      .map(([kind, meta]) => loadImage(ASSETS + 'iso/props/' + meta.image).then(image => { view.props[kind] = { ...meta, image }; }))))
      .catch(err => console.warn('iso: props', err));
  }
  // The whole battlefield rendered in Blender (scripts/render-iso-gamemap.py).
  function loadGround() {
    const dir = ASSETS + 'iso/game/';
    return fetch(dir + 'ground.json').then(r => r.ok ? r.json() : null).then(meta => meta && loadImage(dir + meta.image)
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
      .catch(err => console.warn('iso: grond', err));
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
    const X = sx(house.x), Y = gy(house.x, house.y), reach = house.w * VILLAGE_SCALE * z();
    if (X < -reach || X > innerWidth + reach || Y < -reach * 0.6 || Y > innerHeight + reach * 1.4) return null;
    const heading = headingOf(house, V.headings), f = meta.frames[heading];
    if (detailed()) chimneys(house, kind, meta, heading);
    const k = houseScale(house, meta) * z() / V.pxPerM;
    return { y: house.y, box: box(X, Y, f.px, f.py, f.w, f.h, k), draw: () => {
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
      return { y: it.y, box: box(X, Y, prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
        ctx.drawImage(prop.image, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.dressing++; } };
    }
    const V = view.village, meta = V && V.kinds[it.edge]; if (!meta) return null;
    const f = meta.frames[((Math.round(-it.angle / (2 * Math.PI / V.headings)) % V.headings) + V.headings) % V.headings];
    return { y: it.y, draw: () => { const k = DRESS_PPM * z() / V.pxPerM;
      ctx.drawImage(meta.image, f.x, f.y, f.w, f.h, X - f.px * k, Y - f.py * k, f.w * k, f.h * k); view.stats.dressing++; } };
  }

  // ---- the game's woods: stands of oak and poplar (they slow movement in the game) ----
  function buildWoodTrees() {
    const woods = typeof TERRAIN_WOODS !== 'undefined' ? TERRAIN_WOODS : [], trees = [];
    woods.forEach((w, i) => {
      for (let y = w.y + 30; y < w.y + w.h - 10; y += 62) for (let x = w.x + 30; x < w.x + w.w - 10; x += 70) {
        const r = hash(Math.round(x), Math.round(y) + i), tx = x + (r - 0.5) * 50, ty = y + (hash(Math.round(y), Math.round(x)) - 0.5) * 40;
        if (r < 0.12) continue;   // clearings
        if (typeof roadNetworkAtV066 === 'function' && roadNetworkAtV066(tx, ty)) continue;
        if (typeof riverHitV067 === 'function') { const h = riverHitV067(tx, ty); if (h && h.distance < 110) continue; }
        trees.push({ x: tx, y: ty, kind: r > 0.8 ? 'poplar' : 'oak', scale: 0.5 + r * 0.25 });
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
    return trees;
  }
  function woodTreeDrawable(tr) {
    const X = sx(tr.x), Y = gy(tr.x, tr.y);
    if (X < -150 || X > innerWidth + 150 || Y < -30 || Y > innerHeight + 260) return null;
    const prop = view.props[tr.kind]; if (!prop) return null;
    const k = spriteK() * tr.scale;
    return { y: tr.y, box: box(X, Y, prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
      ctx.drawImage(prop.image, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.props++; } };
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
    return { y: b.y, box: box(X, Y, prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
      ctx.drawImage(prop.image, X - prop.pivot.x * k, Y - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.bridges++; } };
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
    if (!d || !d.moved) return;
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
    const foot = own.some(u => u.type === 'infantry' || u.type === 'officer'), guns = own.every(u => u.type === 'artillery');
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
    ctx.drawImage(G.img, c0, r0, c1 - c0, r1 - r0, sx(c0 / k), sy((r0 - G.pad) / h), (c1 - c0) / k * z(), (r1 - r0) / h * z() * SQ);
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
        h: height, born: now, life: (gun ? 5 : 3) + s * 1.5, size: (gun ? 1.1 : 0.35) + s * (gun ? 0.8 : 0.25), seed: s });
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
    if (u.type === 'worker') {
      const key = p + 'w';
      if (m.moving) return [key, 'march_' + d, step(MARCH_STRIDE, 6)];
      // At work: chopping, harvesting or building where his task has taken him.
      if (u.task && u.task !== 'idle') return [key, 'work_' + d, Math.floor(now / 0.3 + hash(u.id, 3) * 4) % 4];
      return [key, 'idle_' + d, Math.floor(now / 0.7 + hash(u.id, 2) * 2) % 2];
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
  const BUILDING_PROP = { towncenter: 'barracks', barracks: 'barracks', house: 'cottage', tower: 'tower' };
  const SIDED_PROPS = new Set(['barracks', 'tower']);
  function buildingDrawable(b) {
    if (b.dead) return null;
    if (b.side === 'britain' && typeof isVisibleToFrance === 'function' && !isVisibleToFrance(b)) return null;
    if (b.type === 'farm') return { y: b.y, draw: () => drawFarm(b) };
    const base = BUILDING_PROP[b.type] || 'cottage', kind = SIDED_PROPS.has(base) ? base + '_' + (b.side === 'france' ? 'fr' : 'br') : base;
    const prop = view.props[kind]; if (!prop) return null;
    // Fit the rendered building to the game's footprint (a little larger: the
    // props carry their eaves and yard beyond the walls).
    // A tower stands tall over the men (a bit over half true size, like a
    // house's miniature footprint would make it a stump next to them).
    const k = b.type === 'tower' ? spriteK() * 0.55 : b.w * z() * 1.45 / prop.w;
    if (b.type === 'tower') towerSmoke(b, prop, k);
    return { y: b.y + b.h * 0.3, box: box(sx(b.x), gy(b.x, b.y), prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
      ctx.globalAlpha *= b.complete === false ? 0.45 + 0.5 * (b.construction || 0) : 1;
      ctx.drawImage(prop.image, sx(b.x) - prop.pivot.x * k, gy(b.x, b.y) - prop.pivot.y * k, prop.w * k, prop.h * k);
      ctx.globalAlpha = 1; view.stats.props++;
    } };
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
    if (r.dead || r.amount <= 0) return null;
    if (r.type === 'wood') {
      const prop = view.props[hash(r.id, 3) < 0.65 ? 'oak' : 'poplar']; if (!prop) return null;
      const k = spriteK() * (0.55 + hash(r.id, 5) * 0.25);
      return { y: r.y, box: box(sx(r.x), gy(r.x, r.y), prop.pivot.x, prop.pivot.y, prop.w, prop.h, k), draw: () => {
        ctx.drawImage(prop.image, sx(r.x) - prop.pivot.x * k, gy(r.x, r.y) - prop.pivot.y * k, prop.w * k, prop.h * k); view.stats.props++; } };
    }
    if (r.type === 'iron') return { y: r.y, draw: () => drawRock(r) };
    const prop = view.props.bush; if (!prop) return null;
    return { y: r.y, draw: () => { const k = spriteK() * 0.75;
      ctx.drawImage(prop.image, sx(r.x) - prop.pivot.x * k, gy(r.x, r.y) - prop.pivot.y * k, prop.w * k, prop.h * k);
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
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, kind === 'gun' ? 'rgba(232,228,218,.85)' : 'rgba(240,238,230,.8)'); grad.addColorStop(1, 'rgba(225,222,212,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64); return (PUFFS[kind] = c);
  }
  function drawSmoke(now) {
    view.smoke = view.smoke.filter(s => now - s.born < s.life);
    const img = puff('m'), wind = 0.35;
    for (const s of view.smoke) {
      // Smoke stays thin enough to see the men through it (thinner still in Overzicht).
      const age = (now - s.born) / s.life, r = (s.size + age * 1.2) * PPM * z();
      const x = sx(s.wx + wind * (now - s.born) * PPM), y = gy(s.wx, s.wy) - (s.h + age * 1.6) * LIFT * PPM * z();
      ctx.globalAlpha = (1 - age) * (view.overview ? 0.22 : 0.42); ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; view.stats.smoke = view.smoke.length;
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
    for (const c of [fogA, fogB, fogMix, seenLayer, sightLayer]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; view.fogCam = null; view.fogPrev = null; }
    // Shift since the last redraw (screen px); redraw when zoomed, shifted far, or stale.
    const F = view.fogCam, dx = F ? (F.x - camera.x) * z() : 0, dy = F ? (F.y - camera.y) * z() * SQ : 0;
    const moved = !F || F.zoom !== camera.zoom || dx !== 0 || dy !== 0;
    if (!F || F.zoom !== camera.zoom || Math.abs(dx) > FOG_M || Math.abs(dy) > FOG_M || now - view.fogAt > (moved ? 120 : 200)) {
      // The newest becomes the one before; draw into the other canvas.
      view.fogPrev = F && F.zoom === camera.zoom ? { canvas: fog, cam: F } : null;
      view.fogFade = Math.min(250, Math.max(50, now - view.fogAt));
      fog = fog === fogA ? fogB : fogA; fogCtx2 = fog.getContext('2d');
      view.fogCam = { x: camera.x, y: camera.y, zoom: camera.zoom }; view.fogAt = now;
      const pad = 2 * FOG_M + 2 * PPM * z(), a = isoScreenToWorld(-pad, -pad), b = flatScreenToWorld(innerWidth + pad, innerHeight + pad);
      // The cover mask: full where never seen, part where seen before, none in sight.
      const f = fogCtx2;
      f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1; f.filter = 'none'; f.clearRect(0, 0, w, h);
      f.fillStyle = '#fff'; f.fillRect(0, 0, w, h);
      // Ground seen before: a disc on every explored cell on screen (they overlap
      // into a rounded outline), lifted onto the relief.
      seenCtx.clearRect(0, 0, w, h); seenCtx.fillStyle = '#000'; seenCtx.beginPath();
      let cells = 0;
      if (typeof exploredCells !== 'undefined' && typeof EXPLORE_CELL === 'number') {
        const C = EXPLORE_CELL, gx0 = Math.floor(Math.min(a.x, b.x) / C) - 1, gx1 = Math.ceil(Math.max(a.x, b.x) / C) + 1;
        const gy0 = Math.floor(Math.min(a.y, b.y) / C) - 1, gy1 = Math.ceil(Math.max(a.y, b.y) / C) + 1 + Math.ceil((view.relief ? view.relief.maxM : 0) * PPM / C * 2);
        for (let cy = gy0; cy <= gy1; cy++) for (let cx = gx0; cx <= gx1; cx++) {
          if (!exploredCells.has(`${cx},${cy}`)) continue;
          groundPath(seenCtx, disc((cx + 0.5) * C, (cy + 0.5) * C, C * 0.8, 14)); cells++;
        }
      }
      seenCtx.fill();
      // In sight now: each source's circle, its rim lying on the relief.
      sightCtx.clearRect(0, 0, w, h); sightCtx.fillStyle = '#000'; sightCtx.beginPath();
      let sources = 0;
      for (const src of frenchVisionSources()) {
        const r = visionRadius(src);
        if (src.x + r < a.x || src.x - r > b.x || src.y + r < a.y || src.y - r > b.y + (view.relief ? view.relief.maxM * PPM * 2 : 0)) continue;
        groundPath(sightCtx, disc(src.x, src.y, r, 48)); sources++;
      }
      sightCtx.fill();
      // Cut both out of the mist, blurred so the edges are soft.
      const soft = Math.max(3, 30 * z());
      f.globalCompositeOperation = 'destination-out';
      if (FOG_SOFT) f.filter = `blur(${soft}px)`;
      f.globalAlpha = SEEN_VEIL; f.drawImage(seenLayer, 0, 0);
      if (FOG_SOFT) f.filter = `blur(${soft}px)`;
      f.globalAlpha = 1; f.drawImage(sightLayer, 0, 0);
      f.filter = 'none'; f.globalCompositeOperation = 'source-over';
      billowEdges(f, w, h, now);
      view.stats.fogCells = cells; view.stats.fogSources = sources;
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
  // redraw of the mask (5-8 times a second); the noise is fixed to the ground
  // and drifts with the cloud deck. Both rims are shaped: cloud to haze over
  // ground seen before, and haze (or cloud) to clear ground in sight.
  const EDGE_SPAN = 1300, EDGE_PUSH = 1.1;
  function billowEdges(f, w, h, now) {
    const F = view.cloudField; if (!F) return;
    let img;
    try { img = f.getImageData(0, 0, w, h); } catch (_) { return; }
    const d = img.data, N = 256, L = 1 - SEEN_VEIL, zz = z(), drift = (now / 1000 * 9) % EDGE_SPAN;
    // Ground position of each column and row (flat; the noise needs no relief).
    const us = new Int32Array(w), us2 = new Int32Array(w);
    for (let x = 0; x < w; x++) {
      const wx = ((x - FOG_M) * 2 - innerWidth / 2) / zz + camera.x - drift, u = wx / EDGE_SPAN * N;
      us[x] = ((Math.floor(u) % N) + N) % N; us2[x] = ((Math.floor(u * 2.1 + 91) % N) + N) % N;
    }
    for (let y = 0; y < h; y++) {
      const wy = ((y - FOG_M) * 2 - innerHeight / 2) / (zz * SQ) + camera.y, v = wy / EDGE_SPAN * N;
      const row = (((Math.floor(v) % N) + N) % N) * N, row2 = (((Math.floor(v * 2.1 + 37) % N) + N) % N) * N;
      for (let x = 0, i = y * w * 4 + 3; x < w; x++, i += 4) {
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
    f.putImageData(img, 0, 0);
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
    const so = Math.max(3, 14 * z());
    ctx.drawImage(shadeCv, -2 * FOG_M + so, -2 * FOG_M + so * 1.6, w * 4, h * 4);
    ctx.drawImage(cloudCv, -2 * FOG_M, -2 * FOG_M, w * 4, h * 4);
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
  function drawRanges() {
    const circles = [];
    for (const u of selectedUnits) { const r = rangeOf(u); if (r) circles.push([u.x, u.y, r]); }
    const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
    const tower = b && !b.dead && b.type === 'tower' && b.complete !== false ? global.__WATCHTOWER_V1__?.config?.range : 0;
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
    const t = now / 1000, dt = view.lastNow ? Math.min(0.1, t - view.lastNow) : 0; view.lastNow = t;
    view.frames++;
    if (view.frames % 30 === 1) refreshCrew();
    const st = view.stats; st.drawn = st.sprites = st.workers = st.props = st.houses = st.dressing = st.bridges = st.onBridge = st.stances = st.digging = st.leaning = st.gabions = st.fascines = 0;
    panFix();
    ensureAttackHook();
    drawTerrain();
    view.stats.trenches = 0;
    drawWetGround(t);
    drawTrenchBeds(t);
    drawCraters();
    const k = spriteK(), seen = new Set(), list = [];
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
      const m = infoOf(u); track(u, m, t, dt);
      if (!visible(u)) continue;
      if (sx(u.x) < -80 || sx(u.x) > innerWidth + 80 || gy(u.x, u.y) < -40 || gy(u.x, u.y) > innerHeight + 140) continue;
      const orders = global.__REGIMENT_ORDERS_V1__, deck = deckAt(u.x, u.y);
      const sunk = !deck && (orders?.trenchAt?.(u.x, u.y) || orders?.diggingAt?.(u.x, u.y));
      const musketeer = u.type === 'infantry' && !crewIds.has(u.id);
      // Musketeers in a trench being dug are at work with the spade, deeper as it grows.
      // ...also while they revet or fortify a finished one (an upgrade bought for resources).
      m.digging = sunk && (sunk.progress < 1 || sunk.upgrade) && musketeer && orders?.diggingAt?.(u.x, u.y) ? sunk : null;
      if (m.digging) st.digging++;
      if (m.moving) leaveTrack(u, m);
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
      list.push({ y: key, unit: { x: X, y: Y - lift, wy: key }, draw: () => {
        if (crest) { ctx.save(); const dy = CREST_OVERHANG * PPM * LIFT * z(); clipBelowLine(crest.map(q => [q[0], q[1] + dy])); }
        else if (lip) { ctx.save(); clipAboveLip(lip); }
        // A faint ring in the side's colour under every man, horse and gun.
        const rr = (u.type === 'cavalry' ? 0.95 : u.type === 'artillery' ? 1.1 : 0.42) * PPM * z();
        ctx.fillStyle = u.side === 'france' ? 'rgba(70,110,230,.38)' : 'rgba(225,60,50,.38)';
        ctx.beginPath(); ctx.ellipse(X, Y, rr, rr * SQ, 0, 0, 7); ctx.fill();
        if (u.type === 'worker' && !view.atlases[(u.side === 'france' ? 'fr' : 'br') + 'w']) { drawWorker(u, m); if (crest || lip) ctx.restore(); return; }
        const [key, anim, f] = frameFor(u, m, t);
        // Until its atlas has loaded a unit is simply not drawn yet.
        if (drawSprite(view.atlases[key], anim, f, X, Y, k)) st.sprites++;
        if (crest || lip) ctx.restore();
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
      const X = sx(c.x), Y = gy(c.x, c.y);
      if (X < -60 || X > innerWidth + 60 || Y < -40 || Y > innerHeight + 80) continue;
      list.push({ y: c.y - 0.5, draw: () => drawSprite(view.atlases[c.key], c.anim, Math.min(3, Math.floor((t - c.t0) / DIE_FRAME)), X, Y, k) });
    }
    st.corpses = view.corpses.length;
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
    list.sort((p, q) => p.y - q.y);
    const men = list.filter(d => d.unit).map(d => d.unit);
    st.seeThrough = 0;
    for (const d of list) {
      if (!d.box) { d.draw(); continue; }
      // Scenery with a soldier behind it (inside its picture) turns see-through.
      const [x0, y0, x1, y1] = d.box, ix = (x1 - x0) * 0.12, iy = (y1 - y0) * 0.08;
      let a = view.overview ? OVERVIEW_ALPHA : 1;
      for (const p of men) if (p.wy < d.y && p.x > x0 + ix && p.x < x1 - ix && p.y > y0 + iy && p.y < y1 - iy) { a = Math.min(a, COVER_ALPHA); st.seeThrough++; break; }
      ctx.globalAlpha = a; d.draw(); ctx.globalAlpha = 1;
    }
    drawProjectiles();
    drawStances();
    if (detailed()) drawChimneySmoke(t);
    drawSmoke(t);
    drawFog();
    drawWeather(t);
    drawDragBox();
    drawFacingArrow();
    soundTick(t);
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
  const TRACK_MAX = 2600;
  view.tracks = [];
  const weather = () => global.__WEATHER_V1__?.state?.();
  function leaveTrack(u, m) {
    const w = weather(); if (!w || w.wetness < 0.2) return;
    const kind = u.type === 'cavalry' ? 'hoof' : u.type === 'artillery' ? 'wheel' : 'boot';
    const gap = (kind === 'hoof' ? 1.3 : kind === 'wheel' ? 0.7 : 0.8) * PPM;
    if (m.trackX != null && Math.hypot(u.x - m.trackX, u.y - m.trackY) < gap) return;
    const a = m.trackX != null ? Math.atan2(u.y - m.trackY, u.x - m.trackX) : (u.facing || 0);
    m.trackX = u.x; m.trackY = u.y; m.trackStep = (m.trackStep || 0) + 1;
    view.tracks.push({ x: u.x, y: u.y, a, kind, t: elapsed, s: m.trackStep & 1 });
    if (view.tracks.length > TRACK_MAX) view.tracks.splice(0, view.tracks.length - TRACK_MAX);
  }
  function drawWetGround(now) {
    const w = weather(); if (!w) return;
    const wet = w.wetness;
    if (wet > 0.02) {
      // Soaked earth and grass: darker, a little cooler.
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(150,158,170,${0.55 * wet})`; ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = 'source-over';
      // Puddles in low spots (a fixed scatter over the map), reflecting the sky.
      if (wet > 0.35) {
        const cell = 150, x0 = flatScreenToWorld(-60, -60), x1 = flatScreenToWorld(innerWidth + 60, innerHeight + 60);
        for (let gx = Math.floor(x0.x / cell); gx <= Math.ceil(x1.x / cell); gx++) for (let gyy = Math.floor(x0.y / cell); gyy <= Math.ceil(x1.y / cell); gyy++) {
          if (hash(gx * 92821 + gyy, 7) > 0.22) continue;
          const wx = (gx + hash(gx, gyy)) * cell, wy = (gyy + hash(gyy, gx + 3)) * cell, r = (8 + hash(gx + 5, gyy) * 16) * z() * Math.min(1, (wet - 0.35) * 2.5);
          const X = sx(wx), Y = gy(wx, wy);
          const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
          g.addColorStop(0, 'rgba(112,126,138,.42)'); g.addColorStop(0.6, 'rgba(84,92,98,.34)'); g.addColorStop(0.85, 'rgba(58,50,40,.25)'); g.addColorStop(1, 'rgba(58,50,40,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, r * 1.4, r * SQ, hash(gx, gyy + 9) * 0.6, 0, 7); ctx.fill();
        }
      }
    }
    // Tracks: they fade over a few minutes, faster as the ground dries.
    if (!view.tracks.length) return;
    const life = 90 + 150 * wet;
    let n = 0;
    ctx.fillStyle = 'rgba(48,38,27,.55)'; ctx.strokeStyle = 'rgba(48,38,27,.5)';
    for (const tr of view.tracks) {
      const age = elapsed - tr.t; if (age > life || age < 0) continue;
      const X = sx(tr.x), Y = gy(tr.x, tr.y);
      if (X < -20 || X > innerWidth + 20 || Y < -20 || Y > innerHeight + 20) continue;
      ctx.globalAlpha = Math.min(1, (1 - age / life) * 1.4) * (0.4 + 0.6 * Math.max(wet, 0.3));
      const ca = Math.cos(tr.a), sa = Math.sin(tr.a), k = PPM * z();
      // Across the way of travel, on the ground (squeezed vertically like the ground).
      const off = (d, e) => [X + (ca * d - sa * e) * k, Y + (sa * d + ca * e) * k * SQ];
      if (tr.kind === 'boot') {
        const [px, py] = off(0, tr.s ? 0.1 : -0.1);
        ctx.beginPath(); ctx.ellipse(px, py, 0.13 * k, 0.05 * k, Math.atan2(sa * SQ, ca), 0, 7); ctx.fill();
      } else if (tr.kind === 'hoof') {
        for (const [d, e] of [[0.25, 0.18], [0.25, -0.18], [-0.35, 0.16], [-0.35, -0.16]]) {
          const [px, py] = off(d, e); ctx.beginPath(); ctx.arc(px, py, 0.07 * k, 0.3, 5.9); ctx.fill();
        }
      } else {
        ctx.lineWidth = Math.max(1, 0.1 * k);
        for (const e of [0.75, -0.75]) { const [ax, ay] = off(-0.4, e), [bx, by] = off(0.4, e); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
      }
      n++;
    }
    ctx.globalAlpha = 1; view.stats.tracks = n;
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
      const n = Math.round((W * H / 3600) * w.rain);
      ctx.strokeStyle = 'rgba(205,214,228,.38)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ((hash(i, 1) * (W + 200) + now * vx * (0.8 + hash(i, 2) * 0.4)) % (W + 200) + (W + 200)) % (W + 200) - 100;
        const y = ((hash(i, 3) * (H + 100) + now * vy * (0.8 + hash(i, 4) * 0.4)) % (H + 100)) - 50;
        ctx.moveTo(x, y); ctx.lineTo(x - nx * len, y - ny * len);
      }
      ctx.stroke();
      view.stats.rainDrops = n;
    } else view.stats.rainDrops = 0;
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
    if (typeof overview !== 'undefined') overview.style.display = on ? '' : 'none';
  }
  const button = document.createElement('button');
  button.id = 'isoViewToggle'; button.type = 'button';
  button.style.cssText = 'position:fixed;z-index:40;top:58px;right:10px;padding:6px 10px;border-radius:8px;border:1px solid rgba(244,216,109,.55);' +
    'background:rgba(16,20,17,.86);color:#f5f1e8;font:650 13px system-ui,sans-serif;cursor:pointer';
  button.addEventListener('click', () => setOn(!view.on));
  document.body.appendChild(button);
  // Overzicht: decoration dimmed and the small village detail hidden, for a clear view of the battle.
  const overview = document.createElement('button');
  overview.id = 'isoOverviewToggle'; overview.type = 'button';
  overview.style.cssText = 'position:fixed;z-index:40;top:58px;right:136px;padding:6px 10px;border-radius:8px;border:1px solid rgba(244,216,109,.55);' +
    'background:rgba(16,20,17,.86);color:#f5f1e8;font:650 13px system-ui,sans-serif;cursor:pointer';
  const setOverview = on => { view.overview = on; overview.textContent = on ? '👁 Overzicht: aan' : '👁 Overzicht: uit';
    overview.setAttribute('aria-pressed', String(on)); };
  overview.addEventListener('click', () => setOverview(!view.overview));
  document.body.appendChild(overview);
  setOverview(false);
  // Other layers may be created after this file runs: hide them as they appear.
  new MutationObserver(() => { if (view.on) for (const c of otherLayers()) c.style.visibility = 'hidden'; })
    .observe(document.body, { childList: true, subtree: true });
  setOn(true);
  loadAll();

  global.__ISO_VIEW_V1__ = Object.freeze({
    version: 'iso-view-v1', optIn: 'view=iso',
    isOn: () => view.on, setOn, setOverview,
    stats: () => ({ ...view.stats, on: view.on, atlases: Object.keys(view.atlases).length, props: Object.keys(view.props).length,
      tiles: view.tiles.size, info: view.info.size, woodTrees: view.woodTrees ? view.woodTrees.length : 0,
      workerSprites: !!view.atlases.frw, digSprites: !!view.atlases['fr:dig'] && !!view.atlases['br:dig'], labAudio: !!labAudio.ctl, overview: !!view.overview, detailed: detailed(), villageKinds: view.village ? Object.keys(view.village.kinds).length : 0,
      relief: view.relief ? view.relief.maxM : 0, heightSight: !!view.heightSight, villageHouses: villageHouses().length, openMap: global.__OPEN_MAP_V1__?.after || null, dressingItems: view.dressing ? view.dressing.length : 0, ppm: PPM, zoom: camera.zoom, missingNames: [...view.missingNames] }),
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
