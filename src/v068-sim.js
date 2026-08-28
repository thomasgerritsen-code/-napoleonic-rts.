'use strict';
// ---------- v0.6.8 simulation facade version adapter ----------
if (window.RTS_SIM) {
  const simV067ForV068 = window.RTS_SIM;
  window.RTS_SIM = Object.freeze({
    version:'0.6.8',
    snapshot(){ const snapshot = simV067ForV068.snapshot(); return { ...snapshot, version:'0.6.8' }; },
    audit:(...args)=>simV067ForV068.audit(...args),
    dispatch:(...args)=>simV067ForV068.dispatch(...args),
    step:(...args)=>simV067ForV068.step(...args),
    getMetrics:(...args)=>simV067ForV068.getMetrics(...args)
  });
}
