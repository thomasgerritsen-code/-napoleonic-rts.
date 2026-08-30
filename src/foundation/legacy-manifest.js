'use strict';
// Single inventory of the historical v0.7.1 script stack and Architecture v2 extractions.
(function installLegacyManifest(global) {
  const manifest = Object.freeze({
    baseline: '0.7.1',
    baselineCommit: '29b038d3655d05be968bff6a80cb8f3162f1c8e8',
    core: Object.freeze([
      'src/core.js', 'src/economy.js', 'src/regiments.js', 'src/combat-ai.js',
      'src/hud.js', 'src/selection.js', 'src/navigation.js', 'src/visibility.js',
      'src/simulation-render.js'
    ]),
    extractedSubsystems: Object.freeze({
      aiProduction: 'src/ai/production.js',
      aiTactics: 'src/ai/tactics.js',
      movementState: 'src/systems/movement/state.js',
      formationFollowers: 'src/systems/formation/followers.js',
      movementFixedStep: 'src/systems/movement/fixed-step.js',
      movementSpeedModel: 'src/systems/movement/speed-model.js',
      movementFormationApi: 'src/systems/movement/api.js',
      navigationRoadIndex: 'src/systems/navigation/road-index.js',
      navigationRoutePlanner: 'src/systems/navigation/route-planner.js',
      navigationBridgeCorridors: 'src/systems/navigation/bridge-corridors.js',
      navigationBridgeRouteResolver: 'src/systems/navigation/bridge-route-resolver.js',
      navigationBridgeSafety: 'src/systems/navigation/bridge-safety.js',
      navigationApi: 'src/systems/navigation/api.js',
      legacySimulationAdapter: 'src/foundation/legacy-simulation-adapter.js'
    }),
    legacyPatches: Object.freeze([
      'src/v05.js', 'src/v06.js', 'src/v061.js', 'src/v063.js', 'src/simulation-api.js',
      'src/input.js', 'src/v063-fixes.js', 'src/v064.js', 'src/v065.js', 'src/v066.js',
      'src/v067.js', 'src/v068.js', 'src/v069-motion.js', 'src/v069-combat.js',
      'src/v069-map.js', 'src/v070.js', 'src/v070-motion.js', 'src/v070-regression-fixes.js'
    ]),
    navigationCompatibility: Object.freeze([
      'src/v066.js',
      'src/v067.js',
      'src/v068.js',
      'src/v070-regression-fixes.js'
    ]),
    retiredFromRuntime: Object.freeze([
      'src/v066-road-index.js',
      'src/v066-route-fixes.js',
      'src/v071-motion.js',
      'src/v071-speed-hotfix.js',
      'src/v064-sim.js',
      'src/v065-sim.js',
      'src/v066-sim.js',
      'src/v067-sim.js',
      'src/v068-sim.js',
      'src/v069-sim.js',
      'src/v070-sim.js',
      'src/v071-sim.js'
    ]),
    simulationAdapters: Object.freeze([
      'src/foundation/legacy-simulation-adapter.js'
    ]),
    debugAdapters: Object.freeze([
      'src/v05-debug.js', 'src/v06-debug.js', 'src/v061-debug.js', 'src/v063-debug.js',
      'src/v064-debug.js', 'src/v065-debug.js', 'src/v066-debug.js', 'src/v067-debug.js',
      'src/v068-debug.js', 'src/v069-debug.js', 'src/v070-debug.js', 'src/v071-debug.js',
      'src/test-lab.js'
    ])
  });

  global.NRTS_LEGACY_MANIFEST = manifest;
  global.NRTS?.subsystems.register('legacy-manifest', manifest, {
    phase: 'foundation',
    responsibility: 'inventory and controlled retirement of historical patch layers'
  });
})(window);
