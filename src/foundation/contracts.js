'use strict';
// Explicit gameplay state contracts for the Architecture v2 migration.
(function installFoundationContracts(global) {
  const BattalionState = Object.freeze({
    IDLE: 'IDLE',
    FORMING: 'FORMING',
    MOVING: 'MOVING',
    ROAD_MARCH: 'ROAD_MARCH',
    DEPLOYING: 'DEPLOYING',
    ENGAGING: 'ENGAGING',
    RETREATING: 'RETREATING',
    ROUTING: 'ROUTING'
  });

  const states = Object.values(BattalionState);
  const transitions = {
    IDLE: ['FORMING', 'MOVING', 'ROAD_MARCH', 'ENGAGING', 'RETREATING', 'ROUTING'],
    FORMING: ['IDLE', 'MOVING', 'ROAD_MARCH', 'DEPLOYING', 'ENGAGING', 'RETREATING', 'ROUTING'],
    MOVING: ['IDLE', 'FORMING', 'ROAD_MARCH', 'DEPLOYING', 'ENGAGING', 'RETREATING', 'ROUTING'],
    ROAD_MARCH: ['MOVING', 'DEPLOYING', 'ENGAGING', 'RETREATING', 'ROUTING'],
    DEPLOYING: ['IDLE', 'MOVING', 'FORMING', 'ENGAGING', 'RETREATING', 'ROUTING'],
    ENGAGING: ['IDLE', 'MOVING', 'DEPLOYING', 'RETREATING', 'ROUTING'],
    RETREATING: ['IDLE', 'MOVING', 'ROUTING'],
    ROUTING: ['RETREATING', 'IDLE']
  };

  global.NRTS?.states.define('battalion', { states, transitions });

  const contracts = Object.freeze({
    BattalionState,
    subsystemResponsibilities: Object.freeze({
      movement: 'Move battalion anchors only; never decide combat or production.',
      formation: 'Calculate slot geometry and convergence; never own pathfinding.',
      roads: 'Classify road occupancy and road modifiers; never move soldiers directly.',
      navigation: 'Produce routes/waypoints; never render or alter combat state.',
      combat: 'Resolve engagement, damage and morale consequences; never create AI production.',
      aiProduction: 'Create and queue units independently from tactical attack state.',
      aiTactics: 'Issue orders to existing forces; never own economic production loops.',
      rendering: 'Visualize simulation state only; never mutate authoritative gameplay state.'
    })
  });

  global.NRTS_CONTRACTS = contracts;
  global.NRTS?.subsystems.register('contracts', contracts, {
    phase: 'foundation',
    responsibility: 'state transitions and subsystem ownership boundaries'
  });
})(window);
