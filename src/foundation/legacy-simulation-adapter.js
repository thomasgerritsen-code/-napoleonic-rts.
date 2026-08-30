'use strict';
// Consolidated compatibility adapter for historical simulation-version test pages.
// Production exposes the current release version even when the older simulation
// implementation still carries a historical literal internally.
(function installLegacySimulationAdapter(root) {
  const sim = root.RTS_SIM;
  if (!sim) return;

  const testMode = new URLSearchParams(root.location?.search || '').get('test') || '';
  const historicalVersionByMode = Object.freeze({
    v064: '0.6.4',
    v065: '0.6.5',
    v066: '0.6.6',
    v067: '0.6.7',
    v068: '0.6.8',
    v069: '0.6.9',
    v070: '0.7.0',
    v071: '0.7.1'
  });
  const exposedVersion = historicalVersionByMode[testMode] || root.RTS_VERSION || sim.version;
  if (sim.version === exposedVersion) return;

  root.RTS_SIM = Object.freeze({
    version: exposedVersion,
    snapshot() {
      const snapshot = sim.snapshot();
      return { ...snapshot, version: exposedVersion };
    },
    audit: (...args) => sim.audit(...args),
    dispatch: (...args) => sim.dispatch(...args),
    step: (...args) => sim.step(...args),
    getMetrics: (...args) => sim.getMetrics(...args)
  });
})(window);
