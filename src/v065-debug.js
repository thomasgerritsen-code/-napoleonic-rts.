'use strict';
// ---------- v0.6.5 test/debug hooks ----------
if (window.__RTS_DEBUG__?.formationState) {
  const formationStateV064ForV065 = window.__RTS_DEBUG__.formationState;
  window.__RTS_DEBUG__.formationState = function formationStateV065(id) {
    const base = formationStateV064ForV065(id);
    if (!base) return null;
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    const plan = reg?.marchV063?.routePlanV065 || reg?.routePlanV065 || reg?.path?.v065Plan || null;
    const path = reg?.path || [];
    const roadWaypoints = path.filter(p => roadAtV064(p.x, p.y)).length;
    return {
      ...base,
      routeChoice: plan?.choice || null,
      routeReason: plan?.reason || null,
      routeRoadShare: Number.isFinite(plan?.roadShare) ? plan.roadShare : 0,
      routeDetourRatio: Number.isFinite(plan?.detourRatio) ? plan.detourRatio : null,
      estimatedDirectTime: Number.isFinite(plan?.directTime) ? plan.directTime : null,
      estimatedRoadTime: Number.isFinite(plan?.roadTime) ? plan.roadTime : null,
      estimatedChosenTime: Number.isFinite(plan?.chosenTime) ? plan.chosenTime : null,
      roadWaypoints
    };
  };

  window.__RTS_DEBUG__.movementSpeedsV065 = function movementSpeedsV065(kind = 'infantry') {
    return { ...groupTravelSpeedsV065(kind) };
  };
}
