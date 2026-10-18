const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=smoke', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_VERSION &&
    window.RTS_SIM?.version === window.RTS_VERSION &&
    window.NRTS?.gameVersion === window.RTS_VERSION &&
    window.NRTS?.foundationVersion === window.RTS_VERSION &&
    window.__RTS_DEBUG__?.getState &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__RTS_DEBUG__?.formationState
  ));
  return pageErrors;
}

test('game boots with current version and essential UI', async ({ page }) => {
  const errors = await openGame(page);
  const release = await page.evaluate(() => window.RTS_VERSION);
  await expect(page).toHaveTitle(`Napoleonic RTS v${release}`);
  await expect(page.locator('.version')).toHaveText(`v${release}`);
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#minimap')).toBeVisible();
  await expect(page.locator('.help')).toContainText('Klik groepslid: selecteer hele groep');
  await expect(page.locator('.help')).toContainText('Rechtsklik: lopen of verzamelen');
  await expect(page.locator('.help')).toContainText('1/2/3: linie, colonne of carré');
  await expect(page.locator('.help')).toContainText('Tab / Shift+Tab: volgend / vorig regiment');
  await expect(page.locator('.help')).toContainText('F: camera centreren op selectie');
  await expect(page.locator('.help')).toContainText('Q/E: groep 15° draaien');
  await expect(page.locator('.help')).toContainText('F3: test- en debugpaneel');
  await expect(page.locator('.help')).toContainText('Minimap: camera verplaatsen');
  await expect(page.locator('.help')).toContainText('Slepen: selecteren');
  await expect(page.locator('.help')).toContainText('Shift+slepen: toevoegen');
  await expect(page.locator('.help')).toContainText('Muiswiel: in-/uitzoomen');
  await expect(page.locator('.help')).toContainText('WASD / pijltjes: camera verplaatsen');

  const barracksAction = page.locator('[data-action="build-barracks"]');
  const houseAction = page.locator('[data-action="build-house"]');
  await expect(barracksAction).toContainText('Kazerne');
  await expect(barracksAction).toContainText('300 🪵');
  await expect(houseAction).toContainText('Woning');
  await expect(houseAction).toContainText('120 🪵');

  const beforeFocus = await barracksAction.boundingBox();
  await barracksAction.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(barracksAction).toBeFocused();
  const focusRing = await barracksAction.evaluate(button => {
    const style = getComputedStyle(button);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  expect(focusRing).toEqual({ style: 'solid', width: '2px', color: 'rgb(244, 216, 109)' });
  expect(await barracksAction.boundingBox()).toEqual(beforeFocus);

  const versions = await page.evaluate(() => ({
    release: window.RTS_VERSION,
    simulation: window.RTS_SIM.version,
    foundation: window.NRTS?.gameVersion,
    foundationRuntime: window.NRTS?.foundationVersion
  }));
  expect(versions.simulation).toBe(versions.release);
  expect(versions.foundation).toBe(versions.release);
  expect(versions.foundationRuntime).toBe(versions.release);

  // v286: six old one-page-per-subsystem tests are retained here without
  // six extra Chromium boot cycles. Preserve their original behaviour checks.
  const subsystems = await page.evaluate(() => ({
    weather: {
      loaded: NRTS.subsystems.has('battlefield-weather'),
      kind: window.__BATTLEFIELD_WEATHER_V1__?.state()?.kind ?? null
    },
    cavalryArtillery: {
      loaded: NRTS.subsystems.has('cavalry-artillery-tactics'),
      chargeVsSquare: window.__CAVALRY_ARTILLERY_V1__?.chargeVsSquare ?? null,
      roundAmmo: window.__CAVALRY_ARTILLERY_V1__?.ammo({})?.round ?? null
    },
    fogScouting: {
      loaded: NRTS.subsystems.has('fog-scouting'),
      cavalryVision: window.__FOG_SCOUTING_V1__?.cavalryVision ?? null
    },
    moraleCommand: {
      loaded: NRTS.subsystems.has('morale-command'),
      steady: window.__MORALE_COMMAND_V2__?.statusFor(90) ?? null,
      wavering: window.__MORALE_COMMAND_V2__?.statusFor(40) ?? null
    },
    staminaDiscipline: {
      loaded: NRTS.subsystems.has('stamina-discipline'),
      factor: window.__STAMINA_DISCIPLINE_V1__?.speedFactor({staminaV1:50}) ?? null
    },
    tacticalTerrain: {
      loaded: NRTS.subsystems.has('tactical-terrain'),
      lineOfSight: typeof window.__TACTICAL_TERRAIN_V1__?.lineOfSight === 'function'
    }
  }));
  expect(subsystems.weather.loaded).toBe(true);
  expect(['clear', 'rain', 'mist']).toContain(subsystems.weather.kind);
  expect(subsystems.cavalryArtillery).toEqual({loaded:true,chargeVsSquare:0.35,roundAmmo:24});
  expect(subsystems.fogScouting).toEqual({loaded:true,cavalryVision:430});
  expect(subsystems.moraleCommand).toEqual({loaded:true,steady:'STEADY',wavering:'WAVERING'});
  expect(subsystems.staminaDiscipline.loaded).toBe(true);
  expect(subsystems.staminaDiscipline.factor).toBeGreaterThan(0.8);
  expect(subsystems.staminaDiscipline.factor).toBeLessThan(0.9);
  expect(subsystems.tacticalTerrain).toEqual({loaded:true,lineOfSight:true});
  expect(errors).toEqual([]);
});

test('basic regiment command is accepted by the simulation', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode?.(true));
  const regimentId = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1080, 1180));
  await page.evaluate(id => window.__RTS_DEBUG__.selectRegiment(id), regimentId);
  await page.evaluate(() => window.__RTS_DEBUG__.orderSelectedWithFacing(1280, 1180, 0));

  const ordered = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);
  expect(ordered).toBeTruthy();
  expect(ordered.pathLength).toBeGreaterThan(0);
  expect(Math.abs(ordered.finalFacing)).toBeLessThan(0.1);

  await page.evaluate(() => window.RTS_SIM.step(0.2));
  const afterStep = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);
  expect(afterStep).toBeTruthy();
  expect(errors).toEqual([]);
});
