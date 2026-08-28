'use strict';
// ---------- Selection ----------
  function unitAt(wx, wy, side = null) {
    let best = null, bestD = 24 / camera.zoom;
    for (const u of units) {
      if (u.dead || (side && u.side !== side)) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }
  function buildingAt(wx, wy, side = null) {
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (b.dead || (side && b.side !== side)) continue;
      if (Math.abs(wx - b.x) <= b.w / 2 + 8 && Math.abs(wy - b.y) <= b.h / 2 + 8) return b;
    }
    return null;
  }
  function resourceAt(wx, wy) {
    let best = null, bestD = 32 / camera.zoom;
    for (const r of resources) {
      if (r.dead) continue;
      const d = Math.hypot(r.x - wx, r.y - wy);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  function selectPoint(wx, wy, add = false) {
    const b = buildingAt(wx, wy, 'france');
    if (b) {
      if (!add) selectedUnits.clear();
      selectedBuilding = b; actionSignature = ''; updateHud(true); return;
    }

    const u = unitAt(wx, wy, 'france');
    if (!add) { selectedUnits.clear(); selectedBuilding = null; }
    if (u) {
      if (u.regimentId) {
        const reg = getRegiment(u.regimentId);
        if (reg) {
          if (!add) selectedUnits.clear();
          regimentMembers(reg).forEach(m => selectedUnits.add(m));
          currentFormation = reg.formation;
        }
      } else if (add && selectedUnits.has(u)) selectedUnits.delete(u);
      else selectedUnits.add(u);
    }
    actionSignature = ''; updateHud(true);
  }

  function selectBox(x1, y1, x2, y2) {
    selectedUnits.clear(); selectedBuilding = null;
    const a = screenToWorld(Math.min(x1, x2), Math.min(y1, y2));
    const b = screenToWorld(Math.max(x1, x2), Math.max(y1, y2));
    const regimentIds = new Set();

    for (const u of units) {
      if (u.dead || u.side !== 'france') continue;
      if (u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) {
        if (u.regimentId) regimentIds.add(u.regimentId);
        else selectedUnits.add(u);
      }
    }
    regimentIds.forEach(id => {
      const reg = getRegiment(id);
      if (reg) regimentMembers(reg).forEach(u => selectedUnits.add(u));
    });
    if (regimentIds.size === 1) {
      const reg = getRegiment([...regimentIds][0]);
      if (reg) currentFormation = reg.formation;
    }
    actionSignature = ''; updateHud(true);
  }

  function assignGather(resource) {
    const workers = [...selectedUnits].filter(u => !u.dead && u.type === 'worker');
    if (!workers.length) return false;
    workers.forEach(u => assignWorkerToResource(u, resource));
    statusEl.textContent = `${workers.length} boeren verzamelen ${resource.type === 'wood' ? 'hout' : 'voedsel'}.`;
    return true;
  }
