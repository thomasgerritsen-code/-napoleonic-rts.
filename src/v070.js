'use strict';
// ---------- Napoleonic RTS v0.7.0: battalion kinematics + stable combat + rebuilt villages ----------

const V070_VERSION = '0.7.0';
const V070_LEGACY_TEST_MODE = new URLSearchParams(location.search).get('test') === '1';
if (!V070_LEGACY_TEST_MODE) {
  document.title = `Napoleonic RTS v${V070_VERSION}`;
  const v070VersionBadge = document.querySelector('.version');
  if (v070VersionBadge) v070VersionBadge.textContent = `v${V070_VERSION}`;
}

const V070_STATS = {
  kinematicFrames: 0,
  snappedMembers: 0,
  maxPreSnapError: 0,
  engagementLocks: 0,
  engagementSwitches: 0,
  centeredFormationBuilds: 0
};

function centeredOffsetsV070(reg, source) {
  const result = new Map();
  if (!reg || !source) return result;
  const members = regimentMembers(reg).filter(u => !u.dead && source.has(u.id));
  if (!members.length) return new Map(source);
  let mx = 0, my = 0;
  for (const u of members) {
    const o = source.get(u.id) || {ox:0, oy:0};
    mx += o.ox; my += o.oy;
  }
  mx /= members.length; my /= members.length;
  for (const [id, o] of source.entries()) result.set(id, {ox:o.ox - mx, oy:o.oy - my});
  V070_STATS.centeredFormationBuilds++;
  return result;
}

const finalFormationOffsetsV069ForV070 = finalFormationOffsetsV063;
finalFormationOffsetsV063 = function finalFormationOffsetsV070(reg, mode = reg.formation || 'line') {
  return centeredOffsetsV070(reg, finalFormationOffsetsV069ForV070(reg, mode));
};

const marchColumnOffsetsV069ForV070 = marchColumnOffsetsV063;
marchColumnOffsetsV063 = function marchColumnOffsetsV070(reg) {
  return centeredOffsetsV070(reg, marchColumnOffsetsV069ForV070(reg));
};

const arrangeRegimentV069ForV070 = arrangeRegiment;
arrangeRegiment = function arrangeRegimentV070(reg, x, y, mode = reg.formation || 'line') {
  arrangeRegimentV069ForV070(reg, x, y, mode);
  if (!reg || reg.destroyed || groupKindV06(reg) === 'artillery') return;
  reg.kinematicV070 = false;
  reg.kinematicEnableAtV070 = elapsed + 0.8;
};

const orderGroupPathV069ForV070 = orderGroupPathV06;
orderGroupPathV06 = function orderGroupPathV070(reg, x, y, formation = reg.formation, finalFacing = null) {
  if (!reg || reg.destroyed) return;
  const members = regimentMembers(reg);
  const before = members.length ? centroid(members) : null;
  orderGroupPathV069ForV070(reg, x, y, formation, finalFacing);
  if (groupKindV06(reg) === 'artillery' || !reg.marchV063?.v064) return;
  reg.kinematicV070 = true;
  reg.kinematicEnableAtV070 = elapsed;
  reg.kinematicCommandV070 = {
    at:elapsed,
    start:before ? {x:before.x,y:before.y} : null,
    goal:{x,y},
    formation:reg.formation,
    finalFacing:Number.isFinite(finalFacing) ? finalFacing : null
  };
};

function groupCenterV070(reg) {
  const members = regimentMembers(reg).filter(u => !u.dead && !u.routing);
  if (!members.length) return null;
  const anchor = groupAnchorV068(reg);
  return anchor || centroid(members);
}

function projectedExtentV070(reg, center, angle) {
  const members = regimentMembers(reg).filter(u => !u.dead && !u.routing);
  if (!members.length) return 0;
  const cx = Math.cos(angle), cy = Math.sin(angle);
  let extent = 0;
  for (const u of members) {
    const radius = TYPES[u.type]?.radius || 5;
    extent = Math.max(extent, Math.abs((u.x-center.x)*cx + (u.y-center.y)*cy) + radius);
  }
  return extent;
}

function enemyGroupByIdV070(id, side) {
  if (!id) return null;
  const reg = getRegiment(id) || regiments.find(r => r.id === id);
  if (!reg || reg.destroyed || reg.side === side || !['infantry','cavalry'].includes(groupKindV06(reg))) return null;
  return regimentMembers(reg).some(u => !u.dead && !u.routing) ? reg : null;
}

