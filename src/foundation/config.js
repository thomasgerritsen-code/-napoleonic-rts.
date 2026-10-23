'use strict';
// Central tuning/config entry point. Migrated subsystems read their authoritative
// values here so tuning no longer requires editing solver code.
(function installFoundationConfig(global) {
  // The iso view (?view=iso, src/systems/rendering/iso-view-v1.js) plays on an open
  // map: fewer roads and villages. Without it every value below is unchanged.
  const OPEN_MAP = /(?:^|[?&])view=iso(?:&|$)/.test(global.location?.search || '');
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
      slotArrivalDistance: 1.35,
      stuckRecovery: Object.freeze({
        sampleSeconds: 0.8,
        triggerSeconds: 2.4,
        minExpectedTravel: 8,
        replanCooldownSeconds: 2.8,
        nudgeDistance: 18,
        localAvoidance: Object.freeze({
          clearance: 7,
          cornerClearance: 13,
          waypointArrival: 7,
          directResumeClearance: 2,
          maxWaypointSeconds: 3.2
        })
      })
    }),
    formation: Object.freeze({
      roadMarch: Object.freeze({
        seekMinDistance: 300,
        minimumRoadShare: 0.22,
        deployDistance: 70,
        formalMarchOnlyOnRoad: true
      }),
      followers: Object.freeze({
        targetVelocityCaps: Object.freeze({ infantry: 92, cavalry: 150 }),
        lookAhead: Object.freeze({ road:0.075, field:0.060 }),
        smoothTime: Object.freeze({ engagement:0.105, forcedColumn:0.110, road:0.125, field:0.145 }),
        catchupAllowanceRatio: 0.72,
        catchupErrorGain: 1.45,
        roadFollowerFactor: 1.30,
        fieldFollowerFactor: 1.16
      })
    }),
    navigation: Object.freeze({
      roadIndexCell: 180,
      village: Object.freeze({
        routeMargin: Object.freeze({ infantry:15, cavalry:20, artillery:23, worker:8 }),
        unitRoofMargin: 3.5,
        routeRingBuffer: 26,
        openPointPadding: 6,
        maxOpenPointResolvePasses: 12,
        maxUnitResolvePasses: 8
      }),
      bridge: Object.freeze({
        approachClearance: 54,
        portalMargin: 14,
        centerlineTolerance: 12,
        looseWaypointTolerance: 10,
        columnFormStartClearance: 110,
        columnFormFullClearance: 12,
        columnLateralScale: 0.72,
        memberDeckClearance: 8,
        memberAdvanceStep: 28,
        memberReleasePadding: 90,
        stallSeconds: 0.70,
        stallMovementEpsilon: 0.35
      })
    }),
    rendering: Object.freeze({
      musketeerSprites: Object.freeze({
        displayHeight: 44,
        displayWidth: 32,
        frameRate: 7.5,
        idleFrame: 1,
        directions: 8,
        walkFrames: 4
      })
    }),
    world: Object.freeze({
      mapVariant: OPEN_MAP ? 'open' : 'standard',
      battlefield: Object.freeze({ width:8000, height:5000 }),
      roads: Object.freeze({
        omittedIds: Object.freeze(['chemin-de-la-crete-ouest','chemin-de-la-crete-est','voie-de-la-ferme','voie-du-verger','voie-de-la-lisiere',
          // Open map (iso view only, ?view=iso): the main chaussées and the bridge roads stay.
          ...(OPEN_MAP ? ['chemin-du-bois','chemin-des-fermes-est','chemin-des-fermes-sud','voie-du-moulin','route-de-la-vallee-ouest',
            'route-de-la-colline-sud','route-de-l-est-lointain','imperial-frontier-post','imperial-eastern-market','imperial-eastern-grain',
            'imperial-eastern-south-valley','imperial-eastern-far-post','imperial-western-northern-plateau','imperial-western-hill-lane',
            'imperial-western-south-detour','imperial-western-valley','imperial-rural-verger','imperial-rural-moulin','imperial-rural-forest'] : [])]),
        rendering: Object.freeze({ shoulderExtra:13, rutFraction:0.19, junctionApronScale:0.62, textureSpacing:34 })
      }),
      village: Object.freeze({
        structureScale: 1.22,
        yardMultipliers: Object.freeze({
          cottage:Object.freeze([2.0,2.35]), farmhouse:Object.freeze([2.15,2.65]), barn:Object.freeze([1.8,2.0]), inn:Object.freeze([2.0,2.15]), chapel:Object.freeze([1.8,2.5])
        }),
        plotGap:10,
        // Open map: fewer, smaller villages, well apart (null on the normal map).
        open: OPEN_MAP ? Object.freeze({ maxVillages:9, maxHouses:6, minSpacing:900 }) : null,
        berryExclusionPadding:70,
        baseBerryMin:10,
        baseBerryAmount:600,
        countrysideBerryAmount:600
      }),
      gameplayBuildings: Object.freeze({ scale:1.34, obstaclePadding:14 }),
      vegetation: Object.freeze({ buildingPadding:18, villageHousePadding:12, resourceGap:8, relocationStep:22, relocationRings:18, treeCanopyScale:1.18, berryRadius:19 })
    }),
    artillery: Object.freeze({ crewApproach:Object.freeze({ speedFactor:0.90, arrivalDistance:8, stagingBack:19, stagingLateral:18 }) }),
    ai: Object.freeze({ minWorkers:OPEN_MAP ? 18 : 10, desiredInfantryRegiments:4, desiredCavalry:8, desiredArtillery:3, attackStartSeconds:32, productionQueueLimit:2,
      // Open map: attack waves on a clock (src/systems/ai/campaign-pressure-v1.js); seconds.
      pressure: OPEN_MAP ? Object.freeze({ firstWave:150, interval:180, jitter:30, minWaveUnits:12, minRatio:0.8, maxDelay:120, maxAttack:150, breakRatio:0.5, breakAfter:12, minFight:25, maxMarch:300, contactRange:420, holdShift:180 }) : null }),
    // Open map: regiment orders (src/systems/combat/regiment-orders-v1.js) - a defensive
    // stance that braces a standing line or square, and regiments up to maxInfantry men.
    regimentOrders: OPEN_MAP ? Object.freeze({ maxInfantry:36, braceSeconds:4, defendDamage:0.7, defendShock:0.55, defendReload:0.85,
      digDelay:3, digSeconds:25, trenchWidth:40, trenchDamage:0.5, trenchShock:0.45, trenchSnap:110, maxTrenches:40,
      // Musket reach on the open map (game px; the default game keeps 122), shown as a ring when selected.
      infantryRange:200,
      // Horses at a trench (cut, bank and ditch): speed factor and extra damage taken.
      cavalryTrenchSpeed:0.3, cavalryExposed:1.4,
      // Trench levels: 1 is the dug field work (trenchDamage/trenchShock); 2 and 3 are bought upgrades the men build.
      trenchLevels:Object.freeze([null,
        Object.freeze({ label:'Veldschans' }),
        Object.freeze({ label:'Bekleed', cost:Object.freeze({ wood:120 }), seconds:10, damage:0.38, shock:0.35 }),
        Object.freeze({ label:'Versterkt', cost:Object.freeze({ wood:160, iron:40 }), seconds:14, damage:0.28, shock:0.25 })]) }) : null,
    // Buildable musketry tower (open map only): range and vision in game px.
    towers: OPEN_MAP ? Object.freeze({ cost:Object.freeze({ wood:260 }), hp:1100, range:240, reload:2.6, shots:2, damage:18,
      vision:420, aiAfter:300, aiMax:2 }) : null,
    architecture: Object.freeze({
      version:'2.1', serviceGeneration:21, allowNewVersionPatchFiles:false, legacyBaseline:'0.7.1', legacyBaselineCommit:'29b038d3655d05be968bff6a80cb8f3162f1c8e8', migrationStrategy:'strangler-by-subsystem'
    })
  });

  global.NRTS_CONFIG = config;
  global.NRTS?.subsystems.register('config', config, { phase:'foundation', responsibility:'central immutable tuning and architecture policy' });
})(window);
