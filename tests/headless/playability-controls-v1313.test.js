'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const source = read('src/systems/input/playability-controls-v1.js');
const html = read('index.html');
const version = read('src/foundation/version.js');

test('v1.3.14 exposes the playability control improvements and UI hotkey guard', () => {
  assert.match(source, /shiftBoxAdditiveSelection: true/);
  assert.match(source, /formationHotkeys: true/);
  assert.match(source, /focusSelectionHotkey: true/);
  assert.match(source, /regimentCycleHotkey: true/);
  assert.match(source, /interactiveUiHotkeyGuard: true/);
  assert.match(source, /keys\.has\('shift'\)/);
  assert.match(source, /'1': 'line', '2': 'column', '3': 'square'/);
  assert.match(source, /k === 'f'/);
  assert.match(source, /k === 'tab'/);
  assert.match(source, /isInteractiveUiTarget\(e\.target\)/);
  assert.match(source, /button, input, select, textarea, a\[href\]/);
});

test('v1.3.14 playability controls load immediately after base input and publish release identity', () => {
  const input = html.indexOf('src/input.js?build=131a');
  const controls = html.indexOf('src/systems/input/playability-controls-v1.js?build=1314a');
  assert.ok(input >= 0, 'base input remains wired');
  assert.ok(controls > input, 'playability controls load after base input');
  assert.match(html, /Shift\+sleep: toevoegen/);
  assert.match(html, /1\/2\/3: linie \/ colonne \/ carré/);
  assert.match(html, /Tab \/ Shift\+Tab: volgend \/ vorig regiment/);
  assert.match(html, /F: camera naar selectie/);
  assert.match(version, /const VERSION = '1\.3\.14'/);
});
