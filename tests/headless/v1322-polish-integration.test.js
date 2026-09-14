'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = fs.readFileSync('src/foundation/version.js', 'utf8');
const hud = fs.readFileSync('src/hud.js', 'utf8');
const reform = fs.readFileSync('src/systems/movement/post-crossing-reform-v1322.js', 'utf8');

test('v1.3.22 identity and browser cache keys stay aligned', () => {
  assert.equal(pkg.version, '1.3.22');
  assert.match(version, /const VERSION = '1\.3\.22'/);
  assert.match(index, /Napoleonic RTS v1\.3\.22/);
  assert.match(index, /class="version">v1\.3\.22</);
  assert.match(index, /src\/foundation\/version\.js\?build=1322a/);
  assert.match(index, /src\/hud\.js\?build=145a/);
  assert.match(index, /style\.css\?build=144a/);
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
