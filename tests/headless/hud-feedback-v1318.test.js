const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hudPath = path.join(__dirname, '..', '..', 'src', 'hud.js');
const hud = fs.readFileSync(hudPath, 'utf8');

test('selection details keep full text and expose tactical state when the HUD truncates it', () => {
  assert.match(hud, /function setSelectionDetails\(text, tacticalState = 'neutral'\)/);
  assert.match(hud, /selectionDetailsEl\.title = text/);
  assert.match(hud, /selectionDetailsEl\.dataset\.tacticalState !== tacticalState/);
  assert.match(hud, /selectionDetailsEl\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(hud, /selectionDetailsEl\.setAttribute\('aria-atomic', 'true'\)/);
  assert.doesNotMatch(hud, /selectionDetailsEl\.textContent = `In aanbouw/);
});

test('formation controls expose their pressed state to assistive and browser UI', () => {
  assert.match(hud, /const active = btn\.dataset\.formation === selectedMode/);
  assert.match(hud, /btn\.setAttribute\('aria-pressed', active \? 'true' : 'false'\)/);
});
