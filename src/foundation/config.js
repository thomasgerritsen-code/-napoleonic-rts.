'use strict';
// Central tuning/config entry point. Existing v0.7.1 gameplay constants remain authoritative
// until their subsystem is migrated; new code must read from this object instead of adding
// another version-specific constant layer.
(function installFoundationConfig(global) {
  const config = Object.freeze({
    simulation: Object.freeze({
      fixedHz: 60,
      fixedDt: 1 / 60,
      maxFrameDt: 0.05,
      maxCatchUpSteps: 8
    }),
    movement: Object.freeze({
      roadSpeedMultiplierTarget: 1.30,
      infantryFollowerHardCap: 124,
      cavalryFollowerHardCap: 178,
      slotArrivalDistance: 1.35
    }),
    architecture: Object.freeze({
      allowNewVersionPatchFiles: false,
      legacyBaseline: '0.7.1',
      migrationStrategy: 'strangler-by-subsystem'
    })
  });

  global.NRTS_CONFIG = config;
  global.NRTS?.subsystems.register('config', config, {
    phase: 'foundation',
    responsibility: 'central immutable tuning and architecture policy'
  });
})(window);
