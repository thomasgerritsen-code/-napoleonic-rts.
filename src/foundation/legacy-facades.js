'use strict';
// Behaviour-neutral facades over the final v0.7.1 globals. New code should depend on
// these subsystem names; the implementations can then be replaced one domain at a time.
(function installLegacyFacades(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before legacy facades.');

  function invoke(name, ...args) {
    const fn = global[name];
    if (typeof fn !== 'function') throw new Error(`Legacy implementation unavailable: ${name}`);
    return fn(...args);
  }

  function register(name, api, responsibility) {
    if (nrts.subsystems.has(name)) return nrts.subsystems.get(name);
    return nrts.subsystems.register(name, Object.freeze(api), {
      phase: 'legacy-bridge',
      legacyBridge: true,
      responsibility
    });
  }

  register('movement', {
    moveUnit: (...args) => invoke('moveToward', ...args),
    orderBattalion: (...args) => invoke('orderGroupPathV06', ...args),
    terrainSpeed: (...args) => invoke('canonicalTerrainSpeedV071', ...args),
    desiredBattalionSpeed: (...args) => invoke('desiredGroupSpeedV064', ...args)
  }, 'authoritative movement bridge for loose units and battalion anchors');

  register('formation', {
    arrangeBattalion: (...args) => invoke('arrangeRegiment', ...args),
    applySelected: (...args) => invoke('applyFormationNow', ...args),
    createBattalion: (...args) => invoke('createRegiment', ...args),
    members: (...args) => invoke('regimentMembers', ...args)
  }, 'formation geometry, membership and selected-formation commands');

  register('navigation', {
    roadAt: (...args) => invoke('roadNetworkAtV066', ...args),
    crossingAt: (...args) => invoke('crossingAtV067', ...args),
    orderBattalionPath: (...args) => invoke('orderGroupPathV06', ...args)
  }, 'route, road and crossing classification bridge');

  register('ai-production', {
    develop: (...args) => invoke('aiDevelop', ...args),
    build: (...args) => invoke('aiBuild', ...args),
    queue: (...args) => invoke('aiQueue', ...args),
    formBattalion: (...args) => invoke('aiTryFormRegiment', ...args)
  }, 'British economy, production and army replenishment bridge');

  register('ai-tactics', {
    issueMilitaryOrder: (...args) => invoke('aiMilitaryOrder', ...args)
  }, 'British tactical order bridge, independent from production');

  register('combat', {
    applyDamage: (...args) => invoke('applyDamage', ...args),
    fire: (...args) => invoke('fire', ...args),
    routeUnit: (...args) => invoke('routeUnit', ...args)
  }, 'damage, firing, morale consequence and routing bridge');

  register('simulation', {
    step: (...args) => global.RTS_SIM?.step(...args),
    snapshot: (...args) => global.RTS_SIM?.snapshot(...args),
    audit: (...args) => global.RTS_SIM?.audit(...args),
    metrics: (...args) => global.RTS_SIM?.getMetrics(...args),
    reset: (...args) => invoke('resetGame', ...args)
  }, 'stable simulation and deterministic test facade');

  nrts.events.emit('legacy-facades:ready', {
    subsystems: ['movement', 'formation', 'navigation', 'ai-production', 'ai-tactics', 'combat', 'simulation']
  });
})(window);
const fogScoutingScript=document.createElement('script');fogScoutingScript.src='src/systems/visibility/fog-scouting.js?build=fs1';fogScoutingScript.async=false;document.body.appendChild(fogScoutingScript);
const moraleCommandScript=document.createElement('script');moraleCommandScript.src='src/systems/morale/command-morale.js?build=mc2';moraleCommandScript.async=false;document.body.appendChild(moraleCommandScript);
