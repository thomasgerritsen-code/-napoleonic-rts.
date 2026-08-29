'use strict';
// ---------- v0.7.1 simulation facade adapter ----------
if (typeof V071_ACTIVE !== 'undefined' && V071_ACTIVE && window.RTS_SIM) {
  const previous = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version:'0.7.1',
    snapshot(){ const snapshot=previous.snapshot(); return {...snapshot,version:'0.7.1'}; },
    audit:(...args)=>previous.audit(...args),
    dispatch:(...args)=>previous.dispatch(...args),
    step:(...args)=>previous.step(...args),
    getMetrics:(...args)=>previous.getMetrics(...args)
  });
}
