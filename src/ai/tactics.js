'use strict';
// ---------- AI tactics ----------
// Behaviour preserved from v0.7.1; isolated from economy/production so tactical
// attack cycles cannot own or stop the replenishment loop.

function aiMilitaryOrder() {
  const regs = activeRegiments('britain');
  const frenchTargets = livingUnits('france').filter(u => u.type !== 'worker' && !u.routing);
  const frenchTC = livingBuildings('france').find(b => b.type === 'towncenter');
  if (!regs.length) return;

  const attackReady = elapsed > 55 || regs.length >= 2;
  if (!attackReady) {
    aiPlan = 'eerste regiment verdedigt de basis';
    regs.forEach((reg, i) => {
      const tc = livingBuildings('britain').find(b => b.type === 'towncenter');
      if (tc) arrangeRegiment(reg, tc.x - 230, tc.y + (i - (regs.length - 1) / 2) * 120, 'line');
    });
    return;
  }

  const target = frenchTargets.length ? centroid(frenchTargets) : frenchTC ? { x: frenchTC.x, y: frenchTC.y } : { x: 650, y: 900 };
  regs.forEach((reg, i) => {
    const mode = i % 3 === 2 ? 'square' : i % 2 === 0 ? 'line' : 'column';
    arrangeRegiment(reg, target.x + 170 + i * 45, target.y + (i - (regs.length - 1) / 2) * 120, mode);
  });

  const cav = livingUnits('britain').filter(u => u.type === 'cavalry' && !u.routing);
  if (cav.length) {
    cav.forEach(u => u.chargeTimer = 7);
    commandLooseFormation(cav, target.x + 30, target.y - 150, 'column');
  }
  const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
  if (art.length) commandLooseFormation(art, target.x + 380, target.y + 150, 'line');
  aiPlan = `${regs.length} regiment${regs.length > 1 ? 'en' : ''} vallen aan`;
}
