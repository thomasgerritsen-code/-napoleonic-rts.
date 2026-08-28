'use strict';
// ---------- HUD/actions ----------
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
    actionsEl.querySelectorAll('[data-formation]').forEach(btn => {
      const regs = selectedRegiments();
      const selectedMode = regs.length === 1 ? regs[0].formation : currentFormation;
      btn.classList.toggle('active', btn.dataset.formation === selectedMode);
    });
    actionsEl.querySelectorAll('[data-action^="build-"]').forEach(btn => btn.classList.toggle('active', btn.dataset.action === `build-${buildMode}`));
  }

  function selectionRegimentSummary() {
    const regs = selectedRegiments();
    if (regs.length === 1) {
      const reg = regs[0], members = regimentMembers(reg);
      const officerAlive = members.some(u => u.id === reg.officerId);
      const drummerAlive = members.some(u => u.id === reg.drummerId);
      return `${reg.name} · ${members.filter(u => u.type === 'infantry').length} musketiers · O:${officerAlive ? '✓' : '✗'} D:${drummerAlive ? '✓' : '✗'} · morale ${Math.round(reg.morale)}%`;
    }
    if (regs.length > 1) return `${regs.length} regimenten geselecteerd`;
    return null;
  }

  function updateHud(forceActions = false) {
    for (const u of [...selectedUnits]) if (u.dead) selectedUnits.delete(u);
    if (selectedBuilding?.dead) selectedBuilding = null;
    recalcPopCap('france'); recalcPopCap('britain');

    foodEl.textContent = Math.floor(economies.france.food);
    woodEl.textContent = Math.floor(economies.france.wood);
    populationEl.textContent = `${populationUsed('france')}/${economies.france.popCap}`;
    frenchCountEl.textContent = livingUnits('france').length;
    britishCountEl.textContent = livingUnits('britain').length;
    frenchRegimentsEl.textContent = activeRegiments('france').length;

    aiEconomyEl.textContent = `Economie: 🍞 ${Math.floor(economies.britain.food)} · 🪵 ${Math.floor(economies.britain.wood)} · 👥 ${populationUsed('britain')}/${economies.britain.popCap}`;
    aiBuildingsEl.textContent = `Gebouwen: ${livingBuildings('britain').filter(b => b.complete).length} compleet`;
    aiRegimentsEl.textContent = `Regimenten: ${activeRegiments('britain').length}`;
    aiPlanEl.textContent = `Plan: ${aiPlan}`;

    if (selectedBuilding) {
      const b = selectedBuilding;
      selectionTitleEl.textContent = BUILDINGS[b.type].label;
      if (!b.complete) selectionDetailsEl.textContent = `In aanbouw · ${Math.floor(b.construction * 100)}%`;
      else if (b.queue.length) selectionDetailsEl.textContent = `Productie: ${b.queue[0].label} · ${Math.floor(b.production * 100)}% · queue ${b.queue.length}`;
      else selectionDetailsEl.textContent = `${Math.max(0, Math.floor(b.hp))}/${b.maxHp} HP`;
    } else if (selectedUnits.size) {
      const group = [...selectedUnits];
      const regSummary = selectionRegimentSummary();
      if (regSummary) {
        selectionTitleEl.textContent = selectedRegiments().length === 1 ? selectedRegiments()[0].name : `${selectedRegiments().length} regimenten`;
        selectionDetailsEl.textContent = regSummary;
      } else {
        const workers = group.filter(u => u.type === 'worker').length;
        const inf = group.filter(u => u.type === 'infantry').length;
        const off = group.filter(u => u.type === 'officer').length;
        const drum = group.filter(u => u.type === 'drummer').length;
        selectionTitleEl.textContent = group.length === 1 ? TYPES[group[0].type].label : `${group.length} eenheden`;
        selectionDetailsEl.textContent = workers
          ? `${workers} boeren · rechtsklik op grondstof om te verzamelen`
          : `Losse troepen · musketiers ${inf} · officier ${off} · drummer ${drum}`;
      }
    } else {
      selectionTitleEl.textContent = 'Niets geselecteerd';
      selectionDetailsEl.textContent = 'Voor regiment: 12 musketiers + 1 officier + 1 drummer selecteren.';
    }

    renderDynamicActions(forceActions);
    updateActionVisuals();
  }
