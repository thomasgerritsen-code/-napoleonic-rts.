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
    navigation: Object.freeze({
      roadIndexCell: 180,
      village: Object.freeze({
        routeMargin: Object.freeze({ infantry: 15, cavalry: 20, artillery: 23, worker: 8 }),
        unitRoofMargin: 3.5,
        routeRingBuffer: 26,
        openPointPadding: 6,
        maxOpenPointResolvePasses: 12,
        maxUnitResolvePasses: 8
      }),
      bridge: Object.freeze({
        // Start centering before the bridge mouth. 54 px keeps the approach portal
        // just inside the legacy 190 px traffic hold point on a 270 px bridge, so
        // a granted battalion can align without interfering with the waiting queue.
        approachClearance: 54,
        portalMargin: 14,
        centerlineTolerance: 12,
        looseWaypointTolerance: 10,
        // Traffic reservation and centreline steering may begin early, but the
        // visible formation should stay in its normal road/field shape until the
        // battalion is close to the bridge mouth. From 90 px before the deck it
        // progressively forms the bridge column and is fully narrowed at 24 px.
        columnFormStartClearance: 90,
        columnFormFullClearance: 24,
        // Bridge columns are intentionally a little narrower than road columns.
        // This leaves room for damped followers while the anchor finishes turning
        // into the bridge, preventing outside files from clipping a bridge corner.
        columnLateralScale: 0.72,
        stallSeconds: 0.70,
        stallMovementEpsilon: 0.35
      })
    }),
    world: Object.freeze({
      battlefield: Object.freeze({
        width: 4300,
        height: 2500
      }),
      roads: Object.freeze({
        omittedIds: Object.freeze([
          'chemin-de-la-crete-ouest',
          'chemin-de-la-crete-est',
          'voie-de-la-ferme',
          'voie-du-verger',
          'voie-de-la-lisiere'
        ])
      }),
      village: Object.freeze({
        structureScale: 1.22,
        yardMultipliers: Object.freeze({
          cottage: Object.freeze([2.0, 2.35]),
          farmhouse: Object.freeze([2.15, 2.65]),
          barn: Object.freeze([1.8, 2.0]),
          inn: Object.freeze([2.0, 2.15]),
          chapel: Object.freeze([1.8, 2.5])
        }),
        plotGap: 10
      })
    }),
    architecture: Object.freeze({
      version: '2.1',
      serviceGeneration: 21,
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
