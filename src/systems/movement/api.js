'use strict';
// ---------- Architecture v2: movement + formation subsystem APIs ----------
(function installMovementFormationSubsystems(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before movement/formation systems.');

  if (!nrts.subsystems.has('movement')) {
    nrts.subsystems.register('movement', Object.freeze({
      moveUnit: (...args) => moveToward(...args),
      orderBattalion: (...args) => orderGroupPathV06(...args),
      terrainSpeed: (...args) => canonicalTerrainSpeedV071(...args),
      desiredBattalionSpeed: (...args) => desiredGroupSpeedV064(...args),
      stats: () => ({ ...V071_STATS, renderAlpha:V071_RENDER_ALPHA, fixedStepHz:1/V071_FIXED_DT })
    }), {
      phase: 'architecture-v2',
      legacyBridge: false,
      responsibility: 'authoritative battalion/loose-unit movement, speed model and fixed-step runtime'
    });
  }

  if (!nrts.subsystems.has('formation')) {
    nrts.subsystems.register('formation', Object.freeze({
      arrangeBattalion: (...args) => arrangeRegiment(...args),
      applySelected: (...args) => applyFormationNow(...args),
      createBattalion: (...args) => createRegiment(...args),
      members: (...args) => regimentMembers(...args),
      finalOffsets: (...args) => finalFormationOffsetsV063(...args),
      marchColumnOffsets: (...args) => marchColumnOffsetsV063(...args),
      followerState: (...args) => followerStateV071(...args)
    }), {
      phase: 'architecture-v2',
      legacyBridge: false,
      responsibility: 'formation geometry, slot followers, membership and formation commands'
    });
  }

  nrts.events.emit('movement-formation:ready', {
    version: V071_VERSION,
    movementOwner: 'src/systems/movement',
    formationOwner: 'src/systems/formation'
  });
})(window);
