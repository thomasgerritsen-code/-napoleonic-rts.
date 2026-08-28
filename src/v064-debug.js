'use strict';
// ---------- v0.6.4 test/debug hooks ----------
if (window.__RTS_DEBUG__?.formationState) {
  const formationStateV063ForV064 = window.__RTS_DEBUG__.formationState;
  window.__RTS_DEBUG__.formationState = function formationStateV064(id) {
    const base = formationStateV063ForV064(id);
    if (!base) return null;
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    const march = reg?.marchV063;
    return {
      ...base,
      locomotion: march?.locomotionV064 || (base.phase === 'formed' ? 'formed' : null),
      roadMarch: march?.locomotionV064 === 'road-march',
      roadBlend: Number.isFinite(march?.roadBlendV064) ? march.roadBlendV064 : null,
      motionSpeed: Number.isFinite(march?.speedV064) ? march.speedV064 : 0,
      anchorTerrain: march ? terrainAtV06(march.anchorX, march.anchorY) : terrainAtV06(base.centroid.x, base.centroid.y),
      marchingMembers: reg ? regimentMembers(reg).filter(u => u.marchingV064).length : 0
    };
  };
}
