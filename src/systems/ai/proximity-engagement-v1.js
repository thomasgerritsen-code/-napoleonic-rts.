'use strict';
// ---------- local enemy-contact response ----------
(function installAiProximityEngagementV1(global) {
  if (global.__AI_PROXIMITY_ENGAGEMENT_V1__) return;
  if (typeof aiCommanderMilitaryOrderV1 !== 'function' || typeof aiOrderReg !== 'function') return;

  const CONTACT_ENTER_RADIUS = 430;
  const CONTACT_EXIT_RADIUS = 520;
  const MUSKET_STANDOFF = 108;
  const ARTILLERY_STANDOFF = 280;
  const COLUMN_TO_LINE_DISTANCE = 260;
  const PROXIMITY_SCAN_INTERVAL = 1.0;
  const REORDER_DISTANCE = 45;
  const regimentContacts = new Map();
  const looseContacts = new Map();
  const baseCommanderMilitaryOrder = aiCommanderMilitaryOrderV1;
  const baseUpdate = typeof update === 'function' ? update : null;
  let proximityClock = 0;

  function distance(a, b) {
    return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
  }

  function enemyCandidates() {
    const result = [];
    const claimedUnits = new Set();

    for (const reg of activeRegiments('france')) {
      const members = regimentMembers(reg).filter(unit => !unit.dead && !unit.routing);
      if (!members.length) continue;
      members.forEach(unit => claimedUnits.add(unit.id));
      const center = centroid(members);
      result.push({
        key: `regiment:${reg.id}`,
        kind: 'regiment',
        id: reg.id,
        x: center.x,
        y: center.y,
        type: 'regiment'
      });
    }

    for (const unit of livingUnits('france')) {
      if (unit.routing || unit.type === 'worker' || claimedUnits.has(unit.id)) continue;
      result.push({
        key: `unit:${unit.id}`,
        kind: 'unit',
        id: unit.id,
        x: unit.x,
        y: unit.y,
        type: unit.type
      });
    }
    return result;
  }

  function looseBritishCombatUnits() {
    return livingUnits('britain').filter(unit =>
      !unit.routing && !unit.regimentId &&
      ['infantry', 'officer', 'cavalry', 'artillery'].includes(unit.type)
    );
  }

  function contactForPoint(contactMap, responderId, point, candidates) {
    const retainedKey = contactMap.get(responderId);
    if (retainedKey) {
      const retained = candidates.find(candidate => candidate.key === retainedKey);
      if (retained) {
        const retainedDistance = distance(point, retained);
        if (retainedDistance <= CONTACT_EXIT_RADIUS) {
          return { ...retained, distance: retainedDistance };
        }
      }
      contactMap.delete(responderId);
    }

    let nearest = null;
    for (const candidate of candidates) {
      const d = distance(point, candidate);
      if (!nearest || d < nearest.distance) nearest = { ...candidate, distance: d };
    }
    if (!nearest || nearest.distance > CONTACT_ENTER_RADIUS) return null;
    contactMap.set(responderId, nearest.key);
    return nearest;
  }

  function contactForRegiment(reg, candidates) {
    if (!reg || reg.destroyed) return null;
    return contactForPoint(regimentContacts, reg.id, aiRegCenter(reg), candidates);
  }

  function clearStaleContacts(contactMap, activeIds) {
    for (const id of contactMap.keys()) {
      if (!activeIds.has(id)) contactMap.delete(id);
    }
  }

  function regimentStrategicOrder(reg, center) {
    return {
      x: Number.isFinite(reg.targetX) ? reg.targetX : center.x,
      y: Number.isFinite(reg.targetY) ? reg.targetY : center.y,
      formation: reg.formation || 'line',
      facing: Number.isFinite(reg.facing) ? reg.facing : -Math.PI / 2
    };
  }

  function orderRegimentTowardContact(reg, contact, captureStrategic) {
    const center = aiRegCenter(reg);
    const prior = reg.proximityEngagementV1 || null;
    const resumeOrder = captureStrategic || !prior
      ? regimentStrategicOrder(reg, center)
      : prior.resumeOrder;
    const direction = aiDirection(center, contact);
    const formation = contact.distance > COLUMN_TO_LINE_DISTANCE ? 'column' : 'line';
    const target = contact.distance > MUSKET_STANDOFF + 12
      ? aiOffset(contact, direction, -MUSKET_STANDOFF)
      : center;
    const targetChanged = !prior || prior.targetKey !== contact.key ||
      distance({ x: reg.targetX, y: reg.targetY }, target) > REORDER_DISTANCE;
    const formationChanged = !prior || prior.formation !== formation;

    if (targetChanged || formationChanged || captureStrategic) {
      aiOrderReg(reg, target, formation, direction.angle);
    }
    reg.proximityEngagementV1 = {
      targetKey: contact.key,
      targetKind: contact.kind,
      targetId: contact.id,
      distance: Math.round(contact.distance),
      formation,
      resumeOrder
    };
  }

  function releaseRegimentContact(reg) {
    const prior = reg.proximityEngagementV1;
    if (!prior) return;
    const resume = prior.resumeOrder;
    delete reg.proximityEngagementV1;
    if (resume) aiOrderReg(reg, { x: resume.x, y: resume.y }, resume.formation, resume.facing);
  }

  function looseStandoff(unit) {
    if (unit.type === 'artillery') return ARTILLERY_STANDOFF;
    if (unit.type === 'cavalry') return 16;
    if (unit.type === 'officer') return 80;
    return MUSKET_STANDOFF;
  }

  function looseStrategicOrder(unit) {
    return {
      x: Number.isFinite(unit.targetX) ? unit.targetX : unit.x,
      y: Number.isFinite(unit.targetY) ? unit.targetY : unit.y,
      facing: Number.isFinite(unit.facing) ? unit.facing : Math.PI
    };
  }

  function orderLooseUnitTowardContact(unit, contact, captureStrategic) {
    const prior = unit.proximityEngagementV1 || null;
    const resumeOrder = captureStrategic || !prior ? looseStrategicOrder(unit) : prior.resumeOrder;
    const direction = aiDirection(unit, contact);
    const standoff = looseStandoff(unit);
    const target = contact.distance > standoff + 8
      ? aiOffset(contact, direction, -standoff)
      : { x: unit.x, y: unit.y };
    const targetChanged = !prior || prior.targetKey !== contact.key ||
      distance({ x: unit.targetX, y: unit.targetY }, target) > REORDER_DISTANCE;

    if (targetChanged || captureStrategic) {
      unit.targetX = Math.max(20, Math.min(WORLD.width - 20, target.x));
      unit.targetY = Math.max(20, Math.min(WORLD.height - 20, target.y));
      unit.task = null;
      unit.resourceTarget = null;
    }
    unit.facing = direction.angle;
    unit.proximityEngagementV1 = {
      targetKey: contact.key,
      targetKind: contact.kind,
      targetId: contact.id,
      distance: Math.round(contact.distance),
      standoff,
      resumeOrder
    };
  }

  function releaseLooseContact(unit) {
    const prior = unit.proximityEngagementV1;
    if (!prior) return;
    const resume = prior.resumeOrder;
    delete unit.proximityEngagementV1;
    if (!resume) return;
    unit.targetX = resume.x;
    unit.targetY = resume.y;
    unit.facing = resume.facing;
  }

  function clearResponseState(regs, loose, restoreOrders = true) {
    regimentContacts.clear();
    looseContacts.clear();
    regs.forEach(reg => restoreOrders ? releaseRegimentContact(reg) : delete reg.proximityEngagementV1);
    loose.forEach(unit => restoreOrders ? releaseLooseContact(unit) : delete unit.proximityEngagementV1);
    AI_COMMANDER_V1.localContacts = 0;
    AI_COMMANDER_V1.localRegimentContacts = 0;
    AI_COMMANDER_V1.localLooseContacts = 0;
  }

  function applyLocalContactResponse(options = {}) {
    const captureStrategic = Boolean(options.captureStrategic);
    const regs = aiRegs();
    const loose = looseBritishCombatUnits();
    clearStaleContacts(regimentContacts, new Set(regs.map(reg => reg.id)));
    clearStaleContacts(looseContacts, new Set(loose.map(unit => unit.id)));

    if (AI_COMMANDER_V1.state === 'RETREAT') {
      clearResponseState(regs, loose, !captureStrategic);
      return 0;
    }

    const candidates = enemyCandidates();
    let engagedRegiments = 0;
    let engagedLoose = 0;
    let nearestDistance = Infinity;

    for (const reg of regs) {
      const contact = contactForRegiment(reg, candidates);
      if (!contact) {
        if (!captureStrategic) releaseRegimentContact(reg);
        else delete reg.proximityEngagementV1;
        continue;
      }
      orderRegimentTowardContact(reg, contact, captureStrategic);
      engagedRegiments++;
      nearestDistance = Math.min(nearestDistance, contact.distance);
    }

    for (const unit of loose) {
      const contact = contactForPoint(looseContacts, unit.id, unit, candidates);
      if (!contact) {
        if (!captureStrategic) releaseLooseContact(unit);
        else delete unit.proximityEngagementV1;
        continue;
      }
      orderLooseUnitTowardContact(unit, contact, captureStrategic);
      engagedLoose++;
      nearestDistance = Math.min(nearestDistance, contact.distance);
    }

    const engaged = engagedRegiments + engagedLoose;
    AI_COMMANDER_V1.localContacts = engaged;
    AI_COMMANDER_V1.localRegimentContacts = engagedRegiments;
    AI_COMMANDER_V1.localLooseContacts = engagedLoose;
    if (engaged) {
      const parts = [];
      if (engagedRegiments) parts.push(`${engagedRegiments} regiment${engagedRegiments === 1 ? '' : 'en'}`);
      if (engagedLoose) parts.push(engagedLoose === 1 ? '1 losse eenheid' : `${engagedLoose} losse eenheden`);
      aiPlan = `Commandant: lokaal contact · ${parts.join(' + ')} reageert · dichtstbij ${Math.round(nearestDistance)}m`;
    }
    return engaged;
  }

  aiCommanderMilitaryOrderV1 = function aiCommanderMilitaryOrderWithProximityV1() {
    const result = baseCommanderMilitaryOrder();
    applyLocalContactResponse({ captureStrategic: true });
    return result;
  };

  if (baseUpdate) {
    update = function updateWithProximityEngagementV1(dt) {
      const result = baseUpdate(dt);
      if (!gameOver) {
        proximityClock += Math.max(0, Number(dt) || 0);
        if (proximityClock >= PROXIMITY_SCAN_INTERVAL) {
          proximityClock %= PROXIMITY_SCAN_INTERVAL;
          applyLocalContactResponse();
        }
      }
      return result;
    };
  }

  const api = Object.freeze({
    version: 'ai-proximity-engagement-v1.2',
    config: Object.freeze({
      contactEnterRadius: CONTACT_ENTER_RADIUS,
      contactExitRadius: CONTACT_EXIT_RADIUS,
      musketStandoff: MUSKET_STANDOFF,
      artilleryStandoff: ARTILLERY_STANDOFF,
      columnToLineDistance: COLUMN_TO_LINE_DISTANCE,
      scanInterval: PROXIMITY_SCAN_INTERVAL
    }),
    apply: applyLocalContactResponse,
    state() {
      const regs = aiRegs();
      const candidates = enemyCandidates();
      return regs.map(reg => {
        const center = aiRegCenter(reg);
        const activeKey = regimentContacts.get(reg.id) || null;
        const target = activeKey ? candidates.find(candidate => candidate.key === activeKey) : null;
        return {
          regimentId: reg.id,
          targetKey: activeKey,
          distance: target ? Math.round(distance(center, target)) : null,
          formation: reg.proximityEngagementV1?.formation || null
        };
      });
    },
    looseState() {
      const loose = looseBritishCombatUnits();
      const candidates = enemyCandidates();
      return loose.map(unit => {
        const activeKey = looseContacts.get(unit.id) || null;
        const target = activeKey ? candidates.find(candidate => candidate.key === activeKey) : null;
        return {
          unitId: unit.id,
          type: unit.type,
          targetKey: activeKey,
          distance: target ? Math.round(distance(unit, target)) : null,
          standoff: unit.proximityEngagementV1?.standoff || null
        };
      });
    }
  });

  global.__AI_PROXIMITY_ENGAGEMENT_V1__ = api;
  global.NRTS?.subsystems.register('ai-proximity-engagement', api, {
    phase: 'architecture-v2',
    legacyBridge: false,
    responsibility: 'responsive local British troop reaction when French combat troops enter contact radius'
  });
})(window);
