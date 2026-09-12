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
    // Canvas cost grows with DPR squared. A cap of 1.5 keeps the 2D battlefield crisp
    // while avoiding 4x pixel fill on Retina/HiDPI displays at DPR 2.
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
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
      path: [], pathIndex: 0, gatherTarget: null,
      stuckTime: 0, lastX: x, lastY: y
    };
    units.push(u); return u;
  }

  function createBuilding(side, type, x, y, complete = true) {
    const d = BUILDINGS[type];
    const b = { id: nextId++, kind: 'building', side, type, x, y, w: d.w, h: d.h,
      hp: d.hp, maxHp: d.hp, complete, construction: complete ? 1 : 0, queue: [], production: 0, dead: false };
    buildings.push(b); return b;
  }

  function createResource(type, x, y, amount = 900) {
    const r = { id: nextId++, kind: 'resource', type, x, y, amount, maxAmount: amount, dead: false };
    resources.push(r); return r;
  }

  function unitAt(x, y, side = null) {
    let best = null, bestD = Infinity;
    for (const u of units) {
      if (u.dead || (side && u.side !== side)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < TYPES[u.type].radius + 8 && d < bestD) { best = u; bestD = d; }
    }
    return best;
  }

  function buildingAt(x, y, side = null) {
    return buildings.find(b => !b.dead && (!side || b.side === side) && Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2) || null;
  }

  function resourceAt(x, y) {
    return resources.find(r => !r.dead && Math.hypot(r.x - x, r.y - y) < 28) || null;
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - innerWidth / 2) / camera.zoom + camera.x, y: (sy - innerHeight / 2) / camera.zoom + camera.y };
  }

  function worldToScreen(x, y) {
    return { x: (x - camera.x) * camera.zoom + innerWidth / 2, y: (y - camera.y) * camera.zoom + innerHeight / 2 };
  }

  function clampCamera() {
    const halfW = innerWidth / (2 * camera.zoom), halfH = innerHeight / (2 * camera.zoom);
    camera.x = Math.max(halfW, Math.min(WORLD.width - halfW, camera.x));
    camera.y = Math.max(halfH, Math.min(WORLD.height - halfH, camera.y));
  }
