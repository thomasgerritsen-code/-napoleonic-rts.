'use strict';
// ---------- Input ----------
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag.active = true; drag.startX = drag.x = e.clientX; drag.startY = drag.y = e.clientY; drag.moved = false;
  });
  canvas.addEventListener('mousemove', e => {
    if (!drag.active) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5) drag.moved = true;
  });
  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0 || !drag.active) return;
    drag.active = false;
    const w = screenToWorld(e.clientX, e.clientY);
    if (buildMode) { placeBuilding(buildMode, w.x, w.y); return; }
    if (drag.moved) selectBox(drag.startX, drag.startY, e.clientX, e.clientY);
    else selectPoint(w.x, w.y, e.shiftKey);
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (buildMode) return;
    const w = screenToWorld(e.clientX, e.clientY), r = resourceAt(w.x, w.y);
    if (r && assignGather(r)) return;
    issueMove(w.x, w.y);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    camera.zoom = Math.max(0.42, Math.min(1.55, camera.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    const after = screenToWorld(e.clientX, e.clientY);
    camera.x += before.x - after.x; camera.y += before.y - after.y; clampCamera();
  }, { passive: false });

  let touchTap = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    touchTap = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    if (!touchTap || !e.changedTouches.length) return;
    const t = e.changedTouches[0], w = screenToWorld(t.clientX, t.clientY);
    if (buildMode) { placeBuilding(buildMode, w.x, w.y); touchTap = null; return; }
    const hit = unitAt(w.x, w.y, 'france') || buildingAt(w.x, w.y, 'france');
    if (hit) {
      if (hit.kind === 'unit' && hit.regimentId) selectWholeRegiment(getRegiment(hit.regimentId));
      else {
        selectedUnits.clear(); selectedBuilding = null;
        if (hit.kind === 'unit') selectedUnits.add(hit); else selectedBuilding = hit;
      }
      actionSignature = ''; updateHud(true);
    } else {
      const r = resourceAt(w.x, w.y);
      if (r && !assignGather(r)) issueMove(w.x, w.y); else if (!r) issueMove(w.x, w.y);
    }
    touchTap = null;
  }, { passive: false });

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === 'escape') { buildMode = null; buildHintEl.classList.add('hidden'); updateActionVisuals(); }
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  actionsEl.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.formation) { applyFormationNow(btn.dataset.formation); return; }
    const action = btn.dataset.action;
    if (action === 'build-barracks') startBuild('barracks');
    else if (action === 'build-house') startBuild('house');
    else if (action === 'train-worker') queuePlayerUnit('worker');
    else if (action === 'train-infantry') queuePlayerUnit('infantry');
    else if (action === 'train-officer') queuePlayerUnit('officer');
    else if (action === 'train-drummer') queuePlayerUnit('drummer');
    else if (action === 'create-regiment') makePlayerRegiment();
    else if (action === 'bayonet') bayonetCommand();
    else if (action === 'charge') cavalryCharge();
    else if (action === 'artillery-mode') toggleArtillery();
  });

  document.getElementById('resetBtn').addEventListener('click', resetGame);

  // ---------- Test/debug hooks ----------
  if (new URLSearchParams(location.search).has('test')) {
    window.__RTS_DEBUG__ = {
      getState() {
        const serializeReg = r => ({
          id: r.id, side: r.side, formation: r.formation, destroyed: r.destroyed,
          memberIds: [...r.memberIds], officerId: r.officerId, drummerId: r.drummerId,
          formedInfantryCount: r.formedInfantryCount,
          officerAssigned: !!units.find(u => u.id === r.officerId && u.type === 'officer'),
          drummerAssigned: !!units.find(u => u.id === r.drummerId && u.type === 'drummer'),
          officerAlive: !!units.find(u => u.id === r.officerId && u.type === 'officer' && !u.dead),
          drummerAlive: !!units.find(u => u.id === r.drummerId && u.type === 'drummer' && !u.dead),
          livingMembers: regimentMembers(r).map(u => ({ id: u.id, type: u.type, regimentId: u.regimentId }))
        });
        return {
          elapsed,
          france: {
            food: economies.france.food, wood: economies.france.wood,
            popUsed: populationUsed('france'), popCap: economies.france.popCap,
            units: livingUnits('france').map(u => ({ id: u.id, type: u.type, regimentId: u.regimentId })),
            buildings: livingBuildings('france').map(b => ({ id: b.id, type: b.type, complete: b.complete, queue: b.queue.map(q => q.type) })),
            regiments: activeRegiments('france').map(serializeReg)
          },
          britain: {
            food: economies.britain.food, wood: economies.britain.wood,
            popUsed: populationUsed('britain'), popCap: economies.britain.popCap,
            units: livingUnits('britain').map(u => ({ id: u.id, type: u.type, regimentId: u.regimentId })),
            buildings: livingBuildings('britain').map(b => ({ id: b.id, type: b.type, complete: b.complete, queue: b.queue.map(q => q.type) })),
            regiments: activeRegiments('britain').map(serializeReg)
          },
          selected: [...selectedUnits].map(u => ({ id: u.id, type: u.type, regimentId: u.regimentId })),
          selectedBuilding: selectedBuilding ? { id: selectedBuilding.id, type: selectedBuilding.type, complete: selectedBuilding.complete, queue: selectedBuilding.queue.map(q => q.type) } : null,
          currentFormation,
          aiPlan
        };
      },
      selectLooseForRegiment(side = 'france') {
        selectedUnits.clear(); selectedBuilding = null;
        freeUnits(side, 'infantry').slice(0, 12).forEach(u => selectedUnits.add(u));
        const o = freeUnits(side, 'officer')[0], d = freeUnits(side, 'drummer')[0];
        if (o) selectedUnits.add(o); if (d) selectedUnits.add(d);
        actionSignature = ''; updateHud(true);
      },
      createCompletedBuilding(side = 'france', type = 'barracks', x = 900, y = 900) {
        const b = createBuilding(side, type, x, y, true);
        recalcPopCap(side); return b.id;
      },
      selectBuildingById(id) {
        selectedUnits.clear(); selectedBuilding = buildings.find(b => b.id === id) || null;
        actionSignature = ''; updateHud(true);
      },
      selectRegiment(id) {
        const r = getRegiment(id); if (r) selectWholeRegiment(r);
        actionSignature = ''; updateHud(true);
      },
      tick(seconds) {
        const steps = Math.ceil(seconds / 0.05);
        const dt = seconds / Math.max(1, steps);
        for (let i = 0; i < steps; i++) update(Math.min(0.05, dt));
        updateHud();
      },
      forceAIThink() { aiDevelop(); aiMilitaryOrder(); updateHud(true); },
      createRegimentDirect(side = 'france') {
        const candidates = [...freeUnits(side, 'infantry').slice(0, 12), ...freeUnits(side, 'officer').slice(0,1), ...freeUnits(side, 'drummer').slice(0,1)];
        return createRegiment(side, candidates)?.id || null;
      },
      worldToScreen
    };
  }

  // ---------- Loop ----------
  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt); draw(); requestAnimationFrame(frame);
  }

  resetGame();
  requestAnimationFrame(frame);