function nearestEnemyGroupV070(reg, maxCenterDistance = 360) {
  const own = groupCenterV070(reg);
  if (!own) return null;
  const locked = enemyGroupByIdV070(reg.engagementLockV070?.enemyGroupId, reg.side);
  if (locked) {
    const center = groupCenterV070(locked);
    if (center) {
      const d = Math.hypot(center.x-own.x, center.y-own.y);
      if (d <= maxCenterDistance + 90) return {reg:locked, center, centerDistance:d, retained:true};
    }
  }
  let best = null;
  for (const candidate of regiments) {
    if (!candidate || candidate.destroyed || candidate.side === reg.side) continue;
    if (!['infantry','cavalry'].includes(groupKindV06(candidate))) continue;
    const center = groupCenterV070(candidate);
    if (!center) continue;
    const d = Math.hypot(center.x-own.x, center.y-own.y);
    if (d > maxCenterDistance) continue;
    if (!best || d < best.centerDistance) best = {reg:candidate, center, centerDistance:d, retained:false};
  }
  return best;
}

refreshEngagementStatesV069 = function refreshEngagementStatesV070() {
  for (const reg of regiments) {
    if (!reg || reg.destroyed || groupKindV06(reg) !== 'infantry' || !reg.marchV063?.v064) {
      if (reg) { reg.engagementV069 = null; reg.engagementLockV070 = null; }
      continue;
    }
    const traffic = reg.crossingTrafficV068;
    if (traffic?.forcedColumn && ['waiting','approach','crossing'].includes(traffic.state)) {
      reg.engagementV069 = null;
      continue;
    }
    const members = regimentMembers(reg);
    const bayonet = members.some(u => (u.type === 'infantry' || u.type === 'officer') && u.attackMode === 'bayonet');
    const own = groupCenterV070(reg);
    const hit = nearestEnemyGroupV070(reg, bayonet ? 390 : 330);
    if (!own || !hit) {
      reg.engagementV069 = null;
      reg.engagementLockV070 = null;
      continue;
    }
    const heading = Math.atan2(hit.center.y-own.y, hit.center.x-own.x);
    const ownExtent = projectedExtentV070(reg, own, heading);
    const enemyExtent = projectedExtentV070(hit.reg, hit.center, heading);
    const frontGap = Math.max(0, hit.centerDistance - ownExtent - enemyExtent);
    const acquire = bayonet ? 165 : 145;
    const retain = bayonet ? 205 : 185;
    const wasLocked = reg.engagementLockV070?.enemyGroupId === hit.reg.id;
    if (frontGap > (wasLocked ? retain : acquire)) {
      reg.engagementV069 = null;
      if (!wasLocked) reg.engagementLockV070 = null;
      continue;
    }
    if (!wasLocked) {
      if (reg.engagementLockV070?.enemyGroupId) V070_STATS.engagementSwitches++;
      V070_STATS.engagementLocks++;
    }
    reg.engagementLockV070 = {enemyGroupId:hit.reg.id, lockedAt:wasLocked ? reg.engagementLockV070.lockedAt : elapsed};
    reg.engagementV069 = {
      mode:bayonet ? 'bayonet' : 'fire',
      enemyGroupId:hit.reg.id,
      enemyId:null,
      distance:frontGap,
      centerDistance:hit.centerDistance,
      frontGap,
      heading,
      hold:bayonet ? frontGap <= 13 : true,
      stableGroupLock:true,
      updatedAt:elapsed
    };
  }
};

const desiredGroupSpeedV069ForV070 = desiredGroupSpeedV064;
desiredGroupSpeedV064 = function desiredGroupSpeedV070(reg, march, roadMarch) {
  const engagement = reg?.engagementV069;
  if (!engagement) return desiredGroupSpeedV069ForV070(reg, march, roadMarch);
  const saved = reg.engagementV069;
  reg.engagementV069 = null;
  const base = desiredGroupSpeedV069ForV070(reg, march, roadMarch);
  reg.engagementV069 = saved;
  if (engagement.mode === 'fire') return 0;
  if (engagement.mode === 'bayonet') {
    if (engagement.hold) return 0;
    const factor = clampV064((engagement.frontGap - 8) / 100, .22, .82);
    return Math.min(base, 31) * factor;
  }
  return base;
};

function kinematicEligibleV070(reg) {
  if (!reg || reg.destroyed || !['infantry','cavalry'].includes(groupKindV06(reg))) return false;
  if (reg.marchV063?.v064) return true;
  if (reg.engagementV069) return true;
  if (reg.kinematicV070) return true;
  if (reg.movementPhaseV063 === 'formed') return true;
  if (Number.isFinite(reg.kinematicEnableAtV070) && elapsed >= reg.kinematicEnableAtV070 && formationReadinessV063(reg, 8) >= .92) {
    reg.kinematicV070 = true;
    return true;
  }
  return false;
}

