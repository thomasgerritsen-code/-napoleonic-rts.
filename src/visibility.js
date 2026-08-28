'use strict';
// ---------- v0.5 fog of war + minimap ----------
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');
const minimap = document.createElement('canvas');
minimap.id = 'minimap';
minimap.width = 240;
minimap.height = 138;
minimap.setAttribute('aria-label', 'Minimap');
document.getElementById('app').appendChild(minimap);
const miniCtx = minimap.getContext('2d');

function visionRadius(entity) {
  if (entity.kind === 'building') {
    if (entity.type === 'towncenter') return 330;
    return 250;
  }
  if (entity.type === 'cavalry') return 270;
  if (entity.type === 'artillery') return 290;
  if (entity.type === 'officer') return 250;
  return 215;
}

function frenchVisionSources() {
  return [
    ...livingUnits('france'),
    ...livingBuildings('france').filter(b => b.complete)
  ];
}

function isVisibleToFrance(entity) {
  if (!entity || entity.side === 'france') return true;
  for (const source of frenchVisionSources()) {
    const r = visionRadius(source);
    if (Math.hypot(entity.x - source.x, entity.y - source.y) <= r) return true;
  }
  return false;
}

function resizeFogCanvas() {
  const w = Math.max(1, Math.floor(innerWidth));
  const h = Math.max(1, Math.floor(innerHeight));
  if (fogCanvas.width !== w) fogCanvas.width = w;
  if (fogCanvas.height !== h) fogCanvas.height = h;
}

function drawFogOverlay() {
  resizeFogCanvas();
  fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogCtx.fillStyle = 'rgba(4,7,9,.88)';
  fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogCtx.globalCompositeOperation = 'destination-out';

  for (const source of frenchVisionSources()) {
    const p = worldToScreen(source.x, source.y);
    const radius = visionRadius(source) * camera.zoom;
    const gradient = fogCtx.createRadialGradient(p.x, p.y, radius * 0.60, p.x, p.y, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.78, 'rgba(0,0,0,.92)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = gradient;
    fogCtx.beginPath();
    fogCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    fogCtx.fill();
  }
  fogCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fogCanvas, 0, 0);
}

function miniPoint(x, y) {
  return { x: x / WORLD.width * minimap.width, y: y / WORLD.height * minimap.height };
}

function drawMinimap() {
  miniCtx.clearRect(0, 0, minimap.width, minimap.height);
  miniCtx.fillStyle = '#566947';
  miniCtx.fillRect(0, 0, minimap.width, minimap.height);

  // Major resources are shown as muted terrain information.
  for (const r of resources) {
    if (r.dead) continue;
    const p = miniPoint(r.x, r.y);
    miniCtx.fillStyle = r.type === 'wood' ? '#29452c' : '#9a793e';
    miniCtx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }

  for (const b of buildings) {
    if (b.dead || (b.side === 'britain' && !isVisibleToFrance(b))) continue;
    const p = miniPoint(b.x, b.y);
    miniCtx.fillStyle = b.side === 'france' ? '#4e7ed0' : '#cf514a';
    miniCtx.fillRect(p.x - 3, p.y - 3, 6, 6);
  }

  for (const u of units) {
    if (u.dead || (u.side === 'britain' && !isVisibleToFrance(u))) continue;
    const p = miniPoint(u.x, u.y);
    miniCtx.fillStyle = u.side === 'france' ? '#9bbaf0' : '#ef8d85';
    miniCtx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
  }

  const viewW = innerWidth / camera.zoom / WORLD.width * minimap.width;
  const viewH = innerHeight / camera.zoom / WORLD.height * minimap.height;
  const c = miniPoint(camera.x, camera.y);
  miniCtx.strokeStyle = '#f3df83';
  miniCtx.lineWidth = 1.4;
  miniCtx.strokeRect(c.x - viewW / 2, c.y - viewH / 2, viewW, viewH);
}

minimap.addEventListener('click', e => {
  const rect = minimap.getBoundingClientRect();
  camera.x = Math.max(0, Math.min(WORLD.width, (e.clientX - rect.left) / rect.width * WORLD.width));
  camera.y = Math.max(0, Math.min(WORLD.height, (e.clientY - rect.top) / rect.height * WORLD.height));
  clampCamera();
});
