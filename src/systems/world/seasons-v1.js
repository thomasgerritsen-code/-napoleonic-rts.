'use strict';
// Visual seasons use simulation time, independently of the daily light cycle.
(function installSeasons(root) {
  const config = root.NRTS_CONFIG?.seasons;
  if (!config || root.__SEASONS_V1__) return;
  const kinds = [
    { key:'spring', label:'Lente', icon:'🌱', ground:[0,0,0,0] },
    { key:'summer', label:'Zomer', icon:'☀', ground:[208,180,85,.12] },
    { key:'autumn', label:'Herfst', icon:'🍂', ground:[157,102,46,.23] },
    { key:'winter', label:'Winter', icon:'❄', ground:[235,242,246,.70] }
  ];
  const plants = new Set(['oak','beech','birch','poplar','willow','hazel','hawthorn','bush','fern','pine','spruce']);
  function at(seconds) {
    const time = Number.isFinite(seconds) ? Math.max(0,seconds) : 0, yearSeconds = config.seasonSeconds * 4;
    const within = time % yearSeconds, index = Math.floor(within / config.seasonSeconds), local = within % config.seasonSeconds;
    const from = kinds[index], to = kinds[(index + 1) % 4];
    const u = Math.max(0,Math.min(1,(local - config.seasonSeconds + config.transitionSeconds) / config.transitionSeconds));
    const blend = u * u * (3 - 2 * u), a = from.ground[3] * (1-blend), b = to.ground[3] * blend, alpha = a+b;
    const channel = i => Math.round((from.ground[i]*a + to.ground[i]*b) / alpha);
    const groundTint = alpha > .0001 ? `rgba(${channel(0)},${channel(1)},${channel(2)},${alpha})` : null;
    return Object.freeze({ key:from.key, label:from.label, icon:from.icon, next:to.key, nextLabel:to.label, blend,
      year:Math.floor(time/yearSeconds)+1, progress:local/config.seasonSeconds,
      snow:(from.key==='winter'?1-blend:0)+(to.key==='winter'?blend:0), groundAlpha:alpha, groundTint });
  }
  let cachedAt, cached;
  function state() { const t=typeof elapsed==='number'?elapsed:0; if(!cached||cachedAt!==t){cachedAt=t;cached=at(t);}return cached; }
  function paletteFor(kind,x,y,s=state()) {
    if(!plants.has(kind))return 'base';
    // Individual trees change at stable, staggered points during the transition.
    // Each tree still draws once, retaining its original alpha and depth.
    let h=Math.imul(Math.round(x*4),374761393)^Math.imul(Math.round(y*4),668265263);h^=h>>>13;
    const threshold=((Math.imul(h,1274126177)>>>0)+.5)/4294967296;
    const season=s.blend>threshold?s.next:s.key;
    if(season==='winter')return 'winter';
    return season==='autumn'&&kind!=='pine'&&kind!=='spruce'?'autumn':'base';
  }
  root.__SEASONS_V1__=Object.freeze({version:'1.0',config,at,state,paletteFor});
})(window);
