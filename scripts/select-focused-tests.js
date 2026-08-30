'use strict';

const fs = require('fs');

function selectFocusedTests(files) {
  const normalized = files.map(file => String(file || '').trim()).filter(Boolean);
  const selected = new Set(['tests/smoke-v1.spec.js']);
  const battlefieldV7Bundle = normalized.some(file =>
    file === 'src/systems/world/map-expansion-v7.js' ||
    file === 'src/systems/world/village-scale-v7.js' ||
    file === 'src/systems/navigation/village-obstacles-v7.js' ||
    file === 'tests/village-navigation-v7.spec.js'
  );

  const restorationFiles = new Set([
    'index.html',
    'src/foundation/config.js',
    'src/systems/world/gameplay-building-scale-v1.js',
    'src/systems/world/ecology-v1.js',
    'src/systems/rendering/map-realism.js',
    'src/systems/rendering/natural-resources-v1.js',
    'src/systems/rendering/characters.js',
    'src/systems/rendering/artillery-topdown-v1.js',
    'src/systems/artillery/crew-approach-v1.js',
    'src/systems/movement/stuck-recovery-v1.js',
    'src/systems/ai/authority-v2.js',
    'src/systems/input/formation-drag-v1.js',
    'tests/restoration-batch-v1.spec.js'
  ]);

  const addNavigation = () => {
    selected.add('tests/navigation-v2.spec.js');
    selected.add('tests/traffic-v068.spec.js');
    selected.add('tests/water-v067.spec.js');
  };
  const addMovement = () => {
    selected.add('tests/movement-formation-consolidation.spec.js');
    selected.add('tests/motion-v071.spec.js');
    selected.add('tests/speed-v071.spec.js');
  };
  const addVillage = () => selected.add('tests/village-renderer-v2.spec.js');
  const addArchitectureV21 = () => selected.add('tests/architecture-v21.spec.js');
  const addRestoration = () => selected.add('tests/restoration-batch-v1.spec.js');

  for (const file of normalized) {
    if (/^tests\/[^/]+\.spec\.js$/.test(file)) selected.add(file);
    if (restorationFiles.has(file)) addRestoration();

    if (file.startsWith('src/foundation/') || file === 'tests/foundation-v071.spec.js') {
      selected.add('tests/foundation-v071.spec.js');
    }
    if (
      file === 'src/foundation/runtime.js' ||
      file === 'src/foundation/config.js' ||
      file === 'src/systems/world/api.js' ||
      file === 'src/systems/navigation/api.js' ||
      file === 'src/systems/movement/api.js' ||
      file === 'tests/architecture-v21.spec.js'
    ) addArchitectureV21();

    if (
      file === 'index.html' ||
      file === 'src/v069-map.js' ||
      file === 'src/systems/world/map-expansion-v7.js' ||
      file === 'src/systems/world/topdown-buildings.js' ||
      file.startsWith('src/systems/world/village-') ||
      file === 'src/systems/world/building-placement.js' ||
      file === 'src/systems/world/gameplay-building-scale-v1.js' ||
      file === 'src/systems/world/ecology-v1.js' ||
      file === 'tests/village-renderer-v2.spec.js'
    ) addVillage();

    if (
      file === 'src/systems/world/map-expansion-v7.js' ||
      file === 'src/systems/world/village-scale-v7.js' ||
      file === 'src/systems/navigation/village-obstacles-v7.js' ||
      file === 'tests/village-navigation-v7.spec.js'
    ) selected.add('tests/village-navigation-v7.spec.js');

    const isV7NavigationInfrastructure = battlefieldV7Bundle && (
      file === 'src/systems/navigation/road-index.js' ||
      file === 'src/systems/navigation/route-planner.js' ||
      file === 'src/systems/navigation/village-obstacles-v7.js'
    );
    const isNavigationFacadeOnly = file === 'src/systems/navigation/api.js';
    if (!isV7NavigationInfrastructure && !isNavigationFacadeOnly && (
      file.startsWith('src/systems/navigation/') ||
      /^src\/v0(66|67|68)\.js$/.test(file) ||
      /^tests\/(navigation-v2|traffic-v068|water-v067)\.spec\.js$/.test(file)
    )) addNavigation();

    const isMovementFacadeOnly = file === 'src/systems/movement/api.js';
    if (!isMovementFacadeOnly && (
      file.startsWith('src/systems/movement/') ||
      file.startsWith('src/systems/formation/') ||
      file === 'src/systems/rendering/frame-stability-v1.js' ||
      /^src\/v0(63|64|69|70|71)\.js$/.test(file) ||
      /^tests\/(movement-formation-consolidation|motion-v069|motion-v070|motion-v071|speed-v071)\.spec\.js$/.test(file)
    )) addMovement();

    if (
      file.startsWith('src/systems/ai/') ||
      /(^|\/)ai[^/]*\.js$/.test(file) ||
      file === 'tests/ai-separation.spec.js'
    ) selected.add('tests/ai-separation.spec.js');
  }

  return [...selected].sort();
}

if (require.main === module) {
  const input = fs.readFileSync(0, 'utf8');
  const files = input.split(/\r?\n/).filter(Boolean);
  process.stdout.write(selectFocusedTests(files).join(' '));
}

module.exports = { selectFocusedTests };
