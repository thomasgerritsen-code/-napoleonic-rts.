// GRAPHICS-V2 / PixiJS vertical-slice renderer.
// Opt-in only: normal 2D/Three.js paths stay untouched until the user enables Pixi V2.

const PIXI_CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.mjs';
const source = window.NRTS_3D_SOURCE;
const host = document.getElementById('app');
const canvas2d = document.getElementById('game');

if (!source || !host || !canvas2d) {
  console.warn('Pixi V2 renderer skipped: simulation bridge/app canvas unavailable.');
} else {
  const STORAGE_KEY = 'nrts-pixi-v1';
  let PIXI = null;
  let app = null;
  let world = null;
  let terrainLayer = null;
  let depthLayer = null;
  let effectsLayer = null;
  let enabled = false;
  let loading = false;
  let loadError = '';
  let returnTo3D = true;
  let lastSnapshot = null;
  let lastResourceSignature = '';
  let rightDrag = null;

  const unitNodes = new Map();
  const buildingNodes = new Map();
  const sceneryNodes = [];
  const smoke = [];
  const staticWorld = source.staticWorld();
  const WORLD = staticWorld.world;

  const palette = Object.freeze({
    grass: 0x6f7d50,
    grassDark: 0x596845,
    grassLight: 0x849066,
    soil: 0xa28760,
    soilDark: 0x70563d,
    french: 0x234f91,
    frenchLight: 0xe8e7de,
    british: 0xa43d36,
    britishLight: 0xe9dfc7,
    selected: 0xf0d36d,
    skin: 0xd1a27c,
    shako: 0x20201d,
    wood: 0x5c412c,
    foliage: 0x365f38,
    foliage2: 0x4a7345,
    smoke: 0xd8d4c8,
    roof: 0x68493b,
    plaster: 0xc6b79b,
    stone: 0x8d8274,
    horse: 0x594131
  });

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function addGroundTexture() {
    const base = new PIXI.Graphics();
    base.rect(0, 0, WORLD.width, WORLD.height).fill(palette.grass);
    terrainLayer.addChild(base);

    const rng = mulberry32(1815);
    for (let i = 0; i < 260; i++) {
      const x = rng() * WORLD.width;
      const y = rng() * WORLD.height;
      const rx = 18 + rng() * 85;
      const ry = 10 + rng() * 48;
      const patch = new PIXI.Graphics();
      patch.ellipse(x, y, rx, ry).fill({
        color: rng() > 0.48 ? palette.grassDark : palette.grassLight,
        alpha: 0.055 + rng() * 0.055
      });
      terrainLayer.addChild(patch);
    }

    for (let i = 0; i < 18; i++) {
      const x = rng() * WORLD.width;
      const y = rng() * WORLD.height;
      const w = 120 + rng() * 260;
      const h = 70 + rng() * 180;
      const field = new PIXI.Graphics();
      field.roundRect(x, y, w, h, 18).fill({ color: 0x8b8a58, alpha: 0.08 });
      field.rotation = (rng() - 0.5) * 0.24;
      terrainLayer.addChild(field);
    }
  }

  function addRoads() {
    for (const road of staticWorld.roads || []) {
      if (!road.points?.length) continue;
      const edge = new PIXI.Graphics();
      edge.moveTo(road.points[0].x, road.points[0].y);
      for (let i = 1; i < road.points.length; i++) edge.lineTo(road.points[i].x, road.points[i].y);
      edge.stroke({ width: Math.max(15, (road.width || 16) + 12), color: palette.soilDark, alpha: 0.38 });
      terrainLayer.addChild(edge);

      const roadFill = new PIXI.Graphics();
      roadFill.moveTo(road.points[0].x, road.points[0].y);
      for (let i = 1; i < road.points.length; i++) roadFill.lineTo(road.points[i].x, road.points[i].y);
      roadFill.stroke({ width: Math.max(10, road.width || 16), color: palette.soil, alpha: 0.94 });
      terrainLayer.addChild(roadFill);

      const track = new PIXI.Graphics();
      track.moveTo(road.points[0].x, road.points[0].y);
      for (let i = 1; i < road.points.length; i++) track.lineTo(road.points[i].x, road.points[i].y);
      track.stroke({ width: 2.2, color: 0x5f4935, alpha: 0.28 });
      terrainLayer.addChild(track);
    }
  }

  function makeTree(x, y, scale = 1) {
    const node = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.ellipse(6, 7, 15 * scale, 7 * scale).fill({ color: 0x111111, alpha: 0.17 });
    node.addChild(shadow);
    const trunk = new PIXI.Graphics();
    trunk.roundRect(-2.5 * scale, -10 * scale, 5 * scale, 18 * scale, 2).fill(palette.wood);
    node.addChild(trunk);
    const crown = new PIXI.Graphics();
    crown.circle(-5 * scale, -17 * scale, 10 * scale).fill(palette.foliage);
    crown.circle(5 * scale, -19 * scale, 11 * scale).fill(palette.foliage2);
    crown.circle(0, -27 * scale, 12 * scale).fill(palette.foliage);
    node.addChild(crown);
    node.position.set(x, y);
    node.zIndex = y;
    depthLayer.addChild(node);
    sceneryNodes.push(node);
  }

  function makeHouse(house) {
    const node = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.ellipse(6, 6, house.w * 0.52, house.h * 0.34).fill({ color: 0x111111, alpha: 0.16 });
    node.addChild(shadow);
    const body = new PIXI.Graphics();
    const wallColor = house.kind === 'chapel' ? palette.stone : house.kind === 'barn' ? 0x81634a : palette.plaster;
    body.roundRect(-house.w / 2, -house.h / 2, house.w, house.h, 3).fill(wallColor);
    node.addChild(body);
    const roof = new PIXI.Graphics();
    roof.poly([
      -house.w * 0.58, -house.h * 0.18,
      0, -house.h * 0.72,
      house.w * 0.58, -house.h * 0.18,
      house.w * 0.48, house.h * 0.02,
      -house.w * 0.48, house.h * 0.02
    ]).fill(palette.roof);
    node.addChild(roof);
    const door = new PIXI.Graphics();
    door.rect(-3, house.h * 0.05, 6, house.h * 0.34).fill(0x5b4432);
    node.addChild(door);
    node.position.set(house.x, house.y);
    node.rotation = house.angle || 0;
    node.zIndex = house.y + house.h * 0.5;
    depthLayer.addChild(node);
    sceneryNodes.push(node);
  }

  function rebuildScenery() {
    for (const node of sceneryNodes.splice(0)) node.destroy({ children: true });
    for (const village of staticWorld.villages || []) {
      for (const house of village.houses || []) makeHouse(house);
    }
    const resources = source.resources();
    const trees = resources.filter(r => r.type === 'wood').slice(0, 360);
    trees.forEach((tree, i) => makeTree(tree.x, tree.y, 0.75 + (i % 7) * 0.045));
    lastResourceSignature = `${resources.length}:${trees.length}:${trees.slice(0, 12).map(t => t.id).join('|')}`;
  }

  function uniformColors(unit) {
    return unit.side === 'france'
      ? { coat: palette.french, trim: palette.frenchLight }
      : { coat: palette.british, trim: palette.britishLight };
  }

  function buildInfantryVisual(unit) {
    const colors = uniformColors(unit);
    const node = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.ellipse(3, 5, 7.5, 3.5).fill({ color: 0x111111, alpha: 0.23 });
    node.addChild(shadow);
    const body = new PIXI.Graphics();
    body.roundRect(-4.2, -6.4, 8.4, 12.8, 2).fill(colors.coat);
    body.rect(-3.7, -1.0, 7.4, 1.8).fill(colors.trim);
    body.circle(0, -8.5, 2.3).fill(palette.skin);
    body.rect(-2.2, -12.2, 4.4, 3.5).fill(palette.shako);
    body.moveTo(2.5, -5.0).lineTo(12.5, -5.0).stroke({ width: 1.6, color: 0x493424 });
    node.addChild(body);
    return node;
  }

  function buildCavalryVisual(unit) {
    const colors = uniformColors(unit);
    const node = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.ellipse(1, 5, 13, 5.5).fill({ color: 0x111111, alpha: 0.20 });
    g.ellipse(0, 0, 11, 5).fill(palette.horse);
    g.roundRect(-3.7, -9.0, 7.4, 10.0, 2).fill(colors.coat);
    g.circle(0, -11.2, 2.2).fill(palette.skin);
    g.rect(-2.1, -14.4, 4.2, 3.1).fill(palette.shako);
    g.moveTo(3, -6).lineTo(15, -8).stroke({ width: 1.4, color: 0x493424 });
    node.addChild(g);
    return node;
  }

  function buildArtilleryVisual(unit) {
    const colors = uniformColors(unit);
    const node = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.ellipse(1, 5, 14, 5).fill({ color: 0x111111, alpha: 0.18 });
    g.circle(-6, 2, 4).fill(0x493827);
    g.circle(6, 2, 4).fill(0x493827);
    g.moveTo(-8, 0).lineTo(14, 0).stroke({ width: 4.2, color: 0x383734 });
    g.roundRect(-3, -7, 6, 8, 2).fill(colors.coat);
    g.circle(0, -9, 2).fill(palette.skin);
    node.addChild(g);
    return node;
  }

  function createUnitNode(unit) {
    const node = unit.type === 'cavalry' ? buildCavalryVisual(unit)
      : unit.type === 'artillery' ? buildArtilleryVisual(unit)
      : buildInfantryVisual(unit);
    const selection = new PIXI.Graphics();
    selection.circle(0, 0, unit.type === 'cavalry' ? 16 : unit.type === 'artillery' ? 17 : 11)
      .stroke({ width: 1.6, color: palette.selected, alpha: 0.92 });
    selection.visible = false;
    node.addChildAt(selection, 0);
    node.__selection = selection;
    node.__type = unit.type;
    depthLayer.addChild(node);
    unitNodes.set(unit.id, node);
    return node;
  }

  function updateUnits(snapshot) {
    const selected = new Set(snapshot.selection?.unitIds || []);
    const live = new Set();
    for (const unit of snapshot.units || []) {
      if (unit.dead || unit.type === 'worker') continue;
      live.add(unit.id);
      const node = unitNodes.get(unit.id) || createUnitNode(unit);
      node.position.set(unit.x, unit.y);
      node.rotation = unit.facing || 0;
      node.zIndex = unit.y + (unit.type === 'cavalry' ? 8 : 5);
      node.__selection.visible = selected.has(unit.id);
      node.alpha = unit.routing ? 0.65 : 1;
    }
    for (const [id, node] of unitNodes) {
      if (live.has(id)) continue;
      node.destroy({ children: true });
      unitNodes.delete(id);
    }
  }

  function createBuildingNode(building) {
    const node = new PIXI.Container();
    const g = new PIXI.Graphics();
    const w = Math.max(36, building.w || 56);
    const h = Math.max(28, building.h || 44);
    g.ellipse(5, 7, w * 0.5, h * 0.28).fill({ color: 0x111111, alpha: 0.16 });
    g.roundRect(-w / 2, -h / 2, w, h, 4).fill(0xb9a78c);
    g.poly([-w * 0.56, -h * 0.15, 0, -h * 0.72, w * 0.56, -h * 0.15]).fill(building.side === 'france' ? 0x4f5c70 : 0x71473e);
    node.addChild(g);
    const ring = new PIXI.Graphics();
    ring.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 5).stroke({ width: 2, color: palette.selected });
    ring.visible = false;
    node.addChild(ring);
    node.__selection = ring;
    depthLayer.addChild(node);
    buildingNodes.set(building.id, node);
    return node;
  }

  function updateBuildings(snapshot) {
    const live = new Set();
    for (const b of snapshot.buildings || []) {
      if (b.dead) continue;
      live.add(b.id);
      const node = buildingNodes.get(b.id) || createBuildingNode(b);
      node.position.set(b.x, b.y);
      node.zIndex = b.y + (b.h || 44) * 0.5;
      node.__selection.visible = snapshot.selection?.buildingId === b.id;
      node.alpha = b.complete === false ? 0.65 : 1;
    }
    for (const [id, node] of buildingNodes) {
      if (live.has(id)) continue;
      node.destroy({ children: true });
      buildingNodes.delete(id);
    }
  }

  function spawnSmoke(x, y, { size = 9, life = 1.7 } = {}) {
    if (!app) return;
    const puff = new PIXI.Graphics();
    puff.circle(0, 0, size).fill({ color: palette.smoke, alpha: 0.32 });
    puff.position.set(x, y);
    effectsLayer.addChild(puff);
    smoke.push({ node: puff, age: 0, life, size, driftX: 3 + Math.random() * 4, driftY: -7 - Math.random() * 4 });
  }

  function updateSmoke(dt) {
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.age += dt;
      const t = p.age / p.life;
      p.node.x += p.driftX * dt;
      p.node.y += p.driftY * dt;
      p.node.scale.set(1 + t * 1.4);
      p.node.alpha = Math.max(0, 0.32 * (1 - t));
      if (t >= 1) {
        p.node.destroy();
        smoke.splice(i, 1);
      }
    }
  }

  function updateCamera() {
    const camera = source.camera();
    world.pivot.set(camera.x, camera.y);
    world.position.set(app.screen.width / 2, app.screen.height / 2);
    world.scale.set(camera.zoom);
  }

  function screenToWorld(clientX, clientY) {
    const rect = app.canvas.getBoundingClientRect();
    const camera = source.camera();
    return {
      x: camera.x + (clientX - rect.left - rect.width / 2) / camera.zoom,
      y: camera.y + (clientY - rect.top - rect.height / 2) / camera.zoom
    };
  }

  function nearestSelectableUnit(point) {
    if (!lastSnapshot) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const unit of lastSnapshot.units || []) {
      if (unit.dead || !unit.regimentId) continue;
      const dx = unit.x - point.x;
      const dy = unit.y - point.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = unit; }
    }
    const zoom = Math.max(0.1, source.camera().zoom || 1);
    return bestD2 <= Math.pow(22 / zoom, 2) ? best : null;
  }

  function bindCanvasInput() {
    app.canvas.addEventListener('contextmenu', e => e.preventDefault());
    app.canvas.addEventListener('pointerdown', e => {
      if (!enabled) return;
      if (e.button === 2) {
        rightDrag = { point: screenToWorld(e.clientX, e.clientY), x: e.clientX, y: e.clientY };
      }
    });
    app.canvas.addEventListener('pointerup', e => {
      if (!enabled) return;
      if (e.button === 0) {
        const unit = nearestSelectableUnit(screenToWorld(e.clientX, e.clientY));
        if (unit?.regimentId) source.dispatch({ type: 'select-group', id: unit.regimentId });
        return;
      }
      if (e.button !== 2 || !rightDrag) return;
      const end = screenToWorld(e.clientX, e.clientY);
      const dragged = Math.hypot(e.clientX - rightDrag.x, e.clientY - rightDrag.y) > 10;
      const command = { type: 'move', x: rightDrag.point.x, y: rightDrag.point.y };
      if (dragged) command.facing = Math.atan2(end.y - rightDrag.point.y, end.x - rightDrag.point.x);
      source.dispatch(command);
      rightDrag = null;
    });
  }

  function buildStaticWorld() {
    addGroundTexture();
    addRoads();
    rebuildScenery();
  }

  async function createRenderer() {
    if (app || loading) return app;
    loading = true;
    loadError = '';
    try {
      PIXI = await import(PIXI_CDN);
      app = new PIXI.Application();
      await app.init({
        resizeTo: window,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        backgroundColor: palette.grass
      });
      app.canvas.id = 'pixiBattlefield';
      app.canvas.setAttribute('aria-label', 'Napoleonic RTS PixiJS battlefield');
      Object.assign(app.canvas.style, {
        position: 'absolute', inset: '0', zIndex: '2', display: 'none', touchAction: 'none'
      });
      host.appendChild(app.canvas);

      world = new PIXI.Container();
      terrainLayer = new PIXI.Container();
      depthLayer = new PIXI.Container();
      depthLayer.sortableChildren = true;
      effectsLayer = new PIXI.Container();
      world.addChild(terrainLayer, depthLayer, effectsLayer);
      app.stage.addChild(world);
      buildStaticWorld();
      bindCanvasInput();

      let accumulator = 0;
      app.ticker.add(ticker => {
        if (!enabled) return;
        accumulator += ticker.deltaMS;
        updateCamera();
        updateSmoke(ticker.deltaMS / 1000);
        if (accumulator < 33) return;
        accumulator %= 33;
        lastSnapshot = source.snapshot();
        updateUnits(lastSnapshot);
        updateBuildings(lastSnapshot);
        if ((ticker.lastTime | 0) % 1800 < 40) {
          const resources = source.resources();
          const signature = `${resources.length}:${resources.filter(r => r.type === 'wood').length}:${resources.slice(0, 12).map(r => r.id).join('|')}`;
          if (signature !== lastResourceSignature) rebuildScenery();
        }
      });
      return app;
    } catch (error) {
      loadError = String(error?.message || error);
      console.error('Pixi V2 failed to load', error);
      source.setStatus(`Pixi V2 kon niet laden: ${loadError}`);
      throw error;
    } finally {
      loading = false;
    }
  }

  function installButton() {
    const reset = document.getElementById('resetBtn');
    if (!reset?.parentNode) return null;
    const button = document.createElement('button');
    button.id = 'pixiModeBtn';
    button.type = 'button';
    button.textContent = 'Pixi V2';
    button.title = 'Experimentele GRAPHICS-V2 PixiJS renderer · Alt+4';
    button.addEventListener('click', () => setEnabled(!enabled));
    reset.parentNode.insertBefore(button, reset);
    return button;
  }

  const button = installButton();

  async function setEnabled(next, { persist = true } = {}) {
    next = Boolean(next);
    if (next === enabled && (!next || app)) return;
    if (next) {
      try { await createRenderer(); } catch (_) { return; }
      returnTo3D = Boolean(window.__BATTLEFIELD_3D_V1__?.enabled?.());
      window.__BATTLEFIELD_3D_V1__?.setEnabled?.(false);
      canvas2d.style.visibility = 'hidden';
      app.canvas.style.display = 'block';
      app.canvas.style.pointerEvents = 'auto';
      enabled = true;
      button?.classList.add('active');
      document.documentElement.dataset.renderMode = 'pixi-v2';
      source.setStatus('Pixi V2 actief · klik regiment · rechtsklik om te bewegen · Alt+4 terug.');
    } else {
      enabled = false;
      if (app) {
        app.canvas.style.display = 'none';
        app.canvas.style.pointerEvents = 'none';
      }
      canvas2d.style.visibility = '';
      button?.classList.remove('active');
      if (returnTo3D) window.__BATTLEFIELD_3D_V1__?.setEnabled?.(true);
      document.documentElement.dataset.renderMode = returnTo3D ? '3d' : '2d';
      source.setStatus(returnTo3D ? '3D-weergave actief.' : '2D-weergave actief.');
    }
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (_) {}
    }
  }

  window.addEventListener('keydown', event => {
    if (!(event.altKey && event.code === 'Digit4') || event.repeat) return;
    event.preventDefault();
    setEnabled(!enabled);
  });

  document.getElementById('renderModeBtn')?.addEventListener('click', () => {
    if (enabled) setEnabled(false, { persist: true });
  }, { capture: true });

  window.__NRTS_PIXI_V1__ = Object.freeze({
    version: 'pixi-battlefield-v1',
    library: 'PixiJS v8 (lazy CDN import)',
    enabled: () => enabled,
    loaded: () => Boolean(app),
    loading: () => loading,
    loadError: () => loadError,
    setEnabled,
    spawnSmoke,
    diagnostics() {
      return {
        enabled,
        loaded: Boolean(app),
        loading,
        loadError,
        units: unitNodes.size,
        buildings: buildingNodes.size,
        scenery: sceneryNodes.length,
        smoke: smoke.length,
        world: { ...WORLD },
        renderer: app?.renderer?.name || null
      };
    }
  });

  try {
    if (localStorage.getItem(STORAGE_KEY) === 'on') setEnabled(true, { persist: false });
  } catch (_) {}
}
