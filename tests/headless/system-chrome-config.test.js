const test = require('node:test');
const assert = require('node:assert/strict');
const { ciBrowserProfile } = require('../../scripts/ci-browser-profile.js');

test('CI system Chrome selects the Chrome channel and disables managed video', () => {
  const profile = ciBrowserProfile({ CI_SYSTEM_CHROME: '1' });
  assert.equal(profile.systemChrome, true);
  assert.equal(profile.channel, 'chrome');
  assert.equal(profile.video, 'off');
});

test('local/default profile keeps bundled Chromium behavior', () => {
  const profile = ciBrowserProfile({});
  assert.equal(profile.systemChrome, false);
  assert.equal(profile.channel, undefined);
  assert.equal(profile.video, 'retain-on-failure');
});
