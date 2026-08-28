'use strict';
// ---------- v0.6.5 simulation facade version adapter ----------
if (window.RTS_SIM) {
  const simV064ForV065 = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version: '0.6.5',
    snapshot() {
      const snapshot = simV064ForV065.snapshot();
      return { ...snapshot, version: '0.6.5' };
    },
    audit: (...args) => simV064ForV065.audit(...args),
    dispatch: (...args) => simV064ForV065.dispatch(...args),
    step: (...args) => simV064ForV065.step(...args),
    getMetrics: (...args) => simV064ForV065.getMetrics(...args)
  });
}
