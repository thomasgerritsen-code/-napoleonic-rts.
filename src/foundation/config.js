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
    // Flank/rear blows, shells on the works, tirailleurs, morale shown (open map only).
    battleDepth: OPEN_MAP ? Object.freeze({ flankDamage:1.25, rearDamage:1.5, flankShock:1.5, rearShock:2.0, waverAt:45,
      shellDamage:14, breachedCover:0.8, repairPerSecond:2, towerSplash:44, towerShellDamage:30, maxCraters:80,
      skirmishSpread:2.3, skirmishCover:0.72, skirmishWoodCover:0.55, skirmishVsCavalry:1.7, skirmishRange:1.15 }) : null,
    // Changing weather and wet ground with tracks (open map only); times in game seconds.
    weather: OPEN_MAP ? Object.freeze({ start:'clear', minSpell:150, maxSpell:300, turnSeconds:25, soakSeconds:60, drySeconds:240,
      misfire:0.3, mudSlow:0.18, mudSlowGuns:0.3 }) : null,
    // One-button regiments: fill up from the nearest free men; auto-regiment at the barracks (open map only).
    quickRegiment: OPEN_MAP ? Object.freeze({ reach:700, barracksReach:520 }) : null,
    // Gun crews (open map only): crew a cannon from loose men or a regiment, by button or by clicking the gun.
    gunCrew: OPEN_MAP ? Object.freeze({ reach:600, keepInRegiment:6, clickRadius:26 }) : null,
    // Troop kinds, each with a strength and a weakness (open map only). Multipliers on the base type.
    // Period troops (open map only): each with a strength and a weakness.
    // sides: who fields it (France trains, Britain's AI recruits by britishShare);
    // names: the British name for a kind both armies field.
    troops: OPEN_MAP ? Object.freeze({ fillReach:700, britishShare:Object.freeze({ grenadier:0.15, voltigeur:0.15, rifle:0.15, greys:0.45, hussar:0.55 }), kinds:Object.freeze({
      grenadier: Object.freeze({ base:'infantry', label:'Grenadier', plural:'Grenadiers', sides:['france', 'britain'], extra:Object.freeze({ food:60, wood:30 }), time:1.4,
        hp:1.4, melee:1.3, shock:0.7, speed:0.85, pro:'40% meer leven, 30% sterker met de bajonet, 30% minder moraalverlies', con:'15% trager en duurder' }),
      voltigeur: Object.freeze({ base:'infantry', label:'Voltigeur', plural:'Voltigeurs', sides:['france', 'britain'], names:Object.freeze({ britain:['Light Company', 'Light Companies'] }),
        extra:Object.freeze({ food:30 }), time:1.1,
        hp:0.75, melee:0.7, range:1.25, speed:1.15, pro:'25% verder schieten, vuurt naar believen, 15% sneller', con:'25% minder leven en zwak van dichtbij' }),
      guard: Object.freeze({ base:'infantry', label:'Oude Garde', plural:'Oude Garde', sides:['france'], extra:Object.freeze({ food:150, wood:80, iron:30 }), time:1.8, max:24,
        hp:1.6, melee:1.5, ranged:1.15, shock:0.35, speed:0.9, pro:'keizerlijke veteranen: 60% meer leven, 50% sterker met de bajonet, wijken bijna nooit', con:'heel duur, traag op te leiden, hooguit 24 man' }),
      sapper: Object.freeze({ base:'infantry', label:'Sapeur', plural:'Sapeurs', sides:['france'], extra:Object.freeze({ food:40, wood:40 }), time:1.2,
        hp:1.1, melee:1.25, ranged:0.8, work:2, pro:'genie met bijl en schop: een regiment sapeurs graaft, versterkt en herstelt 3x zo snel', con:'20% zwakker vuur' }),
      rifle: Object.freeze({ base:'infantry', label:'95th Rifleman', plural:'95th Rifles', sides:['britain'], extra:Object.freeze({ food:60, wood:30 }), time:1.3,
        hp:0.9, range:1.6, ranged:1.25, reload:1.6, vision:1.25, pro:'Baker-geweer: 60% verder en 25% treffender, schiet naar believen, scherpe ogen', con:'laadt 60% trager, 10% minder leven' }),
      cuirassier: Object.freeze({ base:'cavalry', label:'Kurassier', plural:'Kurassiers', sides:['france'], extra:Object.freeze({ food:100, wood:50, iron:40 }), time:1.4,
        hp:1.5, armour:0.3, charge:1.3, speed:0.85, pro:'50% meer leven, kuras houdt 30% van musketvuur tegen, 30% zwaardere charge', con:'15% trager, kost ijzer' }),
      lancer: Object.freeze({ base:'cavalry', label:'Poolse Lansier', plural:'Poolse Lansiers', sides:['france'], extra:Object.freeze({ food:60, wood:40 }), time:1.2,
        charge:1.2, vsInfantry:1.5, vsCavalry:0.75, speed:1.05, pro:'lans: 80% zwaarder tegen infanterie buiten carré en vluchtende troepen', con:'25% zwakker tegen andere ruiters' }),
      hussar: Object.freeze({ base:'cavalry', label:'Huzaar', plural:'Huzaren', sides:['france', 'britain'], names:Object.freeze({ britain:['Light Dragoon', 'Light Dragoons'] }), extra:Object.freeze({}), time:0.9,
        hp:0.75, charge:0.8, speed:1.25, vision:1.4, reload:0.8, pro:'25% sneller, 40% verder zicht, sneller weer klaar', con:'25% minder leven en lichtere charge' }),
      greys: Object.freeze({ base:'cavalry', label:'Scots Grey', plural:'Scots Greys', sides:['britain'], extra:Object.freeze({ food:100, wood:50 }), time:1.4,
        hp:1.35, charge:1.4, speed:0.9, pro:'zware dragonders op grijze paarden: 35% meer leven, 40% zwaardere charge', con:'10% trager, geen kuras' })
    }) }) : null,
    // Grouped, context-sensitive bottom menu (open map only).
    actionMenu: OPEN_MAP ? Object.freeze({ version:1 }) : null,
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
