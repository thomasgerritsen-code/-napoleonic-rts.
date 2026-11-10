'use strict';
(function expose(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NRTS_TERRITORY_STATE = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(sites, {captureSeconds=15, radius=160}={}) {
    const points = sites.map(p => ({...p, owner:null, claim:null, progress:0, contested:false, incomeActive:false}));
    function state() { return {captureSeconds, radius, points:points.map(p=>({...p}))}; }
    function step(dt, actors, credit) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      for (const p of points) {
        let france=false, britain=false;
        for (const u of actors) {
          if (u.dead || u.routing || u.hp <= 0 || !['infantry','cavalry','artillery'].includes(u.type)) continue;
          if ((u.x-p.x)**2 + (u.y-p.y)**2 > radius*radius) continue;
          if (u.side==='france') france=true; else if (u.side==='britain') britain=true;
          if (france && britain) break;
        }
        p.contested = france && britain; p.incomeActive = false;
        if (p.contested) continue;
        const side = france ? 'france' : britain ? 'britain' : null;
        let incomeSeconds = 0;
        if (!side || side === p.owner) {
          p.claim = null; p.progress = 0;
          if (p.owner) incomeSeconds = dt;
        } else {
          if (p.claim !== side) { p.claim = side; p.progress = 0; }
          const remaining = (1-p.progress)*captureSeconds;
          p.progress = Math.min(1, p.progress + dt/captureSeconds);
          if (p.progress >= 1-1e-9) {
            p.owner = side; p.claim = null; p.progress = 0;
            incomeSeconds = Math.max(0,dt-remaining);
          }
        }
        p.incomeActive = !!p.owner && (!side || side===p.owner);
        if (incomeSeconds > 1e-9) credit(p.owner, p.resource, p.rate*incomeSeconds);
      }
    }
    return Object.freeze({state,step});
  }
  return Object.freeze({create});
});
