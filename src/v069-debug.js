'use strict';
// ---------- v0.6.9 debug hooks ----------
if (window.__RTS_DEBUG__) {
  const formationStateV068ForV069 = window.__RTS_DEBUG__.formationState?.bind(window.__RTS_DEBUG__);
  if (formationStateV068ForV069) {
    window.__RTS_DEBUG__.formationState = function formationStateV069(id) {
      const base = formationStateV068ForV069(id);
      if (!base) return null;
      const reg = getRegiment(id) || regiments.find(r => r.id === id);
      const engagement = reg?.engagementV069;
      return {
        ...base,
        engagement:engagement ? {...engagement} : null,
        combatFormation:reg?.marchV063?.locomotionV064 === 'combat-formation'
      };
    };
  }

  window.__RTS_DEBUG__.motionStatsV069 = () => ({...V069_MOTION_STATS});

  window.__RTS_DEBUG__.roadRetargetAuditV069 = id => {
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    if (!reg) return null;
    const anchor = groupAnchorV068(reg) || {x:reg.targetX,y:reg.targetY};
    const goal = reg.finalTarget || {x:reg.targetX,y:reg.targetY};
    const first = reg.path?.[reg.pathIndex || 0] || goal;
    const gx = goal.x - anchor.x, gy = goal.y - anchor.y;
    const gl = Math.hypot(gx,gy) || 1;
    const fx = first.x - anchor.x, fy = first.y - anchor.y;
    return {
      anchor:{...anchor},
      goal:{...goal},
      first:{...first},
      firstForward:(fx * gx + fy * gy) / gl,
      sameRoadReason:reg.routePlanV065?.reason === 'same-road-direct',
      roadRetargetFixes:V069_MOTION_STATS.roadRetargetFixes
    };
  };

  window.__RTS_DEBUG__.drummerRoleV069 = id => {
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    if (!reg || groupKindV06(reg) !== 'infantry') return null;
    const members = regimentMembers(reg);
    const drummer = members.find(u => u.id === reg.drummerId);
    const infantry = members.filter(u => u.type === 'infantry');
    if (!drummer || !infantry.length) return null;
    const column = marchColumnOffsetsV063(reg);
    const field = finalFormationOffsetsV063(reg, reg.formation);
    const rear = offsets => Math.min(...infantry.map(u => offsets.get(u.id)?.ox ?? 0));
    const colDrum = column.get(drummer.id), fieldDrum = field.get(drummer.id);
    const anchor = groupAnchorV068(reg) || centroid(members);
    const facing = reg.marchV063?.marchFacing ?? reg.facing ?? 0;
    const cos = Math.cos(facing), sin = Math.sin(facing);
    const dx = drummer.x - anchor.x, dy = drummer.y - anchor.y;
    return {
      drummerId:drummer.id,
      attackMode:drummer.attackMode,
      column:{ drummer:{...colDrum}, infantryRearX:rear(column), behind:colDrum.ox < rear(column) },
      field:{ drummer:{...fieldDrum}, infantryRearX:rear(field), behind:reg.formation === 'square' ? true : fieldDrum.ox < rear(field) },
      actualLocal:{ ox:dx*cos+dy*sin, oy:-dx*sin+dy*cos },
      alive:!drummer.dead
    };
  };

  window.__RTS_DEBUG__.setRegimentBayonetV069 = id => {
    const reg = getRegiment(id);
    if (!reg) return false;
    for (const u of regimentMembers(reg)) {
      if (u.type === 'infantry' || u.type === 'officer') {
        u.attackMode = 'bayonet';
        u.chargeTimer = Math.max(u.chargeTimer || 0, 6);
      }
    }
    return true;
  };

  window.__RTS_DEBUG__.villageSystemV069 = () => ({
    labelsVisible:false,
    villages:VILLAGE_SCENERY_V069.map(v => ({
      name:v.name,
      x:v.x,
      y:v.y,
      junctionRoadCount:v.junctionRoadCount,
      houses:v.houses.map(h => ({
        x:h.x,
        y:h.y,
        w:h.w,
        h:h.h,
        angle:h.angle,
        roadClearance:h.roadClearance
      }))
    }))
  });
}
