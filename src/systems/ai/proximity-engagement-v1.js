'use strict';
// ---------- local enemy-contact response ----------
(function installAiProximityEngagementV1(global) {
  if (global.__AI_PROXIMITY_ENGAGEMENT_V1__) return;
  if (typeof aiCommanderMilitaryOrderV1 !== 'function' || typeof aiOrderReg !== 'function') return;

  const CONTACT_ENTER_RADIUS = 430;
  const CONTACT_EXIT_RADIUS = 520;
  const MUSKET_STANDOFF = 108;
  const COLUMN_TO_LINE_DISTANCE = 260;
  const contacts = new Map();
  const baseCommanderMilitaryOrder = aiCommanderMilitaryOrderV1;

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

  function contactForRegiment(reg, candidates = enemyCandidates()) {
    if (!reg || reg.destroyed) return null;
    const center = aiRegCenter(reg);
    const retainedKey = contacts.get(reg.id);
    if (retainedKey) {
      const retained = candidates.find(candidate => candidate.key === retainedKey);
      if (retained) {
        const retainedDistance = distance(center, retained);
        if (retainedDistance <= CONTACT_EXIT_RADIUS) {
          return { ...retained, distance: retainedDistance };
        }
      }
      contacts.delete(reg.id);
    }

    let nearest = null;
    for (const candidate of candidates) {
      const d = distance(center, candidate);
      if (!nearest || d < nearest.distance) nearest = { ...candidate, distance: d };
    }
    if (!nearest || nearest.distance > CONTACT_ENTER_RADIUS) return null;
    contacts.set(reg.id, nearest.key);
    return nearest;
  }

  function clearStaleContacts(activeIds) {
    for (const regimentId of contacts.keys()) {
      if (!activeIds.has(regimentId)) contacts.delete(regimentId);
    }
  }

  function orderRegimentTowardContact(reg, contact) {
    const center = aiRegCenter(reg);
    const direction = aiDirection(center, contact);
    const formation = contact.distance > COLUMN_TO_LINE_DISTANCE ? 'column' : 'line';
    const target = contact.distance > MUSKET_STANDOFF + 12
      ? aiOffset(contact, direction, -MUSKET_STANDOFF)
      : center;

    aiOrderReg(reg, target, formation, direction.angle);
    reg.proximityEngagementV1 = {
      targetKey: contact.key,
      targetKind: contact.kind,
      targetId: contact.id,
      distance: Math.round(contact.distance),
      formation
    };
  }

  function applyLocalContactResponse() {
    const regs = aiRegs();
    const activeIds = new Set(regs.map(reg => reg.id));
    clearStaleContacts(activeIds);

    if (AI_COMMANDER_V1.state === 'RETREAT') {
      contacts.clear();
      regs.forEach(reg => { delete reg.proximityEngagementV1; });
      AI_COMMANDER_V1.localContacts = 0;
      return 0;
    }

    const candidates = enemyCandidates();
    let engaged = 0;
    let nearestDistance = Infinity;

    for (const reg of regs) {
      const contact = contactForRegiment(reg, candidates);
      if (!contact) {
        delete reg.proximityEngagementV1;
        continue;
      }
      orderRegimentTowardContact(reg, contact);
      engaged++;
      nearestDistance = Math.min(nearestDistance, contact.distance);
    }

    AI_COMMANDER_V1.localContacts = engaged;
    if (engaged) {
      aiPlan = `Commandant: lokaal contact · ${engaged} regiment${engaged === 1 ? '' : 'en'} reageert · dichtstbij ${Math.round(nearestDistance)}m`;
    }
    return engaged;
  }

  aiCommanderMilitaryOrderV1 = function aiCommanderMilitaryOrderWithProximityV1() {
    const result = baseCommanderMilitaryOrder();
    applyLocalContactResponse();
    return result;
  };

  const api = Object.freeze({
    version: 'ai-proximity-engagement-v1',
    config: Object.freeze({
      contactEnterRadius: CONTACT_ENTER_RADIUS,
      contactExitRadius: CONTACT_EXIT_RADIUS,
      musketStandoff: MUSKET_STANDOFF,
      columnToLineDistance: COLUMN_TO_LINE_DISTANCE
    }),
    apply: applyLocalContactResponse,
    state() {
      const regs = aiRegs();
      const candidates = enemyCandidates();
      return regs.map(reg => {
        const center = aiRegCenter(reg);
        const activeKey = contacts.get(reg.id) || null;
        const target = activeKey ? candidates.find(candidate => candidate.key === activeKey) : null;
        return {
          regimentId: reg.id,
          targetKey: activeKey,
          distance: target ? Math.round(distance(center, target)) : null,
          formation: reg.proximityEngagementV1?.formation || null
        };
      });
    }
  });

  global.__AI_PROXIMITY_ENGAGEMENT_V1__ = api;
  global.NRTS?.subsystems.register('ai-proximity-engagement', api, {
    phase: 'architecture-v2',
    legacyBridge: false,
    responsibility: 'local British regiment reaction when French combat troops enter contact radius'
  });
})(window);
