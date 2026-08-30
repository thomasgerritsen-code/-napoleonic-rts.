'use strict';
// ---------- Village authority v4: collision-safe canonical settlement renderer ----------
(function installVillageAuthorityV4(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before village authority.');
  const villages = global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__;
  if (!villages) throw new Error('Village collision v4 must load before village authority v4.');
  if (typeof drawHouseV069 !== 'function') throw new Error('Village renderer must load before village authority v4.');

  function drawCanonicalVillagesV4() {
    ctx.save();
    for (const village of villages) {
      if (typeof drawJunctionApronV069 === 'function') drawJunctionApronV069(village);
      if (typeof global.drawVillageCommonsV5 === 'function') global.drawVillageCommonsV5(village);
    }
    for (const village of villages) {
      village.houses.forEach((house,index)=>drawHouseV069(house,index,village));
    }
    ctx.restore();
    ctx.textAlign = 'start';
  }

  drawCanonicalVillagesV4.__nrtsVillageAuthority = 'village-authority-v4';
  drawHamletsV066 = drawCanonicalVillagesV4;

  const api = Object.freeze({
    version:'village-authority-v4',
    sourceLayout:'village-collision-v4',
    sourceRenderer:'village-renderer-v2',
    yardBlend:global.__VILLAGE_YARD_BLEND_V5__?.version || null,
    overridesLegacyV070:true,
    collisionSafe:true,
    naturalYardBlend:Boolean(global.__VILLAGE_YARD_BLEND_V5__),
    visibleFacades:false
  });

  nrts.subsystems.register('village-authority-v4',api,{
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'reassert globally separated roof-only villages with natural shared yard rendering after legacy v0.7.0 overrides'
  });
  global.__VILLAGE_AUTHORITY_V4__ = api;
})(window);
