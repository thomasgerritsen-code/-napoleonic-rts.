const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

test('art prompt config is reproducible and does not contain credentials', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'art-pipeline', 'prompts.json'), 'utf8'));
  assert.equal(config.endpoint, 'fal-ai/nano-banana-pro');
  assert.equal(config.requestDefaults.output_format, 'png');
  assert.equal(config.requestDefaults.enable_web_search, false);
  assert.ok(config.systemPrompt.includes('gameplay readability'));
  assert.ok(Array.isArray(config.categories));
  assert.ok(config.categories.length >= 8);
  const ids = config.categories.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'category IDs must be unique');
  assert.ok(ids.includes('style-keyframe'));
  assert.ok(ids.includes('french-line-infantry'));
  assert.ok(ids.includes('british-line-infantry'));
  assert.ok(!JSON.stringify(config).includes('FAL_KEY'));
});

test('art generator dry-run succeeds without FAL_KEY or network generation', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'generate-art.mjs'),
    '--dry-run',
    '--category', 'style-keyframe',
    '--variants', '1',
    '--max-generations', '1'
  ], {
    cwd: root,
    env: { ...process.env, FAL_KEY: '' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /style-keyframe/);
  assert.match(result.stdout, /fal-ai\/nano-banana-pro/);
  assert.match(result.stdout, /"seed": 11000/);
});

test('full generation remains protected by an explicit hard cap', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'generate-art.mjs'),
    '--dry-run',
    '--all'
  ], {
    cwd: root,
    env: { ...process.env, FAL_KEY: '' },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exceeds --max-generations/);
});
