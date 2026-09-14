'use strict';

// Late authority bridge for v146 regiment facing.
// regiments.js loads before a number of legacy movement layers; some of those layers
// still replace the historic global movement functions. Rebind the public command
// surface after all legacy scripts have loaded so the tested v146 behaviour is also
// the behaviour used by input, AI helpers and debug tooling.
(() => {
  if (typeof window.arrangeFacingRegimentV146 !== 'function') return;

  const normalizeFacingV146 = angle => {
    if (!Number.isFinite(angle)) return -Math.PI / 2;
    let result = angle;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result <= -Math.PI) result += Math.PI * 2;
    return result;
  };

  const regimentMoveSpacingV146 = reg => {
    const mode = reg?.formation || 'line';
    if (mode === 'line') return 340;
    if (mode === 'square') return 190;
    return 150;
  };

  const selectedRegimentsV146 = () => {
    if (typeof window.selectedRegiments === 'function') return window.selectedRegiments();
    const ids = [...new Set([...selectedUnits].map(u => u.regimentId).filter(Boolean))];
    return ids.map(getRegiment).filter(Boolean);
  };

  const issueMoveV146 = (x, y) => {
    const regs = selectedRegimentsV146();
    const regimentMemberIds = new Set();
    regs.forEach(reg => regimentMembers(reg).forEach(u => regimentMemberIds.add(u.id)));

    if (regs.length) {
      const groupCenter = centroid(regs.flatMap(regimentMembers));
      const dx = x - groupCenter.x;
      const dy = y - groupCenter.y;
      const facing = Math.hypot(dx, dy) > 2
        ? Math.atan2(dy, dx)
        : normalizeFacingV146(regs[0].facing ?? -Math.PI / 2);
      const perpX = -Math.sin(facing);
      const perpY = Math.cos(facing);
      const spacing = Math.max(...regs.map(regimentMoveSpacingV146));

      regs.forEach((reg, index) => {
        const lateral = (index - (regs.length - 1) / 2) * spacing;
        window.arrangeFacingRegimentV146(
          reg,
          x + perpX * lateral,
          y + perpY * lateral,
          reg.formation,
          facing
        );
      });
    }

    const loose = [...selectedUnits].filter(u => !u.dead && !u.routing && !regimentMemberIds.has(u.id));
    if (loose.length && typeof window.commandLooseFormation === 'function') {
      window.commandLooseFormation(loose, x, y, currentFormation);
    }

    if (regs.length || loose.length) {
      statusEl.textContent = regs.length
        ? `${regs.length} regiment${regs.length > 1 ? 'en' : ''} marcheert richting doel in ${formationLabel(regs[0].formation).toLowerCase()}.`
        : `${loose.length} losse eenheden verplaatsen.`;
    }
  };

  const applyFormationNowV146 = mode => {
    currentFormation = mode;
    const regs = selectedRegimentsV146();
    if (regs.length) {
      for (const reg of regs) {
        const c = centroid(regimentMembers(reg));
        window.arrangeFacingRegimentV146(reg, c.x, c.y, mode, reg.facing);
      }
      statusEl.textContent = `${formationLabel(mode)} toegepast op ${regs.length} regiment${regs.length > 1 ? 'en' : ''}.`;
    } else {
      const group = [...selectedUnits].filter(u => !u.dead && !u.routing);
      if (group.length && typeof window.commandLooseFormation === 'function') {
        window.commandLooseFormation(group, centroid(group).x, centroid(group).y, mode);
      }
      statusEl.textContent = group.length
        ? `${formationLabel(mode)} toegepast op losse troepen.`
        : `Formatie ingesteld op ${formationLabel(mode)}.`;
    }
    if (typeof window.updateHud === 'function') window.updateHud();
  };

  window.arrangeRegiment = window.arrangeFacingRegimentV146;
  window.issueMove = issueMoveV146;
  window.applyFormationNow = applyFormationNowV146;
  window.__RTS_FORMATION_FACING_V146__ = Object.freeze({
    active: true,
    issueMove: issueMoveV146,
    applyFormationNow: applyFormationNowV146,
    arrangeRegiment: window.arrangeFacingRegimentV146
  });
})();
