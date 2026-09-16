#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const [, , baselinePath, candidatePath] = process.argv;
if (!baselinePath || !candidatePath) {
  console.error('Usage: node scripts/compare-movement-contact-replay.js <baseline.json> <candidate.json>');
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));

const metrics = [
  ['routeCompletion', 'higher', 0.005],
  ['roadCorridorError', 'lower', 0.05],
  ['headingJitter', 'lower', 0.08],
  ['headingReversals', 'lower', 0.08],
  ['startStopCycles', 'lower', 0.08],
  ['velocityJerk', 'lower', 0.08],
  ['meanFormationDeviation', 'lower', 0.08],
  ['p95FormationDeviation', 'lower', 0.08],
  ['overlapPenetrationDuration', 'lower', 0.05],
  ['validRouteStationaryTime', 'lower', 0.05],
  ['deployOvershoot', 'lower', 0.08],
  ['timeToDeployFront', 'lower', 0.08],
  ['facingErrorFirstAttack', 'lower', 0.08],
  ['targetSwitchReengageCount', 'lower', 0.08],
  ['reformCohesionRecovery', 'lower', 0.08],
  ['maxStall', 'lower', 0.05],
  ['bridgeThroughput', 'higher', 0.05]
];

const get = (obj, key) => obj.metrics?.[key] ?? obj[key];
const rows = [];
let failed = false;

for (const [key, direction, tolerance] of metrics) {
  const b = Number(get(baseline, key));
  const c = Number(get(candidate, key));
  if (!Number.isFinite(b) || !Number.isFinite(c)) {
    rows.push({ metric: key, baseline: get(baseline, key), candidate: get(candidate, key), verdict: 'MISSING' });
    failed = true;
    continue;
  }
  const denom = Math.max(Math.abs(b), 1e-9);
  const relative = (c - b) / denom;
  const regression = direction === 'lower' ? relative > tolerance : relative < -tolerance;
  rows.push({ metric: key, baseline: b, candidate: c, deltaPct: +(relative * 100).toFixed(2), verdict: regression ? 'REGRESSION' : 'OK' });
  if (regression) failed = true;
}

if (baseline.seed != null && candidate.seed != null && baseline.seed !== candidate.seed) {
  console.error(`Seed mismatch: baseline=${baseline.seed}, candidate=${candidate.seed}`);
  failed = true;
}
if (baseline.ordersHash && candidate.ordersHash && baseline.ordersHash !== candidate.ordersHash) {
  console.error(`Orders mismatch: baseline=${baseline.ordersHash}, candidate=${candidate.ordersHash}`);
  failed = true;
}

console.table(rows);
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/movement-contact-comparison.json', JSON.stringify({ failed, baseline: baselinePath, candidate: candidatePath, rows }, null, 2));
if (failed) {
  console.error('MOVEMENT-CONTACT COMBINED REPLAY GATE: FAIL');
  process.exit(1);
}
console.log('MOVEMENT-CONTACT COMBINED REPLAY GATE: PASS');
