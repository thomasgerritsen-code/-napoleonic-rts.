'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = fs.readFileSync('src/foundation/version.js', 'utf8');
const hud = fs.readFileSync('src/hud.js', 'utf8');
const reform = fs.readFileSync('src/systems/movement/post-crossing-reform-v1322.js', 'utf8');

test('semantic version identity and browser cache keys stay aligned', () => {
  assert.match(pkg.version, /^[0-9]+[.][0-9]+[.][0-9]+$/);
  assert.ok(version.includes("const VERSION = '"+pkg.version+"'"));
  assert.ok(index.includes('Napoleonic RTS v'+pkg.version));
  assert.ok(index.includes('class="version">v'+pkg.version+'</'));
  assert.ok(index.includes('src/foundation/version.js?build=1322a'));
  assert.ok(index.includes('src/hud.js?build=productioncost1'));
  assert.ok(index.includes('style.css?build=194victory'));
});

test('selected regiments expose post-crossing regroup progress and cohesion', () => {
  assert.match(hud, /function regimentReformLabel\(reg\)/);
  assert.match(hud, /postCrossingReformV1322/);
  assert.match(hud, /hergroepeert \$\{progress\}% · cohesie \$\{cohesion\}%/);
  assert.match(hud, /const reforming = regs\.filter\(reg => reg\?\.postCrossingReformV1322\)\.length/);
});

test('tactical selection aggregation is weighted and computed once per HUD update', () => {
  assert.match(hud, /const totalHp = metrics\.reduce/);
  assert.match(hud, /const totalMaxHp = metrics\.reduce/);
  assert.match(hud, /m\.morale \* m\.members/);
  assert.match(hud, /function pressureSummary\(tactical\)/);
  assert.match(hud, /selectionRegimentSummaryV144\(selectedRegs, tactical\)/);
});

test('finished reform states are released instead of accumulating for the whole battle', () => {
  assert.match(reform, /if\(reg\?\.id!=null\)states\.delete\(reg\.id\)/);
  assert.match(reform, /stats:\(\)=>\(\{\.\.\.stats,tracked:states\.size\}\)/);
});