function enforceBattalionKinematicsV070() {
  let corrected = 0;
  let maxError = 0;
  for (const reg of regiments) {
    if (!kinematicEligibleV070(reg)) continue;
    for (const u of regimentMembers(reg)) {
      if (u.dead || u.routing || !Number.isFinite(u.targetX) || !Number.isFinite(u.targetY)) continue;
      const error = Math.hypot(u.targetX-u.x, u.targetY-u.y);
      maxError = Math.max(maxError, error);
      u.x = Math.max(8, Math.min(WORLD.width-8, u.targetX));
      u.y = Math.max(8, Math.min(WORLD.height-8, u.targetY));
      u.arrivedAtTarget = true;
      if (u.type !== 'artillery') u.facing = reg.facing;
      corrected++;
    }
  }
  if (corrected) {
    V070_STATS.kinematicFrames++;
    V070_STATS.snappedMembers += corrected;
    V070_STATS.maxPreSnapError = Math.max(V070_STATS.maxPreSnapError, maxError);
  }
}

const updateV069ForV070 = update;
update = function updateV070(dt) {
  updateV069ForV070(dt);
  enforceBattalionKinematicsV070();
};

function roadTangentAtV070(road, x, y) {
  let best = null;
  for (let i=1; i<road.points.length; i++) {
    const a=road.points[i-1], b=road.points[i];
    const hit=closestPointOnSegmentV066(x,y,a,b);
    if (!best || hit.distance < best.distance) {
      const len=Math.hypot(b.x-a.x,b.y-a.y)||1;
      best={distance:hit.distance,tx:(b.x-a.x)/len,ty:(b.y-a.y)/len,px:hit.x,py:hit.y,segmentIndex:i-1};
    }
  }
  return best;
}

function houseRoadClearanceV070(x,y,w,h) {
  const nearest=nearestRoadGeometryV069(x,y);
  if (!nearest) return -Infinity;
  return nearest.edgeClearance - Math.hypot(w,h)/2;
}

function houseOverlapsV070(house, houses, gap=9) {
  const r=Math.hypot(house.w,house.h)/2;
  return houses.some(other => Math.hypot(house.x-other.x,house.y-other.y) < r + Math.hypot(other.w,other.h)/2 + gap);
}

function buildVillageSceneryV070() {
  const villages=[];
  for (const h of ROAD_HAMLETS_V066) {
    const roads=roadsAtJunctionV069(h);
    const usable=roads.length ? roads : [nearestRoadGeometryV069(h.x,h.y)?.road].filter(Boolean);
    const state={value:stringSeedV069(`v070:${h.name}`)};
    const houses=[];
    const target=Math.max(8, Math.min(12, 7 + usable.length));
    let slot=0;
    for (let cycle=0; cycle<30 && houses.length<target; cycle++) {
      for (const road of usable) {
        if (houses.length>=target) break;
        const tangent=roadTangentAtV070(road,h.x,h.y);
        if (!tangent) continue;
        const direction=((slot+cycle)&1)?1:-1;
        const side=((Math.floor((slot+cycle)/2))&1)?1:-1;
        const along=82 + cycle*18 + (slot%3)*25 + randV069(state)*16;
        const verge=road.width/2 + 35 + randV069(state)*18;
        const w=31 + randV069(state)*14;
        const hh=21 + randV069(state)*10;
        const x=h.x + tangent.tx*direction*along - tangent.ty*side*verge;
        const y=h.y + tangent.ty*direction*along + tangent.tx*side*verge;
        slot++;
        if (x<45||y<45||x>WORLD.width-45||y>WORLD.height-45) continue;
        const clearance=houseRoadClearanceV070(x,y,w,hh);
        if (clearance < 14 || clearance > 95) continue;
        const house={x,y,w,h:hh,angle:Math.atan2(tangent.ty,tangent.tx)+(randV069(state)-.5)*.09,roadClearance:clearance,roadId:road.id};
        if (houseOverlapsV070(house,houses)) continue;
        houses.push(house);
      }
    }
    villages.push({name:h.name,x:h.x,y:h.y,roads:usable.map(r=>r.id),junctionRoadCount:usable.length,houses});
  }
  return villages;
}

const VILLAGE_SCENERY_V070 = Object.freeze(buildVillageSceneryV070().map(v=>Object.freeze({...v,houses:Object.freeze(v.houses.map(h=>Object.freeze({...h})))})));

