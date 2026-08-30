'use strict';
// ---------- Architecture v2.1: movement + formation subsystem APIs ----------
(function installMovementFormationSubsystems(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before movement/formation systems.');
  const generation=global.NRTS_CONFIG?.architecture?.serviceGeneration ?? 21;

  if (!nrts.subsystems.has('movement')) {
    const movementApi=Object.freeze({
      moveUnit: (...args) => moveToward(...args),
      orderBattalion: (...args) => orderGroupPathV06(...args),
      terrainSpeed: (...args) => canonicalTerrainSpeedV071(...args),
      desiredBattalionSpeed: (...args) => desiredGroupSpeedV064(...args),
      stats: () => ({ ...V071_STATS, renderAlpha:V071_RENDER_ALPHA, fixedStepHz:1/V071_FIXED_DT })
    });
    nrts.subsystems.register('movement', movementApi, {
      phase: 'architecture-v2.1',
      owner:'src/systems/movement/api.js',
      legacyBridge: false,
      responsibility: 'authoritative battalion/loose-unit movement, speed model and fixed-step runtime'
    });
    nrts.services?.provide('movement','src/systems/movement/api.js',movementApi,{generation,legacyBridge:false});
  }

  if (!nrts.subsystems.has('formation')) {
    const formationApi=Object.freeze({
      arrangeBattalion: (...args) => arrangeRegiment(...args),
      applySelected: (...args) => applyFormationNow(...args),
      createBattalion: (...args) => createRegiment(...args),
      members: (...args) => regimentMembers(...args),
      finalOffsets: (...args) => finalFormationOffsetsV063(...args),
      marchColumnOffsets: (...args) => marchColumnOffsetsV063(...args),
      followerState: (...args) => followerStateV071(...args)
    });
    nrts.subsystems.register('formation', formationApi, {
      phase: 'architecture-v2.1',
      owner:'src/systems/formation',
      legacyBridge: false,
      responsibility: 'formation geometry, slot followers, membership and formation commands'
    });
    nrts.services?.provide('formation','src/systems/formation',formationApi,{generation,legacyBridge:false});
  }

  nrts.events.emit('movement-formation:ready', {
    version: V071_VERSION,
    movementOwner: 'src/systems/movement',
    formationOwner: 'src/systems/formation',
    stableServices:true
  });
})(window);
