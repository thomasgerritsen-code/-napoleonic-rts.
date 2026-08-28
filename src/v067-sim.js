'use strict';
// ---------- v0.6.7 simulation facade version adapter ----------
if(window.RTS_SIM){
  const simV066ForV067=window.RTS_SIM;
  window.RTS_SIM=Object.freeze({
    version:'0.6.7',
    snapshot(){const snapshot=simV066ForV067.snapshot();return{...snapshot,version:'0.6.7'};},
    audit:(...args)=>simV066ForV067.audit(...args),
    dispatch:(...args)=>simV066ForV067.dispatch(...args),
    step:(...args)=>simV066ForV067.step(...args),
    getMetrics:(...args)=>simV066ForV067.getMetrics(...args)
  });
}
