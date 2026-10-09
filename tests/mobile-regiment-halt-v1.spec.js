const { test, expect } = require('@playwright/test');

async function bootMobile(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__RTS_DEBUG__);
}

function groupCenter(group) {
  const live = group.members.filter(member => !member.dead && !member.routing);
  return {
    x: live.reduce((sum, member) => sum + member.x, 0) / live.length,
    y: live.reduce((sum, member) => sum + member.y, 0) / live.length
  };
}

test('mobile Halt stops a marching regiment and preserves selection for a new order', async ({ page }) => {
  await bootMobile(page);

  const setup = await page.evaluate(() => {
    const id = window.__RTS_DEBUG__.createRegimentDirect('france');
    window.__RTS_DEBUG__.selectRegiment(id);
    const group = window.RTS_SIM.snapshot().groups.find(candidate => candidate.id === id);
    const center = {
      x: group.members.reduce((sum, member) => sum + member.x, 0) / group.members.length,
      y: group.members.reduce((sum, member) => sum + member.y, 0) / group.members.length
    };
    window.RTS_SIM.dispatch({ type: 'move', x: center.x + 520, y: center.y });
    window.RTS_SIM.step(1.5);
    return { id, formation: group.formation };
  });

  const halt = page.locator('#actions [data-action="halt"]');
  await expect(halt).toBeVisible();
  await expect(halt).toBeEnabled();
  await halt.tap();

  const stopped = await page.evaluate(id => {
    const snap = window.RTS_SIM.snapshot();
    const group = snap.groups.find(candidate => candidate.id === id);
    return { group, selection: snap.selection.unitIds };
  }, setup.id);
  const stoppedCenter = groupCenter(stopped.group);
  const stoppedIds = stopped.group.members.map(member => member.id).sort((a, b) => a - b);
  expect(stopped.group.formation).toBe(setup.formation);
  expect(stopped.group.pathLength).toBe(0);
  expect(stopped.group.movementPhase).toBe('halted');
  expect([...stopped.selection].sort((a, b) => a - b)).toEqual(stoppedIds);
  expect(Math.max(...stopped.group.members.map(member => Math.hypot(member.targetX - member.x, member.targetY - member.y)))).toBeLessThan(2);

  await page.evaluate(() => window.RTS_SIM.step(2));
  const settled = await page.evaluate(id => window.RTS_SIM.snapshot().groups.find(group => group.id === id), setup.id);
  const settledCenter = groupCenter(settled);
  expect(Math.hypot(settledCenter.x - stoppedCenter.x, settledCenter.y - stoppedCenter.y)).toBeLessThan(8);

  await page.evaluate(({ id, x, y }) => {
    window.RTS_SIM.dispatch({ type: 'select-group', id });
    window.RTS_SIM.dispatch({ type: 'move', x: x + 260, y });
    window.RTS_SIM.step(4);
  }, { id: setup.id, x: settledCenter.x, y: settledCenter.y });

  const resumed = await page.evaluate(id => {
    const snap = window.RTS_SIM.snapshot();
    return {
      group: snap.groups.find(candidate => candidate.id === id),
      selection: snap.selection.unitIds
    };
  }, setup.id);
  const resumedCenter = groupCenter(resumed.group);
  expect(Math.hypot(resumedCenter.x - settledCenter.x, resumedCenter.y - settledCenter.y)).toBeGreaterThan(15);
  expect([...resumed.selection].sort((a, b) => a - b)).toEqual(stoppedIds);
});
