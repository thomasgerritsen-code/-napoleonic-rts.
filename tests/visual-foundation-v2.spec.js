const { test, expect } = require('@playwright/test');

test('Visual Foundation V2 stays deterministic and frame-stable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__VISUAL_FOUNDATION_V2__));

  const result = await page.evaluate(async () => {
    const api = window.__VISUAL_FOUNDATION_V2__;
    const renderer = window.drawTerrain;
    const startFrames = api.getFrameCount();
    const canvas = document.getElementById('game');
    const context = canvas.getContext('2d');
    const alphas = [];

    for (let i = 0; i < 12; i += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const sample = context.getImageData(12, 12, 1, 1).data;
      alphas.push(sample[3]);
    }

    return {
      version: api.version,
      seed: api.deterministicSeed,
      patchCount: api.patchCount,
      preservesGameplayState: api.preservesGameplayState,
      viewportCulled: api.viewportCulled,
      perFrameRandomGeneration: api.perFrameRandomGeneration,
      rendererStable: renderer === window.drawTerrain,
      framesAdvanced: api.getFrameCount() > startFrames,
      allFramesOpaque: alphas.every(alpha => alpha > 0)
    };
  });

  expect(result.version).toBe('visual-foundation-v2.0');
  expect(result.seed).toBe(18150618);
  expect(result.patchCount).toBe(72);
  expect(result.preservesGameplayState).toBe(true);
  expect(result.viewportCulled).toBe(true);
  expect(result.perFrameRandomGeneration).toBe(false);
  expect(result.rendererStable).toBe(true);
  expect(result.framesAdvanced).toBe(true);
  expect(result.allFramesOpaque).toBe(true);
  expect(errors).toEqual([]);
});
