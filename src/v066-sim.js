'use strict';
// ---------- v0.6.6 simulation facade version adapter ----------
if (window.RTS_SIM) {
  const simV065ForV066 = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version: '0.6.6',
    snapshot() {
      const snapshot = simV065ForV066.snapshot();
      return { ...snapshot, version: '0.6.6' };
    },
    audit: (...args) => simV065ForV066.audit(...args),
    dispatch: (...args) => simV065ForV066.dispatch(...args),
    step: (...args) => simV065ForV066.step(...args),
    getMetrics: (...args) => simV065ForV066.getMetrics(...args)
  });
}
