'use strict';
// Napoleonic RTS as a Windows program: a window on the game, which a small web
// server inside the program serves from its own copy (the game fetches its
// pictures and data, which a plain file:// page may not). Always the same
// address, so settings the game keeps in the browser storage stay between runs.
// Online play still goes to the game's multiplayer server over the internet.
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, 'site');
const PORT = 47321;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serve(request, response) {
  const url = new URL(request.url, 'http://localhost');
  let file = path.normalize(path.join(SITE, decodeURIComponent(url.pathname)));
  if (!file.startsWith(SITE)) { response.writeHead(403).end(); return; }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  });
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serve);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function start() {
  // A second copy of the program, or something else on the port: any free port.
  const port = await listen(PORT).catch(() => listen(0));
  const window = new BrowserWindow({
    width: 1400, height: 860, minWidth: 900, minHeight: 560,
    title: 'Napoleonic RTS', backgroundColor: '#1b2016', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  window.removeMenu();
  // Links to other sites open in the normal browser.
  window.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { window.setFullScreen(!window.isFullScreen()); event.preventDefault(); }
  });
  window.loadURL(`http://127.0.0.1:${port}/index.html`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}
