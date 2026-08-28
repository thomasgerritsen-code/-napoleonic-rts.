'use strict';
// ---------- v0.7.0 simulation facade version adapter ----------
if (window.RTS_SIM && !(typeof V070_LEGACY_TEST_MODE !== 'undefined' && V070_LEGACY_TEST_MODE)) {
  const previous = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version:'0.7.0',
    snapshot(){ const snapshot=previous.snapshot(); return {...snapshot,version:'0.7.0'}; },
    audit:(...args)=>previous.audit(...args),
    dispatch:(...args)=>previous.dispatch(...args),
    step:(...args)=>previous.step(...args),
    getMetrics:(...args)=>previous.getMetrics(...args)
  });
}
