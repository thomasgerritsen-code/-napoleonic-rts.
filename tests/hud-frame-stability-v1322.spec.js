const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const hudSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'hud.js'), 'utf8');

test('HUD avoids redundant text DOM writes in the hot update path', async () => {
  expect(hudSource).toContain('function setHudText(el, text)');
  expect(hudSource).toContain("if (el.textContent !== next) el.textContent = next;");
  expect(hudSource).toContain('setHudText(foodEl');
  expect(hudSource).toContain('setHudText(aiPlanEl');
  expect(hudSource).toContain('setHudText(selectionTitleEl');
});

test('formation action visuals resolve selected regiments once per refresh', async () => {
  const match = hudSource.match(/function updateActionVisuals\(\) \{([\s\S]*?)\n  \}/);
  expect(match).not.toBeNull();
  const body = match[1];
  expect((body.match(/selectedRegiments\(\)/g) || []).length).toBe(1);
  expect(body).toContain('const selectedMode = regs.length === 1');
});

test('HUD update reuses frame snapshots and selection summary input', async () => {
  expect(hudSource).toContain("const frenchLiving = livingUnits('france');");
  expect(hudSource).toContain("const britishLiving = livingUnits('britain');");
  expect(hudSource).toContain("const frenchRegs = activeRegiments('france');");
  expect(hudSource).toContain("const britishRegs = activeRegiments('britain');");
  expect(hudSource).toContain('const selectedRegs = selectedRegiments();');
  expect(hudSource).toContain('selectionRegimentSummary(selectedRegs)');
});
