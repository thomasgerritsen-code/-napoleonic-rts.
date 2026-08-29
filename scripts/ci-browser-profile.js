function ciBrowserProfile(env = process.env) {
  const systemChrome = env.CI_SYSTEM_CHROME === '1';
  return {
    systemChrome,
    channel: systemChrome ? 'chrome' : undefined,
    video: systemChrome ? 'off' : 'retain-on-failure'
  };
}

module.exports = { ciBrowserProfile };
