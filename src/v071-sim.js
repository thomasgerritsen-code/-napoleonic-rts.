'use strict';
// ---------- v0.7.1 legacy simulation facade adapter ----------
if (typeof V071_ACTIVE !== 'undefined' && V071_ACTIVE && window.RTS_SIM) {
  const previous = window.RTS_SIM;
  const version = window.RTS_VERSION || '1.0.0';
  window.RTS_SIM = Object.freeze({
    version,
    snapshot(){ const snapshot=previous.snapshot(); return {...snapshot,version}; },
    audit:(...args)=>previous.audit(...args),
    dispatch:(...args)=>previous.dispatch(...args),
    step:(...args)=>previous.step(...args),
    getMetrics:(...args)=>previous.getMetrics(...args)
  });
}
