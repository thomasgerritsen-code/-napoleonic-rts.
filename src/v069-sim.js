'use strict';
// ---------- v0.6.9 simulation facade version adapter ----------
if (window.RTS_SIM) {
  const simV068ForV069 = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version:'0.6.9',
    snapshot(){ const snapshot = simV068ForV069.snapshot(); return {...snapshot, version:'0.6.9'}; },
    audit:(...args)=>simV068ForV069.audit(...args),
    dispatch:(...args)=>simV068ForV069.dispatch(...args),
    step:(...args)=>simV068ForV069.step(...args),
    getMetrics:(...args)=>simV068ForV069.getMetrics(...args)
  });
}
