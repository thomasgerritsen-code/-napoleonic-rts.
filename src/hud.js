'use strict';
// ---------- HUD/actions ----------
  function setHudText(el, text) {
    const next = String(text);
    if (el.textContent !== next) el.textContent = next;
  }

  function getActionSignature() {
    const buildingPart = selectedBuilding ? `${selectedBuilding.id}:${selectedBuilding.type}:${selectedBuilding.complete}` : '-';
    const selected = [...selectedUnits].filter(u => !u.dead);
    const typeCounts = {};
    selected.forEach(u => typeCounts[u.type] = (typeCounts[u.type] || 0) + 1);
    const typePart = Object.entries(typeCounts).sort().map(([k,v]) => `${k}:${v}`).join(',');
    const regPart = [...new Set(selected.map(u => u.regimentId).filter(Boolean))].sort().join(',');
    return `${buildingPart}|${typePart}|${regPart}`;
  }

  function makeDynamicButton(action, html, disabled = false) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.action = action; b.dataset.dynamic = '1'; b.innerHTML = html; b.disabled = disabled;
    return b;
  }

  function renderDynamicActions(force = false) {
    const sig = getActionSignature();
    if (!force && sig === actionSignature) return;
    actionSignature = sig;
    actionsEl.querySelectorAll('[data-dynamic="1"]').forEach(el => el.remove());
    const fragment = document.createDocumentFragment();

    if (selectedBuilding?.complete && selectedBuilding.side === 'france') {
      if (selectedBuilding.type === 'towncenter') {
        fragment.append(makeDynamicButton('train-worker', 'Boer<br><small>50 🍞</small>'));
      }
      if (selectedBuilding.type === 'barracks') {
        fragment.append(makeDynamicButton('train-infantry', 'Musketier<br><small>80 🍞 · 20 🪵</small>'));
        fragment.append(makeDynamicButton('train-officer', 'Officier<br><small>160 🍞 · 60 🪵</small>'));
        fragment.append(makeDynamicButton('train-drummer', 'Drummer<br><small>90 🍞 · 20 🪵</small>'));
      }
    }

    const group = [...selectedUnits].filter(u => !u.dead && !u.routing);
    const eligible = regimentEligibility(group);
    const hasLooseRegimentMaterial = group.some(u => ['infantry','officer','drummer'].includes(u.type) && !u.regimentId);
    if (hasLooseRegimentMaterial) {
      fragment.append(makeDynamicButton(
        'create-regiment',
        `Maak regiment<br><small>${eligible.infantry}/12 · O${eligible.officers} · D${eligible.drummers}</small>`,
        !eligible.canCreate
      ));
    }

    if (group.some(u => u.type === 'infantry' || u.type === 'officer')) fragment.append(makeDynamicButton('bayonet', 'Bajonet<br><small>charge</small>'));
    if (group.some(u => u.type === 'cavalry')) fragment.append(makeDynamicButton('charge', 'Cavalerie<br><small>charge</small>'));
    if (group.some(u => u.type === 'artillery')) {
      const mode = group.find(u => u.type === 'artillery').artilleryMode;
      fragment.append(makeDynamicButton('artillery-mode', mode === 'round' ? 'Kanonkogel<br><small>→ grapeshot</small>' : 'Grapeshot<br><small>→ kogel</small>'));
    }

    actionsEl.prepend(fragment);
  }

  function updateActionVisuals() {
    const regs = selectedRegiments();
    const selectedMode = regs.length === 1 ? regs[0].formation : currentFormation;
    actionsEl.querySelectorAll('[data-formation]').forEach(btn => {
      const active = btn.dataset.formation === selectedMode;
      btn.classList.toggle('active', active);
      if (btn.getAttribute('aria-pressed') !== (active ? 'true' : 'false')) {
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
    actionsEl.querySelectorAll('[data-action^="build-"]').forEach(btn => {
      const active = btn.dataset.action === `build-${buildMode}`;
      btn.classList.toggle('active', active);
    });
  }

  function regimentOrderState(reg) {
    const members = regimentMembers(reg).filter(u => !u.dead && !u.routing);
    if (!members.length) return { moving: false, distance: 0 };
    const c = centroid(members);
    const dx = (reg.targetX ?? c.x) - c.x;
    const dy = (reg.targetY ?? c.y) - c.y;
    const distance = Math.hypot(dx, dy);
    return { moving: distance > 42, distance };
  }

  function regimentTacticalMetrics(reg) {
    const members = regimentMembers(reg).filter(u => !u.dead);
    let hp = 0, maxHp = 0, routing = 0;
    for (const u of members) {
      hp += Math.max(0, Number(u.hp) || 0);
      maxHp += Math.max(1, Number(u.maxHp) || 1);
      if (u.routing) routing++;
    }
    return {
      strength: maxHp ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0,
      morale: Math.max(0, Math.min(100, Math.round(Number(reg?.morale) || 0))),
      routing,
      members: members.length
    };
  }

  function selectionTacticalState(regs = selectedRegiments()) {
    if (!regs.length) return { state: 'neutral', strength: 0, morale: 0, routing: 0 };
    const metrics = regs.map(regimentTacticalMetrics);
    const strength = Math.round(metrics.reduce((sum, m) => sum + m.strength, 0) / metrics.length);
    const morale = Math.round(metrics.reduce((sum, m) => sum + m.morale, 0) / metrics.length);
    const routing = metrics.reduce((sum, m) => sum + m.routing, 0);
    const reforming = regs.filter(reg => reg?.postCrossingReformV1322).length;
    const moving = regs.filter(reg => regimentOrderState(reg).moving).length;
    let state = 'steady';
    if (routing || morale < 45 || strength < 55) state = 'pressured';
    else if (reforming) state = 'reforming';
    else if (moving) state = 'moving';
    return { state, strength, morale, routing, reforming, moving };
  }

  function regimentReformLabel(reg) {
    const reform = reg?.postCrossingReformV1322;
    if (!reform) return null;
    const progress = Math.max(0, Math.min(100, Math.round((Number(reform.progress) || 0) * 100)));
    const cohesion = Math.max(0, Math.min(100, Math.round((Number(reform.readiness) || 0) * 100)));
    return `hergroepeert ${progress}% · cohesie ${cohesion}%`;
  }

  function regimentOrderLabel(reg) {
    const order = regimentOrderState(reg);
    const formation = formationLabel(reg.formation || 'line');
    const reform = regimentReformLabel(reg);
    if (!order.moving) return `${formation} · ${reform || 'positie ingenomen'}`;
    return `${formation} · ${reform ? `${reform} · ` : ''}marcheert · ${Math.max(1, Math.round(order.distance))} m te gaan`;
  }

  function selectionRegimentSummaryV144(regs = selectedRegiments()) {
    const tactical = selectionTacticalState(regs);
    if (regs.length === 1) {
      const reg = regs[0], members = regimentMembers(reg);
      const officerAlive = members.some(u => u.id === reg.officerId);
      const drummerAlive = members.some(u => u.id === reg.drummerId);
      const warning = tactical.state === 'pressured' ? ' · onder druk' : '';
      return `${reg.name} · ${members.filter(u => u.type === 'infantry').length} musketiers · O:${officerAlive ? '✓' : '✗'} D:${drummerAlive ? '✓' : '✗'} · sterkte ${tactical.strength}% · morale ${Math.round(reg.morale)}%${warning} · ${regimentOrderLabel(reg)}`;
    }
    if (regs.length > 1) {
      const moving = tactical.moving;
      const reforming = tactical.reforming;
      const formations = [...new Set(regs.map(reg => formationLabel(reg.formation || 'line')))];
      const formationText = formations.length === 1 ? formations[0] : 'gemengde formaties';
      const reformText = reforming ? ` · ${reforming} hergroepeert` : '';
      const pressureText = tactical.state === 'pressured' ? ' · onder druk' : '';
      return `${regs.length} regimenten geselecteerd · ${formationText} · sterkte ${tactical.strength}% · morale ${tactical.morale}%${pressureText}${reformText} · ${moving ? `${moving} marcheert` : 'positie ingenomen'}`;
    }
    return null;
  }

  function setSelectionDetails(text, tacticalState = 'neutral') {
    setHudText(selectionDetailsEl, text);
    if (selectionDetailsEl.title !== text) selectionDetailsEl.title = text;
    if (selectionDetailsEl.dataset.tacticalState !== tacticalState) selectionDetailsEl.dataset.tacticalState = tacticalState;
    if (selectionDetailsEl.getAttribute('aria-live') !== 'polite') selectionDetailsEl.setAttribute('aria-live', 'polite');
    if (selectionDetailsEl.getAttribute('aria-atomic') !== 'true') selectionDetailsEl.setAttribute('aria-atomic', 'true');
  }

  function updateHud(forceActions = false) {
    for (const u of [...selectedUnits]) if (u.dead) selectedUnits.delete(u);
    if (selectedBuilding?.dead) selectedBuilding = null;
    recalcPopCap('france'); recalcPopCap('britain');

    const frenchLiving = livingUnits('france');
    const britishLiving = livingUnits('britain');
    const frenchRegs = activeRegiments('france');
    const britishRegs = activeRegiments('britain');
    const selectedRegs = selectedRegiments();

    setHudText(foodEl, Math.floor(economies.france.food));
    setHudText(woodEl, Math.floor(economies.france.wood));
    setHudText(populationEl, `${populationUsed('france')}/${economies.france.popCap}`);
    setHudText(frenchCountEl, frenchLiving.length);
    setHudText(britishCountEl, britishLiving.length);
    setHudText(frenchRegimentsEl, frenchRegs.length);

    setHudText(aiEconomyEl, `Economie: 🍞 ${Math.floor(economies.britain.food)} · 🪵 ${Math.floor(economies.britain.wood)} · 👥 ${populationUsed('britain')}/${economies.britain.popCap}`);
    setHudText(aiBuildingsEl, `Gebouwen: ${livingBuildings('britain').filter(b => b.complete).length} compleet`);
    setHudText(aiRegimentsEl, `Regimenten: ${britishRegs.length}`);
    setHudText(aiPlanEl, `Plan: ${aiPlan}`);

    if (selectedBuilding) {
      const b = selectedBuilding;
      setHudText(selectionTitleEl, BUILDINGS[b.type].label);
      if (!b.complete) setSelectionDetails(`In aanbouw · ${Math.floor(b.construction * 100)}%`);
      else if (b.queue.length) setSelectionDetails(`Productie: ${b.queue[0].label} · ${Math.floor(b.production * 100)}% · queue ${b.queue.length}`);
      else setSelectionDetails(`${Math.max(0, Math.floor(b.hp))}/${b.maxHp} HP`);
    } else if (selectedUnits.size) {
      const group = [...selectedUnits];
      const regSummary = selectionRegimentSummaryV144(selectedRegs);
      if (regSummary) {
        const tactical = selectionTacticalState(selectedRegs);
        setHudText(selectionTitleEl, selectedRegs.length === 1 ? selectedRegs[0].name : `${selectedRegs.length} regimenten`);
        setSelectionDetails(regSummary, tactical.state);
      } else {
        const workers = group.filter(u => u.type === 'worker').length;
        const inf = group.filter(u => u.type === 'infantry').length;
        const off = group.filter(u => u.type === 'officer').length;
        const drum = group.filter(u => u.type === 'drummer').length;
        setHudText(selectionTitleEl, group.length === 1 ? TYPES[group[0].type].label : `${group.length} eenheden`);
        setSelectionDetails(workers
          ? `${workers} boeren · rechtsklik op grondstof om te verzamelen`
          : `Losse troepen · musketiers ${inf} · officier ${off} · drummer ${drum}`);
      }
    } else {
      setHudText(selectionTitleEl, 'Niets geselecteerd');
      setSelectionDetails('Voor regiment: 12 musketiers + 1 officier + 1 drummer selecteren.');
    }

    renderDynamicActions(forceActions);
    updateActionVisuals();
  }