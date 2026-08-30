'use strict';
// ---------- Village scale v7: calibrate settlement structures to soldier/world scale ----------
(function installVillageScaleV7(global) {
  const nrts=global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before Village V7 scale calibration.');
  const source=global.__VILLAGE_LAYOUT_V6_DATA__ || global.VILLAGE_SCENERY_V6;
  if (!source) throw new Error('Village V6 layout must load before Village V7 scale calibration.');

  // V6 intentionally exaggerated roofs for readability. At gameplay zoom that made cottages
  // read as oversized halls next to individual soldiers. Keep the settlement hierarchy and
  // positions, but reduce the physical structure footprint to a more believable world scale.
  const STRUCTURE_SCALE=0.72;

  const scaledVillages=Object.freeze(source.map(village=>Object.freeze({
    ...village,
    houses:Object.freeze(village.houses.map(house=>Object.freeze({
      ...house,
      w:house.w*STRUCTURE_SCALE,
      h:house.h*STRUCTURE_SCALE,
      scaleV7:STRUCTURE_SCALE
    })))
  })));

  global.__VILLAGE_LAYOUT_V6_DATA__=scaledVillages;
  global.VILLAGE_SCENERY_V6=scaledVillages;

  const previous=global.__VILLAGE_LAYOUT_V6__ || {};
  const api=Object.freeze({
    ...previous,
    structureScale:STRUCTURE_SCALE,
    soldierScaleCalibrated:true,
    preservesSettlementPositions:true
  });
  global.__VILLAGE_LAYOUT_V6__=api;
  global.__VILLAGE_SCALE_V7__=Object.freeze({
    version:'village-scale-v7',
    structureScale:STRUCTURE_SCALE,
    soldierScaleCalibrated:true,
    villageCount:scaledVillages.length,
    structureCount:scaledVillages.reduce((sum,v)=>sum+v.houses.length,0)
  });

  nrts.subsystems.register('village-scale-v7',global.__VILLAGE_SCALE_V7__,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'calibrate visible and collision structure footprints to infantry scale without changing Village V6 hierarchy'
  });
})(window);
