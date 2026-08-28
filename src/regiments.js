'use strict';
// ---------- Regiments ----------
  function freeUnits(side, type) {
    return livingUnits(side).filter(u => u.type === type && !u.regimentId && !u.routing);
  }

  function regimentEligibility(group) {
    const free = group.filter(u => !u.dead && !u.routing && !u.regimentId);
    const infantry = free.filter(u => u.type === 'infantry');
    const officers = free.filter(u => u.type === 'officer');
    const drummers = free.filter(u => u.type === 'drummer');
    return {
      infantry: infantry.length,
      officers: officers.length,
      drummers: drummers.length,
      canCreate: infantry.length >= 12 && officers.length >= 1 && drummers.length >= 1
    };
  }

  function createRegiment(side, candidateUnits, name = null) {
    const free = candidateUnits.filter(u => !u.dead && u.side === side && !u.routing && !u.regimentId);
    const infantry = free.filter(u => u.type === 'infantry').slice(0, 36);
    const officer = free.find(u => u.type === 'officer');
    const drummer = free.find(u => u.type === 'drummer');
    if (infantry.length < 12 || !officer || !drummer) return null;

    const members = [...infantry, officer, drummer];
    const reg = {
      id: nextRegimentId++,
      side,
      name: name || `${side === 'france' ? 'Frans' : 'Brits'} Regiment ${nextRegimentId - 1}`,
      memberIds: members.map(u => u.id),
      officerId: officer.id,
      drummerId: drummer.id,
      formation: 'line',
      morale: 100,
      destroyed: false,
      targetX: centroid(members).x,
      targetY: centroid(members).y,
      formedAt: elapsed,
      formedInfantryCount: infantry.length
    };
    members.forEach(u => { u.regimentId = reg.id; u.morale = Math.max(u.morale, 90); });
    regiments.push(reg);
    arrangeRegiment(reg, reg.targetX, reg.targetY, 'line');
    return reg;
  }

  function refreshRegiment(reg) {
    if (!reg || reg.destroyed) return;
    const members = regimentMembers(reg);
    if (!members.length) { reg.destroyed = true; return; }

    const officerAlive = members.some(u => u.id === reg.officerId && !u.dead);
    const drummerAlive = members.some(u => u.id === reg.drummerId && !u.dead);
    const average = members.reduce((s, u) => s + u.morale, 0) / members.length;
    reg.morale = Math.max(0, Math.min(100, average + (officerAlive ? 5 : -20) + (drummerAlive ? 5 : -8)));

    if (!officerAlive && !reg.officerLost) {
      reg.officerLost = true;
      members.forEach(u => { u.morale = Math.max(0, u.morale - 25); });
    }
    if (!drummerAlive && !reg.drummerLost) {
      reg.drummerLost = true;
      members.forEach(u => { u.morale = Math.max(0, u.morale - 10); });
    }

    const combatMembers = members.filter(u => ['infantry','officer','drummer'].includes(u.type));
    if (combatMembers.length < 5) reg.destroyed = true;
  }

  function regimentRoleOffsets(reg, mode) {
    const members = regimentMembers(reg);
    const infantry = members.filter(u => u.type === 'infantry');
    const officer = members.find(u => u.id === reg.officerId);
    const drummer = members.find(u => u.id === reg.drummerId);
    const result = new Map();

    let cols, sx = 18, sy = 19;
    if (mode === 'line') cols = Math.min(18, infantry.length);
    else if (mode === 'column') { cols = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(infantry.length) / 1.5))); sx = 19; sy = 18; }
    else cols = Math.max(4, Math.ceil(Math.sqrt(infantry.length)));

    const rows = Math.max(1, Math.ceil(infantry.length / cols));
    infantry.forEach((u, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      let ox = (col - (cols - 1) / 2) * sx;
      let oy = (row - (rows - 1) / 2) * sy;
      if (mode === 'square' && infantry.length >= 12) {
        const side = Math.ceil(Math.sqrt(infantry.length));
        const perimeter = Math.max(4, side * 4 - 4), k = i % perimeter, s = (side - 1) * sx;
        if (k < side) { ox = -s / 2 + k * sx; oy = -s / 2; }
        else if (k < side * 2 - 1) { ox = s / 2; oy = -s / 2 + (k - side + 1) * sy; }
        else if (k < side * 3 - 2) { ox = s / 2 - (k - (side * 2 - 1) + 1) * sx; oy = s / 2; }
        else { ox = -s / 2; oy = s / 2 - (k - (side * 3 - 2) + 1) * sy; }
      }
      result.set(u.id, { ox, oy });
    });

    if (officer) result.set(officer.id, { ox: 0, oy: mode === 'column' ? -rows * sy / 2 - 18 : -rows * sy / 2 - 20 });
    if (drummer) result.set(drummer.id, { ox: -22, oy: mode === 'column' ? -rows * sy / 2 - 18 : -rows * sy / 2 - 20 });
    return result;
  }

  function arrangeRegiment(reg, x, y, mode = reg.formation || 'line') {
    if (!reg || reg.destroyed) return;
    reg.formation = mode;
    reg.targetX = x; reg.targetY = y;
    const offsets = regimentRoleOffsets(reg, mode);
    for (const u of regimentMembers(reg)) {
      const o = offsets.get(u.id) || { ox: 0, oy: 0 };
      u.task = null; u.resourceTarget = null;
      u.targetX = Math.max(20, Math.min(WORLD.width - 20, x + o.ox));
      u.targetY = Math.max(20, Math.min(WORLD.height - 20, y + o.oy));
    }
  }

  function selectedRegiments() {
    const ids = [...new Set([...selectedUnits].map(u => u.regimentId).filter(Boolean))];
    return ids.map(getRegiment).filter(Boolean);
  }

  function selectWholeRegiment(reg) {
    if (!reg) return;
    selectedBuilding = null;
    selectedUnits.clear();
    regimentMembers(reg).forEach(u => selectedUnits.add(u));
  }

  function makePlayerRegiment() {
    const group = [...selectedUnits];
    const eligibility = regimentEligibility(group);
    if (!eligibility.canCreate) {
      statusEl.textContent = `Regiment vereist 12 musketiers + 1 officier + 1 drummer (nu ${eligibility.infantry}/${eligibility.officers}/${eligibility.drummers}).`;
      return;
    }
    const reg = createRegiment('france', group);
    if (!reg) return;
    selectWholeRegiment(reg);
    currentFormation = 'line';
    actionSignature = '';
    statusEl.textContent = `${reg.name} gevormd: officier en drummer toegewezen.`;
    updateHud(true);
  }

  function applyFormationNow(mode) {
    currentFormation = mode;
    const regs = selectedRegiments();
    if (regs.length) {
      for (const reg of regs) {
        const c = centroid(regimentMembers(reg));
        arrangeRegiment(reg, c.x, c.y, mode);
      }
      statusEl.textContent = `${formationLabel(mode)} toegepast op ${regs.length} regiment${regs.length > 1 ? 'en' : ''}.`;
    } else {
      const group = [...selectedUnits].filter(u => !u.dead && !u.routing);
      commandLooseFormation(group, centroid(group).x, centroid(group).y, mode);
      statusEl.textContent = group.length ? `${formationLabel(mode)} toegepast op losse troepen.` : `Formatie ingesteld op ${formationLabel(mode)}.`;
    }
    updateHud();
  }

  function commandLooseFormation(group, x, y, mode) {
    if (!group.length) return;
    const n = group.length;
    let cols = mode === 'line' ? Math.min(24, n) : mode === 'column' ? Math.min(6, Math.ceil(Math.sqrt(n))) : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols), sx = 18, sy = 19;
    group.forEach((u, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      u.targetX = x + (col - (cols - 1) / 2) * sx;
      u.targetY = y + (row - (rows - 1) / 2) * sy;
      u.task = null;
    });
  }

  function issueMove(x, y) {
    const regs = selectedRegiments();
    const regimentMemberIds = new Set();
    regs.forEach(r => regimentMembers(r).forEach(u => regimentMemberIds.add(u.id)));

    if (regs.length) {
      const spacing = 110;
      regs.forEach((reg, i) => arrangeRegiment(reg, x, y + (i - (regs.length - 1) / 2) * spacing, reg.formation));
    }

    const loose = [...selectedUnits].filter(u => !u.dead && !u.routing && !regimentMemberIds.has(u.id));
    if (loose.length) commandLooseFormation(loose, x, y, currentFormation);

    if (regs.length || loose.length) {
      statusEl.textContent = regs.length
        ? `${regs.length} regiment${regs.length > 1 ? 'en' : ''} marcheert in formatie.`
        : `${loose.length} losse eenheden verplaatsen.`;
    }
  }
