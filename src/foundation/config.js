'use strict';
// Central tuning/config entry point. Migrated subsystems read their authoritative
// values here so tuning no longer requires editing solver code.
(function installFoundationConfig(global) {
  const config = Object.freeze({
    simulation: Object.freeze({
      fixedHz: 60,
      fixedDt: 1 / 60,
      maxFrameDt: 0.05,
      maxCatchUpSteps: 8
    }),
    movement: Object.freeze({
      roadMultipliers: Object.freeze({ chaussee: 1.24, secondary: 1.13, track: 1.05 }),
      intermediateTravelFloor: Object.freeze({ road: 0.95, field: 0.92 }),
      followerHardCaps: Object.freeze({ infantry: 124, cavalry: 178 }),
      slotArrivalDistance: 1.35
    }),
    formation: Object.freeze({
      followers: Object.freeze({
        targetVelocityCaps: Object.freeze({ infantry: 92, cavalry: 150 }),
        lookAhead: Object.freeze({ road: 0.075, field: 0.060 }),
        smoothTime: Object.freeze({ engagement: 0.105, forcedColumn: 0.110, road: 0.125, field: 0.145 }),
        catchupAllowanceRatio: 0.72,
        catchupErrorGain: 1.45,
        roadFollowerFactor: 1.30,
        fieldFollowerFactor: 1.16
      })
    }),
    architecture: Object.freeze({
      allowNewVersionPatchFiles: false,
      legacyBaseline: '0.7.1',
      legacyBaselineCommit: '29b038d3655d05be968bff6a80cb8f3162f1c8e8',
      migrationStrategy: 'strangler-by-subsystem'
    })
  });

  global.NRTS_CONFIG = config;
  global.NRTS?.subsystems.register('config', config, {
    phase: 'foundation',
    responsibility: 'central immutable tuning and architecture policy'
  });
})(window);
