'use strict';

const fs = require('fs');

function selectFocusedTests(files) {
  const selected = new Set(['tests/foundation-v071.spec.js']);
  let needsCoreSmoke = false;

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

  for (const raw of files) {
    const file = String(raw || '').trim();
    if (!file) continue;

    if (/^tests\/[^/]+\.spec\.js$/.test(file)) selected.add(file);

    if (
      file.startsWith('src/systems/navigation/') ||
      /^src\/v0(66|67|68)\.js$/.test(file) ||
      /^tests\/(navigation-v2|traffic-v068|water-v067)\.spec\.js$/.test(file)
    ) addNavigation();

    if (
      file.startsWith('src/systems/movement/') ||
      file.startsWith('src/systems/formation/') ||
      /^src\/v0(63|64|69|70|71)\.js$/.test(file) ||
      /^tests\/(movement-formation-consolidation|motion-v069|motion-v070|motion-v071|speed-v071)\.spec\.js$/.test(file)
    ) addMovement();

    if (
      file.startsWith('src/systems/ai/') ||
      /(^|\/)ai[^/]*\.js$/.test(file) ||
      file === 'tests/ai-separation.spec.js'
    ) selected.add('tests/ai-separation.spec.js');

    if (
      file === 'index.html' ||
      file === 'game.js' ||
      file === 'style.css' ||
      file === 'v05.css' ||
      file === 'v06.css' ||
      file === 'playwright.config.js' ||
      file === 'package.json' ||
      file.startsWith('src/foundation/') ||
      (file.startsWith('src/') &&
        !file.startsWith('src/systems/navigation/') &&
        !file.startsWith('src/systems/movement/') &&
        !file.startsWith('src/systems/formation/') &&
        !file.startsWith('src/systems/ai/') &&
        !/^src\/v0(63|64|66|67|68|69|70|71)\.js$/.test(file))
    ) needsCoreSmoke = true;
  }

  if (needsCoreSmoke) selected.add('tests/rts.spec.js');
  return [...selected].sort();
}

if (require.main === module) {
  const input = fs.readFileSync(0, 'utf8');
  const files = input.split(/\r?\n/).filter(Boolean);
  process.stdout.write(selectFocusedTests(files).join(' '));
}

module.exports = { selectFocusedTests };
