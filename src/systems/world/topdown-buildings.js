'use strict';
// ---------- Architecture v2: top-down building renderer ----------
(function installTopDownBuildings(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before world rendering.');

  function drawRoofTopDown(w, h, type, sideColor, complete) {
    const inset = 6;
    ctx.fillStyle = complete ? '#9f805d' : '#776a58';
    ctx.fillRect(-w/2 + inset, -h/2 + inset, w - inset*2, h - inset*2);

    ctx.strokeStyle = 'rgba(45,34,25,.72)';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeRect(-w/2 + inset, -h/2 + inset, w - inset*2, h - inset*2);

    // A roof ridge seen from directly above; never use perspective/side elevation.
    ctx.beginPath();
    if (w >= h) {
      ctx.moveTo(-w/2 + inset + 4, 0);
      ctx.lineTo(w/2 - inset - 4, 0);
    } else {
      ctx.moveTo(0, -h/2 + inset + 4);
      ctx.lineTo(0, h/2 - inset - 4);
    }
    ctx.stroke();

    ctx.fillStyle = sideColor;
    if (type === 'towncenter') {
      ctx.fillRect(-w*.18, -h*.18, w*.36, h*.36);
      ctx.fillStyle = 'rgba(235,220,180,.55)';
      ctx.fillRect(-w*.07, -h*.07, w*.14, h*.14);
    } else if (type === 'barracks') {
      ctx.fillRect(-w*.32, -h*.09, w*.64, h*.18);
    } else {
      ctx.fillRect(-w*.13, -h*.13, w*.26, h*.26);
    }
  }

  drawBuilding = function drawBuildingTopDown(b) {
    if (b.dead) return;
    const side = b.side === 'france' ? COLORS.france : COLORS.britain;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = b.complete ? 1 : .65;

    ctx.fillStyle = 'rgba(52,43,33,.35)';
    ctx.fillRect(-b.w/2 - 3, -b.h/2 - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = '#675641';
    ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h);
    drawRoofTopDown(b.w, b.h, b.type, side, b.complete);

    if (selectedBuilding === b) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 3 / camera.zoom;
      ctx.strokeRect(-b.w/2 - 5, -b.h/2 - 5, b.w + 10, b.h + 10);
    }
    if (!b.complete || b.queue.length) {
      const progress = b.complete ? b.production : b.construction;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(-b.w/2, b.h/2 + 7, b.w, 6);
      ctx.fillStyle = b.complete ? '#d7bd61' : COLORS.selected;
      ctx.fillRect(-b.w/2, b.h/2 + 7, b.w * progress, 6);
    }
    if (b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(-b.w/2, -b.h/2 - 10, b.w, 4);
      ctx.fillStyle = '#d56a58';
      ctx.fillRect(-b.w/2, -b.h/2 - 10, b.w * Math.max(0, b.hp / b.maxHp), 4);
    }
    ctx.restore();
  };

  if (typeof drawHouseV069 === 'function') {
    drawHouseV069 = function drawHouseTopDown(house, index) {
      ctx.save();
      ctx.translate(house.x, house.y);
      ctx.rotate(house.angle);
      ctx.fillStyle = index % 3 === 0 ? 'rgba(190,173,141,.96)' : index % 3 === 1 ? 'rgba(175,156,126,.96)' : 'rgba(205,188,154,.96)';
      ctx.fillRect(-house.w/2, -house.h/2, house.w, house.h);
      ctx.fillStyle = index % 2 ? 'rgba(103,67,48,.96)' : 'rgba(119,76,49,.96)';
      ctx.fillRect(-house.w*.44, -house.h*.34, house.w*.88, house.h*.68);
      ctx.strokeStyle = 'rgba(64,43,31,.78)';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(-house.w*.38, 0);
      ctx.lineTo(house.w*.38, 0);
      ctx.stroke();
      ctx.restore();
    };
  }

  nrts.subsystems.register('building-renderer', Object.freeze({ mode:'top-down' }), {
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'strict top-down rendering for gameplay and scenery buildings'
  });
})(window);
