'use strict';
// ---------- Architecture v2: strict top-down building + village renderer ----------
(function installTopDownBuildings(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before world rendering.');

  function hash01(seed) {
    let x = (seed >>> 0) || 1;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  }

  function houseSeed(house, index) {
    return (((Math.round(house.x) * 73856093) ^ (Math.round(house.y) * 19349663) ^ ((index + 1) * 83492791)) >>> 0);
  }

  function roofPalette(seed) {
    const palettes = [
      ['#76503d', '#8a6047', '#5b3d31'],
      ['#6e4938', '#825640', '#55382c'],
      ['#7f5740', '#93664a', '#61402f'],
      ['#69483a', '#7b5643', '#50372e']
    ];
    return palettes[Math.floor(hash01(seed) * palettes.length) % palettes.length];
  }

  function drawRoofPlan(w, h, seed, accent, complete = true) {
    const [base, light, dark] = roofPalette(seed);
    const eave = Math.max(1.8, Math.min(4.5, Math.min(w, h) * .08));
    const longHorizontal = w >= h;

    // Ground shadow only; there is deliberately no facade/wall rectangle beneath the roof.
    ctx.fillStyle = 'rgba(30,27,22,.22)';
    ctx.fillRect(-w / 2 + 2.5, -h / 2 + 3.2, w, h);

    ctx.fillStyle = complete ? base : '#6f6659';
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Two roof planes, both seen from directly above. Tonal difference gives shape without perspective.
    ctx.fillStyle = complete ? light : '#7a7164';
    if (longHorizontal) ctx.fillRect(-w / 2, -h / 2, w, h / 2);
    else ctx.fillRect(-w / 2, -h / 2, w / 2, h);
    ctx.fillStyle = complete ? dark : '#625b51';
    if (longHorizontal) ctx.fillRect(-w / 2, 0, w, h / 2);
    else ctx.fillRect(0, -h / 2, w / 2, h);

    // Eaves and ridge are plan-view lines, never visible side elevations.
    ctx.strokeStyle = 'rgba(45,31,24,.82)';
    ctx.lineWidth = Math.max(.7, 1.1 / camera.zoom);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.beginPath();
    if (longHorizontal) {
      ctx.moveTo(-w / 2 + eave, 0);
      ctx.lineTo(w / 2 - eave, 0);
    } else {
      ctx.moveTo(0, -h / 2 + eave);
      ctx.lineTo(0, h / 2 - eave);
    }
    ctx.stroke();

    // Subtle roof tile courses.
    ctx.strokeStyle = 'rgba(231,199,151,.15)';
    ctx.lineWidth = Math.max(.45, .65 / camera.zoom);
    const courses = 4;
    for (let i = 1; i < courses; i++) {
      const t = i / courses;
      ctx.beginPath();
      if (longHorizontal) {
        const y = -h / 2 + h * t;
        ctx.moveTo(-w / 2 + 2, y);
        ctx.lineTo(w / 2 - 2, y);
      } else {
        const x = -w / 2 + w * t;
        ctx.moveTo(x, -h / 2 + 2);
        ctx.lineTo(x, h / 2 - 2);
      }
      ctx.stroke();
    }

    // One or two small chimneys seen as squares from above.
    const chimneyCount = hash01(seed ^ 0x51a3) > .68 ? 2 : 1;
    for (let i = 0; i < chimneyCount; i++) {
      const shift = chimneyCount === 1 ? .18 : (i ? .24 : -.24);
      const cx = longHorizontal ? w * shift : (i ? 2 : -2);
      const cy = longHorizontal ? (i ? 2 : -2) : h * shift;
      const s = Math.max(2.2, Math.min(4.2, Math.min(w, h) * .14));
      ctx.fillStyle = '#58483b';
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.fillStyle = 'rgba(213,197,166,.35)';
      ctx.fillRect(cx - s * .27, cy - s * .27, s * .54, s * .54);
    }

    // Tiny gameplay identity marker, kept entirely on top of the roof.
    if (accent) {
      ctx.fillStyle = accent;
      ctx.globalAlpha *= .88;
      const markerW = Math.min(w * .28, 18);
      const markerH = Math.min(h * .22, 12);
      ctx.fillRect(-markerW / 2, -markerH / 2, markerW, markerH);
      ctx.globalAlpha /= .88;
    }
  }

  function drawYardPlan(house, index) {
    const seed = houseSeed(house, index);
    const yardW = house.w * (1.75 + hash01(seed ^ 0x101) * .28);
    const yardH = house.h * (2.0 + hash01(seed ^ 0x202) * .36);
    const roadSide = house.side > 0 ? 1 : -1;

    // Slightly worn household plot.
    ctx.fillStyle = index % 3 === 0 ? 'rgba(109,124,76,.22)' : 'rgba(128,124,81,.16)';
    ctx.fillRect(-yardW / 2, -yardH / 2, yardW, yardH);

    // Low hedge/fence rectangle with a gate toward the road.
    ctx.strokeStyle = index % 2 ? 'rgba(67,77,46,.62)' : 'rgba(93,76,52,.58)';
    ctx.lineWidth = Math.max(.7, 1.25 / camera.zoom);
    ctx.strokeRect(-yardW / 2, -yardH / 2, yardW, yardH);

    // Garden rows occupy the rear quarter, away from the road.
    const gardenY = -roadSide * yardH * .29;
    const gardenW = yardW * .42;
    const gardenH = yardH * .24;
    ctx.fillStyle = 'rgba(93,83,51,.24)';
    ctx.fillRect(-gardenW / 2, gardenY - gardenH / 2, gardenW, gardenH);
    ctx.strokeStyle = 'rgba(62,78,43,.46)';
    ctx.lineWidth = Math.max(.45, .7 / camera.zoom);
    for (let r = -1; r <= 1; r++) {
      const y = gardenY + r * gardenH * .23;
      ctx.beginPath();
      ctx.moveTo(-gardenW * .42, y);
      ctx.lineTo(gardenW * .42, y);
      ctx.stroke();
    }

    // Short earth path from gate to front edge of the roof.
    ctx.strokeStyle = 'rgba(165,142,99,.47)';
    ctx.lineWidth = Math.max(2.2, 4.2 / camera.zoom);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, roadSide * yardH * .48);
    ctx.lineTo(0, roadSide * house.h * .48);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // A tiny shed on some plots, also strict roof-only top-down.
    if (index % 3 === 1) {
      const sw = Math.max(7, house.w * .28);
      const sh = Math.max(6, house.h * .30);
      const sx = yardW * .29;
      const sy = -roadSide * yardH * .18;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(34,30,25,.17)';
      ctx.fillRect(-sw / 2 + 1, -sh / 2 + 1.5, sw, sh);
      ctx.fillStyle = '#5f4636';
      ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
      ctx.strokeStyle = 'rgba(42,31,25,.72)';
      ctx.lineWidth = Math.max(.5, .75 / camera.zoom);
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.beginPath();
      ctx.moveTo(-sw / 2 + 1, 0);
      ctx.lineTo(sw / 2 - 1, 0);
      ctx.stroke();
      ctx.restore();
    }

    // A few shrubs make the settlement edges less geometric.
    for (let i = 0; i < 3; i++) {
      const rx = (hash01(seed ^ (0x300 + i * 31)) - .5) * yardW * .78;
      const ry = (hash01(seed ^ (0x400 + i * 47)) - .5) * yardH * .76;
      if (Math.abs(rx) < house.w * .58 && Math.abs(ry) < house.h * .62) continue;
      const radius = 1.8 + hash01(seed ^ (0x500 + i * 59)) * 2.2;
      ctx.fillStyle = 'rgba(45,77,43,.72)';
      ctx.beginPath();
      ctx.arc(rx, ry, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGameplayRoof(w, h, type, sideColor, complete) {
    drawRoofPlan(w, h, 9000 + w * 31 + h * 17 + String(type).length * 101, null, complete);

    // Identification is painted on the roof rather than represented as a visible wall block.
    ctx.fillStyle = sideColor;
    if (type === 'towncenter') {
      ctx.fillRect(-w * .15, -h * .15, w * .30, h * .30);
      ctx.fillStyle = 'rgba(235,220,180,.55)';
      ctx.fillRect(-w * .055, -h * .055, w * .11, h * .11);
    } else if (type === 'barracks') {
      ctx.fillRect(-w * .28, -h * .07, w * .56, h * .14);
    } else {
      ctx.fillRect(-w * .10, -h * .10, w * .20, h * .20);
    }
  }

  drawBuilding = function drawBuildingTopDown(b) {
    if (b.dead) return;
    const side = b.side === 'france' ? COLORS.france : COLORS.britain;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = b.complete ? 1 : .65;

    drawGameplayRoof(b.w, b.h, b.type, side, b.complete);

    if (selectedBuilding === b) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 3 / camera.zoom;
      ctx.strokeRect(-b.w / 2 - 5, -b.h / 2 - 5, b.w + 10, b.h + 10);
    }
    if (!b.complete || b.queue.length) {
      const progress = b.complete ? b.production : b.construction;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w, 6);
      ctx.fillStyle = b.complete ? '#d7bd61' : COLORS.selected;
      ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w * progress, 6);
    }
    if (b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(-b.w / 2, -b.h / 2 - 10, b.w, 4);
      ctx.fillStyle = '#d56a58';
      ctx.fillRect(-b.w / 2, -b.h / 2 - 10, b.w * Math.max(0, b.hp / b.maxHp), 4);
    }
    ctx.restore();
  };

  if (typeof drawHouseV069 === 'function') {
    drawHouseV069 = function drawHouseStrictTopDown(house, index) {
      const seed = houseSeed(house, index);
      ctx.save();
      ctx.translate(house.x, house.y);
      ctx.rotate(house.angle);

      drawYardPlan(house, index);
      drawRoofPlan(house.w, house.h, seed, null, true);

      ctx.restore();
    };
  }

  nrts.subsystems.register('building-renderer', Object.freeze({
    mode:'strict-top-down',
    villageDetail:'roof-plans-yards-gardens',
    visibleFacades:false
  }), {
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'strict orthographic roof-plan rendering for gameplay buildings and detailed roadside villages'
  });
})(window);
