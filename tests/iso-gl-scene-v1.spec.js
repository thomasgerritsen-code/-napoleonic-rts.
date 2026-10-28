const { test, expect } = require('@playwright/test');
test.describe.configure({ timeout: 150000 });

// The WebGL scene (?gl=1): the depth-sorted scene is drawn by the graphics chip
// into a page layer of its own, with nothing copied back into a 2D canvas; what
// is still drawn by hand is laid in only where it is drawn.
async function open(page, query) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.glClock = 10000; window.glRAF = true; performance.now = () => glClock;
    const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = fn => raf(() => { if (glRAF) fn(glClock); });
  });
  await page.goto(`/play.html?view=iso&mode=singleplayer&test=gl-scene${query}`);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().assets.ready && __ISO_VIEW_V1__.stats().assets.background === 0 && __ISO_VIEW_V1__.stats().ground);
  await page.evaluate(() => {
    glRAF = false;
    window.glFrame = () => { glClock += 50; renderStableFrameV1(() => {}, glClock); return __ISO_VIEW_V1__.stats(); };
    // Workers and the AI stand still: only what is placed here is in the picture.
    for (const u of units) u.dead = true;
    const tc = buildings.find(b => b.side === 'france' && b.type === 'towncenter');
    const men = []; for (let i = 0; i < 16; i++) men.push(createUnit('france', 'infantry', tc.x + 200 + (i % 8) * 18, tc.y + Math.floor(i / 8) * 20));
    men.push(createUnit('france', 'officer', tc.x + 170, tc.y)); createRegiment('france', men);
    camera.x = tc.x + 150; camera.y = tc.y + 40; camera.zoom = 1;
    for (let i = 0; i < 80; i++) glFrame();
  });
  return errors;
}
// One frame and, in the same task, the picture as the eye sees it: the canvases in page order.
const frameAndPicture = () => {
  const s = glFrame(), game = document.getElementById('game'), out = document.createElement('canvas');
  out.width = 300; out.height = 200; const g = out.getContext('2d');
  for (const id of ['game', 'iso-gl', 'iso-fx']) {
    const c = document.getElementById(id); if (c && getComputedStyle(c).display !== 'none') g.drawImage(c, 0, 0, game.width, game.height, 0, 0, 300, 200);
  }
  return { scene: s.glScene, gl: window.__ISO_GL_SCENE_V1__?.stats(), pixels: Array.from(g.getImageData(0, 0, 300, 200).data) };
};

test('the WebGL scene draws the battlefield as the canvas does, laying in hand drawing only where it is', async ({ page }) => {
  // One page (the woods are laid out afresh on every load): the same frame with the WebGL scene and without.
  const errors = await open(page, '&gl=1');
  const before = await page.evaluate(() => window.__ISO_GL_SCENE_V1__.stats());
  const on = await page.evaluate(frameAndPicture);
  await page.evaluate(() => { __ISO_GL_SCENE_V1__.setPaused(true); glClock -= 50; });
  const off = await page.evaluate(frameAndPicture);
  expect(on.scene).toBe(true); expect(off.scene).toBe(false);
  expect(on.gl.active).toBe(true); expect(on.gl.lastError).toBeNull();
  expect(on.gl.sprites - before.sprites).toBeGreaterThan(20);
  // Hand drawing is laid in by its own small area, never the whole screen at a time.
  const inserts = on.gl.inserts - before.inserts, pixels = on.gl.insertPixels - before.insertPixels;
  if (inserts) expect(pixels / inserts).toBeLessThan(900 * 600 * 0.25);
  // The same picture: few pixels differ by more than a trace.
  let differ = 0, sum = 0;
  for (let i = 0; i < on.pixels.length; i += 4) {
    const d = Math.abs(on.pixels[i] - off.pixels[i]) + Math.abs(on.pixels[i + 1] - off.pixels[i + 1]) + Math.abs(on.pixels[i + 2] - off.pixels[i + 2]);
    sum += d; if (d > 60) differ++;
  }
  const n = on.pixels.length / 4;
  console.log('GL vs canvas', JSON.stringify({ differ: differ / n, mean: sum / n / 3, inserts, pixels }));
  expect(differ / n).toBeLessThan(0.01);
  expect(sum / n / 3).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('without ?gl=1 the WebGL scene stays off and its layers hidden', async ({ page }) => {
  const errors = await open(page, '');
  const r = await page.evaluate(() => ({ scene: glFrame().glScene, display: getComputedStyle(document.getElementById('iso-gl')).display, active: window.__ISO_GL_SCENE_V1__.active() }));
  expect(r).toEqual({ scene: false, display: 'none', active: false });
  expect(errors).toEqual([]);
});
