'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('boot hides intermediate legacy runtime until final browser load', () => {
  const source = read('src/foundation/version.js');
  assert.match(source, /app\.style\.visibility = 'hidden'/);
  assert.match(source, /addEventListener\('load', finalizeBoot/);
  assert.match(source, /app\.style\.visibility = 'visible'/);
  assert.match(source, /dataset\.runtimeReady = 'true'/);
});

test('visible release identity starts at the package version', () => {
  const html = read('index.html');
  const pkg = JSON.parse(read('package.json'));
  const escaped = pkg.version.replace(/\./g, '\\.');
  assert.match(html, new RegExp(`<title>Napoleonic RTS v${escaped}<\\/title>`));
  assert.match(html, new RegExp(`<span class="version">v${escaped}<\\/span>`));
});