function roadSurfaceColorV070(road) {
  return road.roadClass==='chaussee' ? 'rgba(195,179,143,.96)' : road.roadClass==='secondary' ? 'rgba(166,139,96,.93)' : 'rgba(145,106,67,.86)';
}

function drawJunctionV070(village) {
  if (village.junctionRoadCount < 2) return;
  ctx.save();
  const roads=village.roads.map(id=>ROAD_NETWORK_V066.find(r=>r.id===id)).filter(Boolean);
  for (const road of roads) {
    const t=roadTangentAtV070(road,village.x,village.y);
    if (!t) continue;
    for (const dir of [-1,1]) {
      const tx=t.tx*dir, ty=t.ty*dir, nx=-ty, ny=tx;
      const inner=Math.max(road.width*.62,22), outer=Math.max(road.width*.50,18), len=54;
      ctx.fillStyle=roadSurfaceColorV070(road);
      ctx.beginPath();
      ctx.moveTo(village.x+nx*inner,village.y+ny*inner);
      ctx.lineTo(village.x+tx*len+nx*outer,village.y+ty*len+ny*outer);
      ctx.lineTo(village.x+tx*len-nx*outer,village.y+ty*len-ny*outer);
      ctx.lineTo(village.x-nx*inner,village.y-ny*inner);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(83,61,39,.25)'; ctx.lineWidth=1.2;
      for (const lane of [-.22,.22]) {
        ctx.beginPath();
        ctx.moveTo(village.x+nx*lane*road.width,village.y+ny*lane*road.width);
        ctx.lineTo(village.x+tx*len+nx*lane*road.width*.72,village.y+ty*len+ny*lane*road.width*.72);
        ctx.stroke();
      }
    }
  }
  const r=22+Math.min(roads.length,5)*3;
  ctx.fillStyle='rgba(174,149,105,.94)';
  ctx.beginPath();
  const pts=9;
  for(let i=0;i<pts;i++){
    const a=i/pts*Math.PI*2, rr=r*(i%3===0?1.12:i%2===0?.94:1.03);
    const x=village.x+Math.cos(a)*rr, y=village.y+Math.sin(a)*rr;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
  ctx.restore();
}

function drawHouseV070(house,index) {
  ctx.save();ctx.translate(house.x,house.y);ctx.rotate(house.angle);
  ctx.fillStyle='rgba(112,96,62,.10)';
  ctx.fillRect(-house.w*.78,-house.h*.92,house.w*1.56,house.h*1.84);
  ctx.strokeStyle='rgba(92,74,47,.58)';ctx.lineWidth=1.2;
  ctx.strokeRect(-house.w*.78,-house.h*.92,house.w*1.56,house.h*1.84);
  ctx.fillStyle=index%3===0?'#c8b58d':index%3===1?'#bba57d':'#d1bf98';
  ctx.fillRect(-house.w/2,-house.h/2,house.w,house.h);
  ctx.fillStyle=index%2===0?'#70462f':'#604036';
  ctx.beginPath();ctx.moveTo(-house.w*.60,-house.h*.35);ctx.lineTo(0,-house.h*.88);ctx.lineTo(house.w*.60,-house.h*.35);ctx.closePath();ctx.fill();
  ctx.fillStyle='#594431';ctx.fillRect(-3,0,6,house.h/2);
  ctx.fillStyle='rgba(238,218,161,.82)';ctx.fillRect(-house.w*.30,-4,5,5);ctx.fillRect(house.w*.18,-4,5,5);
  ctx.fillStyle='#5a4635';ctx.fillRect(house.w*.27,-house.h*.78,4,8);
  ctx.restore();
}

drawHamletsV066 = function drawHamletsV070() {
  ctx.save();
  for (const village of VILLAGE_SCENERY_V070) drawJunctionV070(village);
  for (const village of VILLAGE_SCENERY_V070) village.houses.forEach(drawHouseV070);
  ctx.restore();
  ctx.textAlign='start';
};

const resetGameV069ForV070 = resetGame;
resetGame = function resetGameV070() {
  V070_STATS.kinematicFrames=0;
  V070_STATS.snappedMembers=0;
  V070_STATS.maxPreSnapError=0;
  V070_STATS.engagementLocks=0;
  V070_STATS.engagementSwitches=0;
  V070_STATS.centeredFormationBuilds=0;
  resetGameV069ForV070();
  statusEl.textContent='v0.7.0: nieuwe bataljonsolver — stabiele wegmars, vaste gevechtsformatie en duidelijkere wegdorpen.';
};
