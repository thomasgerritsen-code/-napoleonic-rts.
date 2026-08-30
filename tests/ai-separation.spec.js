const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

function source(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

async function openV071(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_VERSION &&
    window.RTS_SIM?.version === window.RTS_VERSION &&
    window.NRTS?.subsystems.has('ai-production') &&
    window.NRTS?.subsystems.has('ai-tactics')
  ));
  return errors;
}

test('AI production and tactics are physically separated from combat', async () => {
  const combat = source('src/combat-ai.js');
  const production = source('src/ai/production.js');
  const tactics = source('src/ai/tactics.js');

  expect(combat).not.toContain('function aiBuild');
  expect(combat).not.toContain('function aiQueue');
  expect(combat).not.toContain('function aiTryFormRegiment');
  expect(combat).not.toContain('function aiDevelop');
  expect(combat).not.toContain('function aiMilitaryOrder');

  expect(production).toContain('function aiBuild');
  expect(production).toContain('function aiQueue');
  expect(production).toContain('function aiTryFormRegiment');
  expect(production).toContain('function aiDevelop');
  expect(production).not.toContain('function aiMilitaryOrder');

  expect(tactics).toContain('function aiMilitaryOrder');
  expect(tactics).not.toContain('function aiDevelop');
});

test('production and tactical cycles remain independently callable through stable facades', async ({ page }) => {
  const errors = await openV071(page);
  const result = await page.evaluate(() => {
    const production = window.NRTS.subsystems.get('ai-production');
    const tactics = window.NRTS.subsystems.get('ai-tactics');
    const before = window.__RTS_DEBUG__.getState();

    tactics.issueMilitaryOrder();
    production.develop();
    production.develop();

    const after = window.__RTS_DEBUG__.getState();
    return {
      productionCallable: typeof production.develop === 'function',
      tacticsCallable: typeof tactics.issueMilitaryOrder === 'function',
      beforeUnits: before.britain.units.length,
      afterUnits: after.britain.units.length,
      aiPlan: after.aiPlan
    };
  });

  expect(result.productionCallable).toBe(true);
  expect(result.tacticsCallable).toBe(true);
  expect(result.afterUnits).toBeGreaterThanOrEqual(result.beforeUnits);
  expect(typeof result.aiPlan).toBe('string');
  expect(errors).toEqual([]);
});
