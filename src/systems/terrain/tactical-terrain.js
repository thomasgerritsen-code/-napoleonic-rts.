'use strict';
(function installTerrainLOSV1(global){
  const nrts=global.NRTS;if(!nrts)throw new Error('NRTS required');
  function terrainName(x,y){try{const t=terrainAtV06(x,y);return typeof t==='string'?t.toLowerCase():String(t?.type||t?.kind||'field').toLowerCase();}catch{return 'field';}}
  function lineOfSight(a,b){const d=Math.hypot(b.x-a.x,b.y-a.y);const steps=Math.max(2,Math.ceil(d/36));let woods=0;for(let i=1;i<steps;i++){const q=i/steps,n=terrainName(a.x+(b.x-a.x)*q,a.y+(b.y-a.y)*q);if(n.includes('wood')||n.includes('forest'))woods++;if(woods>=2)return false;}return true;}
  function coverAt(e){const n=terrainName(e.x,e.y);if(n.includes('wood')||n.includes('forest'))return .82;if(n.includes('village')||n.includes('building'))return .88;return 1;}

  // Keep the final combat-query implementation (including its spatial index and metrics)
  // authoritative. LOS only rejects an occluded result. A full scan is used solely as a
  // fallback when that indexed nearest target is hidden by terrain.
  const indexedNearestEnemyEntity=nearestEnemyEntity;
  nearestEnemyEntity=function nearestVisibleEnemyEntityV1(unit,maxRange){
    const nearest=indexedNearestEnemyEntity(unit,maxRange);
    if(!nearest||lineOfSight(unit,nearest))return nearest;
    const otherSide=opposite(unit.side);let best=null,bestD2=maxRange*maxRange;
    for(const other of units){
      if(other.dead||other.side!==otherSide||other.routing||other.type==='worker')continue;
      const dx=other.x-unit.x,dy=other.y-unit.y,d2=dx*dx+dy*dy;
      if(d2<bestD2&&lineOfSight(unit,other)){bestD2=d2;best=other;}
    }
    for(const b of buildings){
      if(b.dead||b.side!==otherSide||!b.complete)continue;
      const dx=b.x-unit.x,dy=b.y-unit.y,d2=dx*dx+dy*dy;
      if(d2<bestD2&&lineOfSight(unit,b)){bestD2=d2;best=b;}
    }
    return best;
  };

  const oldDamage=applyDamage;applyDamage=function(victim,damage,shock=8){const adjusted=victim?.kind==='unit'?damage*coverAt(victim):damage;return oldDamage(victim,adjusted,shock);};
  function terrainAdvantage(u){const n=terrainName(u.x,u.y);return {terrain:n,cover:coverAt(u),visibility:n.includes('wood')?.72:1,elevation:n.includes('hill')?1.12:1};}
  const api=Object.freeze({lineOfSight,coverAt,terrainAdvantage});
  nrts.subsystems.register('tactical-terrain',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'line of sight, woodland cover and tactical terrain modifiers'});global.__TACTICAL_TERRAIN_V1__=api;
})(window);
