'use strict';
// Single inventory of the historical v0.7.1 script stack. This is intentionally
// descriptive only in Foundation phase 1; index.html still owns loading so behaviour
// remains compatible with the established startup sequence.
(function installLegacyManifest(global) {
  const manifest = Object.freeze({
    baseline: '0.7.1',
    baselineCommit: '29b038d3655d05be968bff6a80cb8f3162f1c8e8',
    core: Object.freeze([
      'src/core.js', 'src/economy.js', 'src/regiments.js', 'src/combat-ai.js',
      'src/hud.js', 'src/selection.js', 'src/navigation.js', 'src/visibility.js',
      'src/simulation-render.js'
    ]),
    legacyPatches: Object.freeze([
      'src/v05.js', 'src/v06.js', 'src/v061.js', 'src/v063.js', 'src/simulation-api.js',
      'src/input.js', 'src/v063-fixes.js', 'src/v064.js', 'src/v065.js', 'src/v066.js',
      'src/v066-road-index.js', 'src/v066-route-fixes.js', 'src/v067.js', 'src/v068.js',
      'src/v069-motion.js', 'src/v069-combat.js', 'src/v069-map.js', 'src/v070.js',
      'src/v070-motion.js', 'src/v070-regression-fixes.js', 'src/v071-motion.js',
      'src/v071-speed-hotfix.js'
    ]),
    simulationAdapters: Object.freeze([
      'src/v064-sim.js', 'src/v065-sim.js', 'src/v066-sim.js', 'src/v067-sim.js',
      'src/v068-sim.js', 'src/v069-sim.js', 'src/v070-sim.js', 'src/v071-sim.js'
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
