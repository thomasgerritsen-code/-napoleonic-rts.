const test = require('node:test');
const assert = require('node:assert/strict');

function loadConfig(systemChrome) {
  const old = process.env.CI_SYSTEM_CHROME;
  process.env.CI_SYSTEM_CHROME = systemChrome ? '1' : '0';
  delete require.cache[require.resolve('../../playwright.config.js')];
  const config = require('../../playwright.config.js');
  if (old === undefined) delete process.env.CI_SYSTEM_CHROME;
  else process.env.CI_SYSTEM_CHROME = old;
  delete require.cache[require.resolve('../../playwright.config.js')];
  return config;
}

test('CI system Chrome selects the Chrome channel and disables managed video', () => {
  const config = loadConfig(true);
  assert.equal(config.projects[0].use.channel, 'chrome');
  assert.equal(config.use.video, 'off');
});

test('local/default Playwright keeps bundled Chromium behavior', () => {
  const config = loadConfig(false);
  assert.equal(config.projects[0].use.channel, undefined);
  assert.equal(config.use.video, 'retain-on-failure');
});
