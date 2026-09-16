const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');

function dryRun(provider) {
  return spawnSync(process.execPath, [
    path.join(root, 'scripts', 'generate-art.mjs'),
    '--provider', provider,
    '--dry-run',
    '--category', 'style-keyframe',
    '--variants', '1',
    '--max-generations', '1'
  ], {
    cwd: root,
    env: { ...process.env, FAL_KEY: '', LEONARDO_API_KEY: '', ART_PROVIDER: '' },
    encoding: 'utf8'
  });
}

test('art prompt config contains provider metadata but no credentials', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'art-pipeline', 'prompts.json'), 'utf8'));
  assert.equal(config.defaultProvider, 'leonardo');
  assert.equal(config.providers.leonardo.kind, 'leonardo-v1');
  assert.equal(config.providers.leonardo.modelLabel, 'Leonardo Lightning XL');
  assert.equal(config.providers.leonardo.requestDefaults.public, false);
  assert.equal(config.providers.fal.endpoint, 'fal-ai/nano-banana-pro');
  assert.equal(config.providers.fal.requestDefaults.output_format, 'png');
  assert.equal(config.providers.fal.requestDefaults.enable_web_search, false);
  assert.ok(config.systemPrompt.includes('gameplay readability'));
  assert.ok(Array.isArray(config.categories));
  assert.ok(config.categories.length >= 8);
  const ids = config.categories.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'category IDs must be unique');
  assert.ok(ids.includes('style-keyframe'));
  assert.ok(ids.includes('french-line-infantry'));
  assert.ok(ids.includes('british-line-infantry'));
  const serialized = JSON.stringify(config);
  assert.ok(!serialized.includes('Bearer '));
  assert.ok(!serialized.includes('Key '));
});

test('Leonardo dry-run succeeds without API key or network generation', () => {
  const result = dryRun('leonardo');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /style-keyframe/);
  assert.match(result.stdout, /cloud\.leonardo\.ai\/api\/rest\/v1\/generations/);
  assert.match(result.stdout, /"seed": 11000/);
  assert.match(result.stdout, /"modelId": "b24e16ff-06e3-43eb-8d33-4416c2d75876"/);
  assert.match(result.stdout, /"public": false/);
});

test('fal dry-run remains available as a second provider', () => {
  const result = dryRun('fal');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /fal-ai\/nano-banana-pro/);
  assert.match(result.stdout, /"seed": 11000/);
  assert.match(result.stdout, /"enable_web_search": false/);
});

test('full generation remains protected by an explicit hard cap', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'generate-art.mjs'),
    '--provider', 'leonardo',
    '--dry-run',
    '--all'
  ], {
    cwd: root,
    env: { ...process.env, FAL_KEY: '', LEONARDO_API_KEY: '', ART_PROVIDER: '' },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exceeds --max-generations/);
});
