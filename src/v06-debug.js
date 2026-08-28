'use strict';
if (window.__RTS_DEBUG__) {
  const getStateV05ForV06 = window.__RTS_DEBUG__.getState.bind(window.__RTS_DEBUG__);
  window.__RTS_DEBUG__.getState = function getStateV06() {
    const state = getStateV05ForV06();
    const serializeGroup = r => ({ id:r.id, side:r.side, kind:groupKindV06(r), name:r.name, formation:r.formation, facing:r.facing||0, morale:r.morale, destroyed:r.destroyed, brokenReason:r.brokenReason||null, initialStrength:r.initialStrength||r.memberIds.length, memberIds:[...r.memberIds], crewIds:[...(r.crewIds||[])], officerId:r.officerId||null, drummerId:r.drummerId||null, livingMembers:regimentMembers(r).map(u=>({id:u.id,type:u.type,regimentId:u.regimentId,morale:u.morale})), operational:groupKindV06(r)==='artillery'?canArtilleryOperateV06(artilleryForGroupV06(r)):true, pathLength:r.path?.length||0, pathIndex:r.pathIndex||0, finalFacing:typeof r.finalFacing==='number'?r.finalFacing:null });
    for (const side of ['france','britain']) {
      state[side].units = livingUnits(side).map(u => ({ id:u.id,type:u.type,regimentId:u.regimentId,x:u.x,y:u.y,targetX:u.targetX,targetY:u.targetY,morale:u.morale,task:u.task,resourceTargetId:u.resourceTarget?.id||null,preferredResourceType:u.preferredResourceType||null }));
      state[side].buildings = livingBuildings(side).map(b => ({ id:b.id,type:b.type,complete:b.complete,queue:b.queue.map(q=>q.type),production:b.production,rallyX:b.rallyX,rallyY:b.rallyY,x:b.x,y:b.y }));
      state[side].groups = regiments.filter(r=>r.side===side).map(serializeGroup);
      state[side].regiments = regiments.filter(r=>r.side===side&&!r.destroyed&&groupKindV06(r)!=='artillery').map(serializeGroup);
      state[side].batteries = regiments.filter(r=>r.side===side&&!r.destroyed&&groupKindV06(r)==='artillery').map(serializeGroup);
    }
    state.world={width:WORLD.width,height:WORLD.height}; state.exploredCells=exploredCells.size; state.aiStrategy=aiStrategyV06; state.rallyPlacement=rallyPlacementBuilding?.id||null;
    return state;
  };
  window.__RTS_DEBUG__.selectForBattery = function(side='france'){selectedUnits.clear();selectedBuilding=null;const cannon=livingUnits(side).find(u=>u.type==='artillery'&&!u.regimentId),crew=freeUnits(side,'infantry').slice(0,2);if(cannon)selectedUnits.add(cannon);crew.forEach(u=>selectedUnits.add(u));actionSignature='';updateHud(true);};
  window.__RTS_DEBUG__.selectForCavalryRegiment = function(side='france'){selectedUnits.clear();selectedBuilding=null;freeUnits(side,'cavalry').slice(0,4).forEach(u=>selectedUnits.add(u));const officer=freeUnits(side,'officer')[0];if(officer)selectedUnits.add(officer);actionSignature='';updateHud(true);};
  window.__RTS_DEBUG__.setRally=function(id,x,y){const b=buildings.find(b=>b.id===id);if(!b)return false;b.rallyX=x;b.rallyY=y;updateHud(true);return true;};
  window.__RTS_DEBUG__.setGroupMorale=function(id,morale){const r=regiments.find(r=>r.id===id);if(!r)return false;regimentMembers(r).forEach(u=>{if(u.type!=='artillery')u.morale=morale;});refreshRegiment(r);updateHud(true);return true;};
  window.__RTS_DEBUG__.reduceGroupTo=function(id,survivors){const r=regiments.find(r=>r.id===id);if(!r)return false;const members=regimentMembers(r).filter(u=>!['officer','drummer'].includes(u.type)),keep=new Set(members.slice(0,survivors).map(u=>u.id));members.forEach(u=>{if(!keep.has(u.id))u.dead=true;});refreshRegiment(r);updateHud(true);return true;};
  window.__RTS_DEBUG__.killBatteryCrew=function(id,count=1){const r=regiments.find(r=>r.id===id);if(!r)return false;artilleryCrewV06(r).slice(0,count).forEach(u=>u.dead=true);refreshRegiment(r);updateHud(true);return true;};
  window.__RTS_DEBUG__.assignWorkerToNearest=function(side='france',type='wood'){const worker=livingUnits(side).find(u=>u.type==='worker'),resource=nearestResource(type,worker?.x||0,worker?.y||0);if(!worker||!resource)return null;assignWorkerToResource(worker,resource);return{workerId:worker.id,resourceId:resource.id};};
  window.__RTS_DEBUG__.depleteResource=function(id,amount=0){const r=resources.find(r=>r.id===id);if(!r)return false;r.amount=amount;if(amount<=0)r.dead=true;return true;};
  window.__RTS_DEBUG__.teleportUnit=function(id,x,y){const u=units.find(u=>u.id===id);if(!u)return false;u.x=x;u.y=y;u.targetX=x;u.targetY=y;rebuildSpatialHash();markExploredV06();return true;};
  window.__RTS_DEBUG__.isExplored=(x,y)=>isExploredV06(x,y);
  window.__RTS_DEBUG__.terrainAt=(x,y)=>terrainAtV06(x,y);
  window.__RTS_DEBUG__.createFreshInfantryRegiment=function(side='france',x=1200,y=1050){const made=[];for(let i=0;i<12;i++)made.push(createUnit(side,'infantry',x+(i%6)*18,y+Math.floor(i/6)*20));made.push(createUnit(side,'officer',x,y-35));made.push(createUnit(side,'drummer',x+25,y-35));return createRegiment(side,made)?.id||null;};
  window.__RTS_DEBUG__.orderSelectedWithFacing=function(x,y,degrees){issueMoveWithFacingV06(x,y,degrees*Math.PI/180);};
}
