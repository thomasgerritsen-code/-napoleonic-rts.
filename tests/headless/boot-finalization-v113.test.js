'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('v1.1.3 hides intermediate legacy runtime until final browser load', () => {
  const source = read('src/foundation/version.js');
  assert.match(source, /app\.style\.visibility = 'hidden'/);
  assert.match(source, /addEventListener\('load', finalizeBoot/);
  assert.match(source, /app\.style\.visibility = 'visible'/);
  assert.match(source, /dataset\.runtimeReady = 'true'/);
});

test('visible release identity starts at v1.1.3', () => {
  const html = read('index.html');
  assert.match(html, /<title>Napoleonic RTS v1\.1\.3<\/title>/);
  assert.match(html, /<span class="version">v1\.1\.3<\/span>/);
});
