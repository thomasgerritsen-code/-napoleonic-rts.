'use strict';
// ---------- v0.6.4 simulation facade version adapter ----------
if (window.RTS_SIM) {
  const simV063ForV064 = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version: '0.6.4',
    snapshot() {
      const snapshot = simV063ForV064.snapshot();
      return { ...snapshot, version: '0.6.4' };
    },
    audit: (...args) => simV063ForV064.audit(...args),
    dispatch: (...args) => simV063ForV064.dispatch(...args),
    step: (...args) => simV063ForV064.step(...args),
    getMetrics: (...args) => simV063ForV064.getMetrics(...args)
  });
}
