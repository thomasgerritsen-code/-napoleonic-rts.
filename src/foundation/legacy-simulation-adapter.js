'use strict';
// Consolidated compatibility adapter for the historical simulation implementation.
// The implementation may originate from the v0.7.1 stack, but every active runtime
// exposes the current release identity. Historical behaviour is tested through the
// legacy baseline and debug adapters, not by rewriting the public version number.
(function installLegacySimulationAdapter(root) {
  const sim = root.RTS_SIM;
  if (!sim) return;

  const exposedVersion = root.RTS_VERSION || sim.version;
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
