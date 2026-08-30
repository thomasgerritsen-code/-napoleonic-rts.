'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('v1.1 production runtime uses one unified human renderer', () => {
  const html = read('index.html');
  assert.match(html, /src\/systems\/rendering\/characters\.js/);
  assert.doesNotMatch(html, /src\/assets\/musketeer-sprite-v1\.js/);
  assert.doesNotMatch(html, /src\/systems\/rendering\/musketeer-sprites-v1\.js/);
});

test('human renderer declares strict orthographic top-down projection', () => {
  const source = read('src/systems/rendering/characters.js');
  assert.match(source, /projection:'orthographic-top-down'/);
  assert.match(source, /standingSilhouette:true/);
  assert.match(source, /supportedTypes:Object\.freeze\(\['worker','infantry','officer','drummer','cavalry'\]\)/);
  assert.match(source, /drawTopDownSoldierAt/);
});

test('standing infantry stays compact instead of using a prone head-to-foot ground axis', () => {
  const source = read('src/systems/rendering/characters.js');
  assert.match(source, /Long head-to-foot stacking reads as a prone\/crawling body and is avoided/);
  assert.match(source, /Feet remain close to the body/);
  assert.doesNotMatch(source, /Legs\/trousers trail behind the torso in plan view/);
  assert.doesNotMatch(source, /arc\(9\.55\*scale/);
});

test('v1.1.2 uses a larger rearward head and a compact shorter musket', () => {
  const source = read('src/systems/rendering/characters.js');
  assert.match(source, /enlargedRearwardHead:true/);
  assert.match(source, /arc\(2\.15\*scale,0,2\.85\*scale/);
  assert.match(source, /ellipse\(3\.05\*scale,0,2\.6\*scale,3\.35\*scale/);
  assert.match(source, /Slightly shorter musket keeps the weapon distinct/);
  assert.doesNotMatch(source, /lineTo\(9\.3\*scale,6\.2\*scale\)/);
});

test('cavalry rider gets the same visible head treatment as troops on foot', () => {
  const source = read('src/systems/rendering/characters.js');
  assert.match(source, /function drawCavalry\(u,state\)/);
  assert.match(source, /cavalryRiderHead:true/);
  assert.match(source, /rider gets the same larger\/rearward head logic/);
  assert.match(source, /ctx\.arc\(1\.85,0,2\.0/);
  assert.match(source, /ctx\.ellipse\(2\.75,0,1\.95,2\.55/);
  assert.match(source, /else if\(u\.type==='cavalry'\)drawCavalry\(u,state\)/);
});

test('artillery crew shares the unified human renderer without infantry muskets', () => {
  const source = read('src/systems/rendering/artillery-topdown-v1.js');
  assert.match(source, /renderer\.drawTopDownSoldier/);
  assert.match(source, /musket:false/);
  assert.match(source, /projection:'orthographic-top-down'/);
});
