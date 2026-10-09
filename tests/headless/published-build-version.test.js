'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { stampDeployment } = require('../../scripts/stamp-deployment');

const versionSource = fs.readFileSync(path.resolve(__dirname, '../../src/foundation/version.js'), 'utf8');

function runVersion(deployment) {
  const app = { style: {} };
  const badge = { textContent: '', title: '' };
  const document = {
    readyState: 'complete',
    title: '',
    documentElement: { dataset: {} },
    getElementById: id => id === 'app' ? app : null,
    querySelector: selector => selector === '.version' ? badge : null
  };
  const window = { RTS_DEPLOYMENT_INFO: deployment, addEventListener() {} };
  vm.runInNewContext(versionSource, { document, window });
  return { document, window, badge, app };
}

test('local build retains the package version without inventing a published build', () => {
  const { document, window, badge, app } = runVersion(null);
  assert.equal(document.title, 'Napoleonic RTS v1.3.22');
  assert.equal(badge.textContent, 'v1.3.22');
  assert.equal(window.RTS_VERSION_INFO.buildNumber, null);
  assert.equal(window.RTS_VERSION, '1.3.22');
  assert.equal(app.style.visibility, 'visible');
});

test('published build displays a unique version and commit tooltip without changing semantic version', () => {
  const sha = 'a'.repeat(40);
  const { document, window, badge } = runVersion({ commit: sha, runNumber: 209, deployedAt: '2026-10-09T12:00:00.000Z' });
  assert.equal(document.title, 'Napoleonic RTS v1.3.22-b209');
  assert.equal(badge.textContent, 'v1.3.22-b209');
  assert.match(badge.title, /build #209.*commit aaaaaaa/);
  assert.equal(window.RTS_VERSION_INFO.release, '1.3.22-b209');
  assert.equal(window.RTS_VERSION, '1.3.22');
});

test('publishing stamps unique, cache-busted identifiers on successive deployments', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rts-published-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/foundation'), { recursive: true });
  const original = '<script src="src/foundation/deployment-info.js?build=local"></script>';
  const indexPath = path.join(root, 'index.html');
  const scriptPath = path.join(root, 'src/foundation/deployment-info.js');

  fs.writeFileSync(indexPath, original);
  const first = stampDeployment(root, {
    sha: 'a'.repeat(40), runNumber: 209, deployedAt: '2026-10-09T12:00:00.000Z'
  });
  assert.equal(first.runNumber, 209);
  assert.match(fs.readFileSync(indexPath, 'utf8'), /deployment-info.js\?build=aaaaaaaaaaaa/);
  assert.match(fs.readFileSync(scriptPath, 'utf8'), /"runNumber":209/);

  fs.writeFileSync(indexPath, original);
  const second = stampDeployment(root, {
    sha: 'b'.repeat(40), runNumber: 210, deployedAt: '2026-10-09T13:00:00.000Z'
  });
  assert.equal(second.runNumber, 210);
  assert.match(fs.readFileSync(indexPath, 'utf8'), /deployment-info.js\?build=bbbbbbbbbbbb/);
  assert.match(fs.readFileSync(scriptPath, 'utf8'), /"runNumber":210/);
  assert.notEqual(first.commit, second.commit);
});

test('publishing rejects missing or invalid deployment identifiers', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rts-bad-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => stampDeployment(root, {
    sha: 'invalid', runNumber: 1, deployedAt: '2026-10-09T12:00:00.000Z'
  }), /commit SHA/);
});
