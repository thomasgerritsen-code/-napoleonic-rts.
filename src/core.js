'use strict';
// ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const foodEl = document.getElementById('food');
  const woodEl = document.getElementById('wood');
  const populationEl = document.getElementById('population');
  const frenchCountEl = document.getElementById('frenchCount');
  const britishCountEl = document.getElementById('britishCount');
  const frenchRegimentsEl = document.getElementById('frenchRegiments');
  const statusEl = document.getElementById('status');
  const selectionTitleEl = document.getElementById('selectionTitle');
  const selectionDetailsEl = document.getElementById('selectionDetails');
  const actionsEl = document.getElementById('actions');
  const messageEl = document.getElementById('message');
  const buildHintEl = document.getElementById('buildHint');
  const aiEconomyEl = document.getElementById('aiEconomy');
  const aiBuildingsEl = document.getElementById('aiBuildings');
  const aiRegimentsEl = document.getElementById('aiRegiments');
  const aiPlanEl = document.getElementById('aiPlan');

  // ---------- World/state ----------
  const WORLD = { width: 3200, height: 1850 };
  const camera = { x: 720, y: 900, zoom: 0.72 };
  const keys = new Set();
  const units = [];
  const buildings = [];
  const resources = [];
  const projectiles = [];
  const particles = [];
  const regiments = [];
  const selectedUnits = new Set();

  const economies = {
    france: { food: 1100, wood: 1100, popCap: 45 },
    britain: { food: 850, wood: 850, popCap: 35 }
  };

  let selectedBuilding = null;
  let nextId = 1;
  let nextRegimentId = 1;
  let lastTime = performance.now();
  let gameOver = false;
  let buildMode = null;
  let currentFormation = 'line';
  let actionSignature = '';
  let volleyClock = 0;
  let aiDecisionClock = 0;
  let aiAttackClock = 0;
  let elapsed = 0;
  let aiPlan = 'opbouwen';
  const drag = { active: false, startX: 0, startY: 0, x: 0, y: 0, moved: false };

  // ---------- Definitions ----------
  const TYPES = {
    worker:    { radius: 7,  speed: 72, hp: 65,  range: 12,  damage: 7,  reload: 1.1, projectileSpeed: 0,   pop: 1, label: 'Boer' },
    infantry:  { radius: 6,  speed: 57, hp: 100, range: 122, damage: 20, reload: 3.0, projectileSpeed: 410, pop: 1, label: 'Musketier' },
    officer:   { radius: 7,  speed: 60, hp: 125, range: 90,  damage: 24, reload: 2.6, projectileSpeed: 400, pop: 1, label: 'Officier' },
    drummer:   { radius: 7,  speed: 61, hp: 80,  range: 10,  damage: 5,  reload: 1.0, projectileSpeed: 0,   pop: 1, label: 'Drummer' },
    cavalry:   { radius: 9,  speed: 98, hp: 155, range: 18,  damage: 30, reload: 0.9, projectileSpeed: 0,   pop: 2, label: 'Cavalerie' },
    artillery: { radius: 11, speed: 31, hp: 195, range: 305, damage: 82, reload: 5.0, projectileSpeed: 280, pop: 3, label: 'Artillerie' }
  };

  const TRAINING = {
    worker:   { cost: { food: 50 }, time: 7 },
    infantry: { cost: { food: 80, wood: 20 }, time: 6 },
    officer:  { cost: { food: 160, wood: 60 }, time: 10 },
    drummer:  { cost: { food: 90, wood: 20 }, time: 7 }
  };

  const BUILDINGS = {
    towncenter: { w: 94, h: 78, hp: 1250, label: 'Town Center', pop: 45 },
    barracks:   { w: 82, h: 60, hp: 850,  label: 'Barracks', cost: { wood: 300 } },
    house:      { w: 56, h: 50, hp: 450,  label: 'House', cost: { wood: 120 }, pop: 15 }
  };

  const COLORS = {
    grass: '#65784f',
    grid: 'rgba(255,255,255,.035)',
    france: '#244d9a',
    franceLight: '#a9c2f2',
    britain: '#a5322f',
    britainLight: '#f1aaa1',
    selected: '#f5dc70',
    regiment: '#f4d86d',
    smoke: 'rgba(232,227,211,.64)',
    tree: '#234b2b',
    tree2: '#38663c',
    food: '#b78d45'
  };

  // ---------- Basics ----------
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function sideDir(side) { return side === 'france' ? 1 : -1; }
  function opposite(side) { return side === 'france' ? 'britain' : 'france'; }
  function livingUnits(side) { return units.filter(u => !u.dead && u.side === side); }
  function livingBuildings(side) { return buildings.filter(b => !b.dead && b.side === side); }
  function getRegiment(id) { return regiments.find(r => r.id === id && !r.destroyed) || null; }
  function activeRegiments(side) { return regiments.filter(r => !r.destroyed && r.side === side && regimentMembers(r).length); }
  function regimentMembers(reg) {
    const ids = new Set(reg.memberIds);
    return units.filter(u => !u.dead && ids.has(u.id));
  }
  function populationUsed(side) {
    return livingUnits(side).reduce((sum, u) => sum + TYPES[u.type].pop, 0);
  }
  function recalcPopCap(side) {
    economies[side].popCap = livingBuildings(side)
      .filter(b => b.complete)
      .reduce((sum, b) => sum + (BUILDINGS[b.type].pop || 0), 0);
  }
  function formationLabel(mode) {
    return mode === 'square' ? 'Carré' : mode === 'column' ? 'Colonne' : 'Linie';
  }
  function centroid(group) {
    if (!group.length) return { x: camera.x, y: camera.y };
    let x = 0, y = 0;
    for (const u of group) { x += u.x; y += u.y; }
    return { x: x / group.length, y: y / group.length };
  }

  function createUnit(side, type, x, y) {
    const t = TYPES[type];
    const u = {
      id: nextId++, kind: 'unit', side, type,
      x, y, targetX: x, targetY: y, facing: side === 'france' ? 0 : Math.PI,
      hp: t.hp, maxHp: t.hp, reload: Math.random() * t.reload,
      dead: false, morale: 100, routing: false, recentHit: 0,
      regimentId: null, task: null, resourceTarget: null, returnResource: null,
      buildingTarget: null, carryType: null, carry: 0, gatherClock: 0,
      attackMode: 'fire', artilleryMode: 'round', chargeTimer: 0
    };
    units.push(u);
    return u;
  }

  function createBuilding(side, type, x, y, complete = true) {
    const d = BUILDINGS[type];
    const b = {
      id: nextId++, kind: 'building', side, type, x, y, w: d.w, h: d.h,
      hp: complete ? d.hp : Math.round(d.hp * 0.15), maxHp: d.hp,
      complete, construction: complete ? 1 : 0.15, dead: false,
      queue: [], production: 0
    };
    buildings.push(b);
    return b;
  }

  function createResource(type, x, y, amount) {
    const r = {
      id: nextId++, kind: 'resource', type, x, y, amount, maxAmount: amount,
      radius: type === 'wood' ? 20 : 18, dead: false
    };
    resources.push(r);
    return r;
  }

  function spawnLine(side, type, x, y, count, cols = 12, spacing = 18) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols), dir = sideDir(side);
      made.push(createUnit(side, type, x + dir * col * spacing, y + row * spacing));
    }
    return made;
  }

  function createResourceClusters() {
    const clusters = [
      ['wood', 360, 540], ['wood', 470, 620], ['wood', 850, 430],
      ['food', 730, 610], ['food', 840, 690],
      ['wood', 1450, 410], ['wood', 1530, 1370], ['food', 1520, 880],
      ['wood', 2700, 520], ['wood', 2820, 650], ['wood', 2450, 1310],
      ['food', 2530, 690], ['food', 2720, 1110]
    ];
    for (const [type, cx, cy] of clusters) {
      const count = type === 'wood' ? 14 : 7;
      for (let i = 0; i < count; i++) {
        createResource(type, cx + (Math.random() - 0.5) * 150, cy + (Math.random() - 0.5) * 120, type === 'wood' ? 220 : 360);
      }
    }
  }

  function resetGame() {
    const previousElapsed = elapsed;
    const previousUnitCount = units.length;
    const previousRegimentCount = regiments.length;
    units.length = buildings.length = resources.length = projectiles.length = particles.length = regiments.length = 0;
    selectedUnits.clear();
    selectedBuilding = null;
    nextId = 1; nextRegimentId = 1;
    gameOver = false; buildMode = null; currentFormation = 'line';
    actionSignature = ''; volleyClock = 0; aiDecisionClock = 0; aiAttackClock = 0; elapsed = 0; aiPlan = 'opbouwen';
    window.NRTS?.events?.emit?.('game:reset', { previousElapsed, previousUnitCount, previousRegimentCount });

    economies.france.food = 1100; economies.france.wood = 1100; economies.france.popCap = 45;
    economies.britain.food = 850; economies.britain.wood = 850; economies.britain.popCap = 35;
    camera.x = 720; camera.y = 900; camera.zoom = 0.72;
    messageEl.classList.add('hidden'); buildHintEl.classList.add('hidden');

    createBuilding('france', 'towncenter', 560, 900, true);
    for (let i = 0; i < 6; i++) createUnit('france', 'worker', 650 + (i % 3) * 24, 830 + Math.floor(i / 3) * 28);
    spawnLine('france', 'infantry', 700, 1010, 12, 12, 18);
    createUnit('france', 'officer', 805, 970);
    createUnit('france', 'drummer', 775, 970);
    spawnLine('france', 'cavalry', 660, 1130, 4, 4, 28);
    spawnLine('france', 'artillery', 620, 1210, 2, 2, 48);

    createBuilding('britain', 'towncenter', 2640, 900, true);
    for (let i = 0; i < 6; i++) createUnit('britain', 'worker', 2540 - (i % 3) * 24, 830 + Math.floor(i / 3) * 28);
    spawnLine('britain', 'infantry', 2460, 1030, 6, 6, 18);
    spawnLine('britain', 'cavalry', 2630, 1140, 3, 3, 28);
    spawnLine('britain', 'artillery', 2690, 1220, 1, 1, 48);

    createResourceClusters();

    recalcPopCap('france'); recalcPopCap('britain');
    autoAssignAIWorkers();
    updateHud(true);
    statusEl.textContent = 'Selecteer 12 musketiers + 1 officier + 1 drummer en maak een regiment.';
  }

  // ---------- Camera ----------
  function screenToWorld(sx, sy) {
    return { x: (sx - innerWidth / 2) / camera.zoom + camera.x, y: (sy - innerHeight / 2) / camera.zoom + camera.y };
  }
  function worldToScreen(wx, wy) {
    return { x: (wx - camera.x) * camera.zoom + innerWidth / 2, y: (wy - camera.y) * camera.zoom + innerHeight / 2 };
  }
  function clampCamera() {
    const halfW = innerWidth / (2 * camera.zoom), halfH = innerHeight / (2 * camera.zoom);
    camera.x = Math.max(halfW, Math.min(WORLD.width - halfW, camera.x));
    camera.y = Math.max(halfH, Math.min(WORLD.height - halfH, camera.y));
  }
