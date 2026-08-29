'use strict';
// ---------- Village authority v3: prevent legacy version layers from restoring old facade houses ----------
(function installVillageAuthorityV3(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before village authority.');
  if (typeof VILLAGE_SCENERY_V069 === 'undefined') throw new Error('Village layout v2 must load before village authority.');
  if (typeof drawHouseV069 !== 'function') throw new Error('Village renderer v2 must load before village authority.');

  function drawCanonicalVillagesV3() {
    ctx.save();
    for (const village of VILLAGE_SCENERY_V069) {
      if (typeof drawJunctionApronV069 === 'function') drawJunctionApronV069(village);
    }
    for (const village of VILLAGE_SCENERY_V069) {
      village.houses.forEach(drawHouseV069);
    }
    ctx.restore();
    ctx.textAlign = 'start';
  }

  drawCanonicalVillagesV3.__nrtsVillageAuthority = 'village-authority-v3';
  drawHamletsV066 = drawCanonicalVillagesV3;

  const api = Object.freeze({
    version:'village-authority-v3',
    sourceLayout:'village-layout-v2',
    sourceRenderer:'village-renderer-v2',
    overridesLegacyV070:true,
    visibleFacades:false
  });

  nrts.subsystems.register('village-authority-v3', api, {
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'reassert canonical roof-only village drawing after legacy v0.7.0 replaces drawHamletsV066'
  });
  global.__VILLAGE_AUTHORITY_V3__ = api;
})(window);
