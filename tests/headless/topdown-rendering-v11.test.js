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
  assert.match(source, /head\/shako overlaps the front edge of the shoulders/);
  assert.doesNotMatch(source, /Legs\/trousers trail behind the torso in plan view/);
  assert.doesNotMatch(source, /arc\(9\.55\*scale/);
});

test('cavalry is rendered in plan view and does not fall back to legacy unit drawing', () => {
  const source = read('src/systems/rendering/characters.js');
  assert.match(source, /function drawCavalry\(u,state\)/);
  assert.match(source, /Horse body, neck, head and tail all lie along \+X\/-X in true plan view/);
  assert.match(source, /else if\(u\.type==='cavalry'\)drawCavalry\(u,state\)/);
});

test('artillery crew shares the unified human renderer without infantry muskets', () => {
  const source = read('src/systems/rendering/artillery-topdown-v1.js');
  assert.match(source, /renderer\.drawTopDownSoldier/);
  assert.match(source, /musket:false/);
  assert.match(source, /projection:'orthographic-top-down'/);
});
