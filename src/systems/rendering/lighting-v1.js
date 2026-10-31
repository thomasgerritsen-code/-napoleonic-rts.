'use strict';
// Light and shade over the isometric battlefield (desktop renderer).
// - Low sun: in the morning and evening the light rakes across the field from
//   the sun's side (east in the morning, west in the evening), warm on that side
//   and cooler on the far side.
// - Night: the darkness is lifted where there is light - lanterns at the
//   headquarters, barracks, stables and hospital, the forge of a foundry, lit
//   windows in the village houses and the flash of muskets and guns - with a
//   warm glow over it. Only lights the French can see are drawn: enemy flashes
//   and buildings in the fog stay dark.
// Presentation only: no simulation state is read for anything but positions,
// and nothing is written. One half-size darkness canvas is reused; there are
// no per-frame allocations beyond gradients, and lights off screen are skipped.
// The phone renderer keeps its single night-colour layer (mobile budget).
(function installLighting(root) {
  if (root.__LIGHTING_V1__) return;
  const stats = { frames: 0, lights: 0, flashes: 0, sunDraws: 0 };
  const flashes = [];
  const clamp = n => Math.max(0, Math.min(1, n));
  let dark = null, dctx = null;
  // Lanterns by building type: [radius in world px, strength 0..1, warmth hue].
  const LAMPS = { towncenter: [120, 1, 'lamp'], barracks: [95, .9, 'lamp'], stable: [80, .75, 'lamp'],
    hospital: [85, .85, 'lamp'], house: [60, .7, 'window'], tower: [70, .8, 'lamp'], foundry: [125, 1, 'forge'],
    mine: [70, .7, 'lamp'], lumbercamp: [60, .6, 'lamp'] };
  const GLOW = { lamp: '255,178,92', window: '255,196,120', forge: '255,120,48', musket: '255,214,150', gun: '255,190,110' };

  // A shot at time `now` (render seconds), from the iso renderer's shot hook.
  function flash(x, y, type, now) {
    flashes.push({ x, y, gun: type === 'artillery', at: now });
    if (flashes.length > 160) flashes.splice(0, flashes.length - 160);
  }

  function sources(view, now) {
    const out = [], { sx, gy, z, W, H } = view, margin = 160 * z;
    const add = (x, y, r, k, glow) => {
      const X = sx(x), Y = gy(x, y), R = r * z;
      if (X < -R - margin || X > W + R + margin || Y < -R - margin || Y > H + R + margin) return;
      out.push({ X, Y, R, k, glow });
    };
    const visible = typeof isVisibleToFrance === 'function' ? isVisibleToFrance : () => true;
    for (const b of buildings) {
      if (b.dead || !b.complete) continue;
      if (b.side !== 'france' && !visible(b)) continue;
      const lamp = LAMPS[b.type]; if (!lamp) continue;
      // The lantern hangs at the front of the building, towards the viewer.
      add(b.x, b.y + b.h * .35, lamp[0], lamp[1], lamp[2]);
    }
    for (const v of root.VILLAGE_SCENERY_V4 || []) for (const h of v.houses || [])
      add(h.x, h.y + (h.h || 20) * .3, 46, .55 + ((h.x * 7 + h.y * 13) % 10) / 40, 'window');
    // Muzzle flashes: a musket for a tenth of a second, a gun a little longer.
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], age = now - f.at, life = f.gun ? .32 : .14;
      if (age > life || age < 0) { if (age > life) flashes.splice(i, 1); continue; }
      add(f.x, f.y, f.gun ? 190 : 70, (1 - age / life) * (f.gun ? 1 : .8), f.gun ? 'gun' : 'musket');
      stats.flashes++;
    }
    return out;
  }

  // Draws the day/night grade with light. Returns false to let the caller fall
  // back to its plain tint (no light state, nothing to add). part: 'sun' draws
  // only the low-sun grade (it blends with the picture under it), 'night' only
  // the darkness and its lights (it may go on a layer of its own); both by default.
  function draw(ctx, light, view, part) {
    if (!light) return false;
    const { W, H } = view, now = view.now;
    if (part !== 'sun') stats.frames++;
    // Low sun: warm from the sun's side, cool on the far side.
    const low = light.warmth * light.daylight;
    if (low > .02 && part !== 'night') {
      const morning = light.hour < 12, g = ctx.createLinearGradient(morning ? W : 0, 0, morning ? 0 : W, H * .35);
      g.addColorStop(0, `rgba(255,186,104,${.42 * low})`);
      g.addColorStop(.55, `rgba(255,214,170,${.06 * low})`);
      g.addColorStop(1, `rgba(70,84,128,${.22 * low})`);
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      stats.sunDraws++;
    }
    if (part === 'sun' || !light.tint) return true;
    // Lights only show once the evening has dimmed the field.
    const dusk = clamp((light.night - .15) / .5);
    const lights = dusk > 0 ? sources(view, now) : [];
    stats.lights = lights.length;
    // Darkness at half size, holes cut where the light falls, then laid over.
    // The night is half as deep again as the phone's single layer, so that the
    // lights matter; men and buildings stay readable.
    const w = Math.ceil(W / 2), h = Math.ceil(H / 2);
    if (!dark) { dark = document.createElement('canvas'); dctx = dark.getContext('2d'); }
    if (dark.width !== w || dark.height !== h) { dark.width = w; dark.height = h; }
    dctx.globalCompositeOperation = 'copy'; dctx.globalAlpha = 1; dctx.fillStyle = light.tint; dctx.fillRect(0, 0, w, h);
    dctx.globalCompositeOperation = 'source-over'; dctx.globalAlpha = .5 * clamp(light.night * 1.4); dctx.fillRect(0, 0, w, h); dctx.globalAlpha = 1;
    if (!lights.length) { ctx.save(); ctx.drawImage(dark, 0, 0, w, h, 0, 0, W, H); ctx.restore(); return true; }
    dctx.globalCompositeOperation = 'destination-out';
    const flicker = i => .92 + .08 * Math.sin(now * 7.3 + i * 2.1) * Math.sin(now * 3.1 + i);
    lights.forEach((l, i) => {
      const k = l.k * dusk * (l.glow === 'musket' || l.glow === 'gun' ? 1 : flicker(i)), r = l.R / 2;
      const g = dctx.createRadialGradient(l.X / 2, l.Y / 2, 0, l.X / 2, l.Y / 2, r);
      g.addColorStop(0, `rgba(0,0,0,${.85 * k})`); g.addColorStop(.45, `rgba(0,0,0,${.45 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.fillRect(l.X / 2 - r, l.Y / 2 - r, r * 2, r * 2);
    });
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(dark, 0, 0, w, h, 0, 0, W, H);
    // Warm glow over the lit ground.
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach((l, i) => {
      const k = l.k * dusk * (l.glow === 'musket' || l.glow === 'gun' ? 1 : flicker(i)), r = l.R * .8;
      const g = ctx.createRadialGradient(l.X, l.Y, 0, l.X, l.Y, r);
      g.addColorStop(0, `rgba(${GLOW[l.glow]},${.4 * k})`); g.addColorStop(1, `rgba(${GLOW[l.glow]},0)`);
      ctx.fillStyle = g; ctx.fillRect(l.X - r, l.Y - r, r * 2, r * 2);
    });
    ctx.restore();
    return true;
  }

  root.NRTS?.events?.on?.('game:reset', () => { flashes.length = 0; });
  root.__LIGHTING_V1__ = Object.freeze({ version: '1.0', draw, flash, stats: () => ({ ...stats, pendingFlashes: flashes.length }) });
})(window);
