'use strict';
// ---------- v0.6.3 release fixes: robust drag-to-face + post-battle reinforcement priority ----------

// After a battle, do not let a long infantry replacement queue starve cavalry/artillery.
// Queue one missing heavy unit immediately, then return to the normal v0.6.3 doctrine.
const aiDevelopV063BeforeReleaseFix = aiDevelop;
aiDevelop = function aiDevelopV063ReleaseFix() {
  if (gameOver) return;
  recalcPopCap('britain');

  const targets = aiForceTargetsV063();
  const postBattleReplacement = aiWaveNumberV063 > 0 || elapsed > 180;
  const projectedPop = populationUsed('britain') + queuedPopulationV063('britain');
  const e = economies.britain;

  // Capacity always wins: otherwise the production building could sit forever at 99%.
  if (projectedPop >= e.popCap - 5 && e.wood >= BUILDINGS.house.cost.wood) {
    const unfinishedHouse = livingBuildings('britain').some(b => b.type === 'house' && !b.complete);
    if (!unfinishedHouse && aiBuild('house')) {
      aiPlan = 'nieuwe huisvesting voor versterkingen';
      return;
    }
  }

  if (postBattleReplacement) {
    const foundry = completeBuildingV063('britain', 'foundry');
    if (foundry && aiNeedsTypeV063('artillery', targets.artillery) && queuedTypeCountV063('artillery', 'britain') === 0) {
      if (aiQueue('artillery', 'foundry')) {
        aiPlan = `artillerieverlies aanvullen (${livingTypeCountV063('britain','artillery')}/${targets.artillery})`;
        return;
      }
    }

    const stable = completeBuildingV063('britain', 'stable');
    if (stable && aiNeedsTypeV063('cavalry', targets.cavalry) && queuedTypeCountV063('cavalry', 'britain') === 0) {
      if (aiQueue('cavalry', 'stable')) {
        aiPlan = `cavalerieverlies aanvullen (${livingTypeCountV063('britain','cavalry')}/${targets.cavalry})`;
        return;
      }
    }
  }

  aiDevelopV063BeforeReleaseFix();
};

// The older implementation listened only on the canvas. When a drag ended over a HUD element,
// or when Chromium emitted contextmenu at a different point in the mouse sequence, a plain
// right-click order could overwrite finalFacing. Handle the whole right-mouse gesture at window
// capture level and make mouse-up the single source of truth.
let rightDragInputV063 = null;

window.addEventListener('mousedown', e => {
  if (e.button !== 2 || e.target !== canvas || buildMode || rallyPlacementBuilding) return;
  rightDragInputV063 = {
    sx: e.clientX,
    sy: e.clientY,
    ex: e.clientX,
    ey: e.clientY,
    moved: false
  };
  suppressContextMenuUntil = performance.now() + 1600;
}, true);

window.addEventListener('mousemove', e => {
  if (!rightDragInputV063) return;
  rightDragInputV063.ex = e.clientX;
  rightDragInputV063.ey = e.clientY;
  if (Math.hypot(rightDragInputV063.ex - rightDragInputV063.sx, rightDragInputV063.ey - rightDragInputV063.sy) > 12) {
    rightDragInputV063.moved = true;
  }
  // Keep the existing preview renderer in sync even when the pointer crosses an overlay.
  if (rightDragV06) {
    rightDragV06.ex = e.clientX;
    rightDragV06.ey = e.clientY;
    rightDragV06.moved = rightDragInputV063.moved;
  }
}, true);

window.addEventListener('mouseup', e => {
  if (e.button !== 2 || !rightDragInputV063) return;
  const d = rightDragInputV063;
  rightDragInputV063 = null;
  rightDragV06 = null;
  suppressContextMenuUntil = performance.now() + 1000;

  e.preventDefault();
  e.stopImmediatePropagation();

  const destination = screenToWorld(d.sx, d.sy);
  if (d.moved) {
    const facePoint = screenToWorld(d.ex, d.ey);
    const angle = Math.atan2(facePoint.y - destination.y, facePoint.x - destination.x);
    issueMoveWithFacingV06(destination.x, destination.y, angle);
    statusEl.textContent = `Bataljon marcheert en ontplooit naar front ${Math.round((((angle * 180 / Math.PI) + 360) % 360))}°.`;
    return;
  }

  // Preserve the original simple right-click behavior, including worker gathering orders.
  const resource = resourceAt(destination.x, destination.y);
  if (resource && assignGather(resource)) return;
  issueMove(destination.x, destination.y);
}, true);

window.addEventListener('contextmenu', e => {
  if (e.target !== canvas && !rightDragInputV063) return;
  if (rightDragInputV063 || performance.now() < suppressContextMenuUntil) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);
