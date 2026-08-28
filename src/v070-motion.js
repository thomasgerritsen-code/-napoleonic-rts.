'use strict';
// ---------- Napoleonic RTS v0.7.0: continuous battalion motion ----------
// v070.js originally added a second post-update kinematic pass that copied every
// infantry/cavalry member directly onto targetX/targetY.  That made formations
// look exact, but it bypassed speed, dt, terrain, turning and collision rules.
//
// This module deliberately calls the proven pre-snap v0.6.9 update captured by
// v070.js (`updateV069ForV070`) and audits the resulting continuous movement.
// v0.7 engagement, formation centering and order overrides still remain active,
// because those functions are resolved dynamically by the underlying update.

Object.assign(V070_STATS, {
  solver: 'continuous-dt',
  continuousFrames: 0,
  continuousMemberSamples: 0,
  teleportViolations: 0,
  maxMemberStep: 0,
  maxAllowedStep: 0,
  maxStepRatio: 0,
  maxSlotErrorObserved: 0
});

function trackedBattalionPositionsV070() {
  const before = new Map();
  for (const reg of regiments) {
    if (!reg || reg.destroyed || !['infantry','cavalry'].includes(groupKindV06(reg))) continue;
    for (const u of regimentMembers(reg)) {
      if (u.dead || u.routing) continue;
      before.set(u.id, { x:u.x, y:u.y, type:u.type });
    }
  }
  return before;
}

function allowedMemberStepV070(u, dt) {
  const base = Math.max(1, Number(TYPES[u.type]?.speed) || 1);
  // The normal solver may apply road/terrain speed, up to 42% catch-up and a
  // small overlap correction.  This ceiling is intentionally generous enough
  // for those legitimate effects, but far below a target-slot teleport.
  return Math.max(1.75, base * Math.max(0.001, dt) * 2.35 + 1.25);
}

function auditContinuousBattalionMotionV070(before, dt) {
  let samples = 0;
  let maxStep = 0;
  let maxAllowed = 0;
  let maxRatio = 0;
  let maxSlotError = 0;

  for (const reg of regiments) {
    if (!reg || reg.destroyed || !['infantry','cavalry'].includes(groupKindV06(reg))) continue;
    for (const u of regimentMembers(reg)) {
      if (u.dead || u.routing) continue;
      const prior = before.get(u.id);
      if (!prior) continue;

      const step = Math.hypot(u.x-prior.x, u.y-prior.y);
      const allowed = allowedMemberStepV070(u, dt);
      const ratio = step / Math.max(0.001, allowed);
      maxStep = Math.max(maxStep, step);
      maxAllowed = Math.max(maxAllowed, allowed);
      maxRatio = Math.max(maxRatio, ratio);
      samples++;

      if (step > allowed + 0.01) V070_STATS.teleportViolations++;
      if (Number.isFinite(u.targetX) && Number.isFinite(u.targetY)) {
        maxSlotError = Math.max(maxSlotError, Math.hypot(u.targetX-u.x, u.targetY-u.y));
      }
    }
  }

  V070_STATS.continuousFrames++;
  V070_STATS.kinematicFrames = V070_STATS.continuousFrames;
  V070_STATS.continuousMemberSamples += samples;
  V070_STATS.maxMemberStep = Math.max(V070_STATS.maxMemberStep, maxStep);
  V070_STATS.maxAllowedStep = Math.max(V070_STATS.maxAllowedStep, maxAllowed);
  V070_STATS.maxStepRatio = Math.max(V070_STATS.maxStepRatio, maxRatio);
  V070_STATS.maxSlotErrorObserved = Math.max(V070_STATS.maxSlotErrorObserved, maxSlotError);
  // Compatibility counter retained intentionally: a healthy continuous solver
  // must never need to snap a member.
  V070_STATS.snappedMembers = 0;
}

// Bypass only updateV070's enforceBattalionKinematicsV070() call.  The captured
// updateV069ForV070 is the complete simulation update immediately before that
// post-processing wrapper was installed.
update = function updateV070Continuous(dt) {
  const before = trackedBattalionPositionsV070();
  updateV069ForV070(dt);
  auditContinuousBattalionMotionV070(before, dt);
};

const resetGameV070BeforeContinuousMotion = resetGame;
resetGame = function resetGameV070ContinuousMotion() {
  resetGameV070BeforeContinuousMotion();
  V070_STATS.solver = 'continuous-dt';
  V070_STATS.continuousFrames = 0;
  V070_STATS.continuousMemberSamples = 0;
  V070_STATS.teleportViolations = 0;
  V070_STATS.maxMemberStep = 0;
  V070_STATS.maxAllowedStep = 0;
  V070_STATS.maxStepRatio = 0;
  V070_STATS.maxSlotErrorObserved = 0;
  V070_STATS.snappedMembers = 0;
  statusEl.textContent = 'v0.7.0: continue bataljonsbeweging — snelheid, bochten en formatie volgen dezelfde tijdstapsimulatie.';
};
