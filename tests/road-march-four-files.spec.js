const { test, expect } = require('@playwright/test');

// Regression for issue #212: the marching offset writer is separate from
// the manual formation writer in src/regiments.js.
test('infantry road-march slots never exceed four files', async ({ page }) => {
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  const widths = await page.evaluate(() => {
    const result = [];
    for (const count of [12, 18, 19, 20, 21, 28, 36]) {
      // Use registered units: regimentMembers() resolves member IDs.
      const created = infantry.map((_, i) => createUnit('france', 'infantry', 300 + (i % 4) * 18, 300 + Math.floor(i / 4) * 20));
      const o = createUnit('france', 'officer', 300, 270);
      const d = createUnit('france', 'drummer', 320, 270);
      const actual = createRegiment('france', [...created, o, d]);
      if (!actual) throw new Error('Could not create test regiment');
      const offsets = marchColumnOffsetsV063(actual);
      const slots = created.map(u => offsets.get(u.id));
      if (slots.some(slot => !slot)) throw new Error('Missing infantry march slot');
      const files = new Set(slots.map(slot => Math.round(slot.oy * 1000) / 1000)).size;
      result.push({ count, files });
      for (const unit of [...created, o, d]) unit.dead = true;
      actual.destroyed = true;
    }
    return result;
  });
  expect(widths).toHaveLength(7);
  for (const { count, files } of widths) {
    expect(files, `infantry count ${count}`).toBeLessThanOrEqual(4);
    expect(files, `infantry count ${count}`).toBeGreaterThanOrEqual(1);
  }
});
