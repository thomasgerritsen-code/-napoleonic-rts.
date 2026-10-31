'use strict';
(function expose(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.NRTS_BATTLE_STATE=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const sides=['france','britain'];
  function create({holdSeconds=120}={}){
    let controlSide=null,heldSeconds=0,result=null;
    const seenUnits=new Set(),lostUnits=new Set(),lostBuildings=new Set();
    const stats=Object.fromEntries(sides.map(side=>[side,{trained:0,unitsLost:0,buildingsLost:0,unitsRemaining:0,buildingsRemaining:0,territories:0}]));
    const clone=value=>JSON.parse(JSON.stringify(value));
    function observe(units,buildings,initial=false){
      if(result)return;
      for(const side of sides){stats[side].unitsRemaining=0;stats[side].buildingsRemaining=0;}
      for(const u of units){
        if(!stats[u.side])continue;
        if(!seenUnits.has(u.id)){seenUnits.add(u.id);if(!initial)stats[u.side].trained++;}
        if(!u.dead&&u.hp>0)stats[u.side].unitsRemaining++;
        else if(!lostUnits.has(u.id)){lostUnits.add(u.id);stats[u.side].unitsLost++;}
      }
      for(const b of buildings){
        if(!stats[b.side])continue;
        if(!b.dead&&b.hp>0)stats[b.side].buildingsRemaining++;
        else if(!lostBuildings.has(b.id)){lostBuildings.add(b.id);stats[b.side].buildingsLost++;}
      }
    }
    function finish(winner,reason,elapsed,territories){
      if(result)return clone(result);
      for(const side of sides)stats[side].territories=(territories?.points||[]).filter(p=>p.owner===side).length;
      result={winner,reason,elapsed,stats:clone(stats)};return clone(result);
    }
    function elimination(units,buildings,elapsed,territories){
      if(result)return clone(result);
      observe(units,buildings);
      const defeated=side=>{const homes=buildings.filter(b=>b.side===side&&b.type==='towncenter');return homes.length>0&&homes.every(b=>b.dead||b.hp<=0)&&!units.some(u=>u.side===side&&!u.dead&&u.hp>0&&u.type!=='worker');};
      const f=defeated('france'),b=defeated('britain');
      return f||b?finish(f&&b?'draw':f?'britain':'france','elimination',elapsed,territories):null;
    }
    function territoryStep(dt,territories,elapsed){
      if(result||!Number.isFinite(dt)||dt<=0)return result?clone(result):null;
      const points=territories?.points||[];
      const side=points.length===3&&sides.includes(points[0].owner)&&points.every(p=>p.owner===points[0].owner&&p.incomeActive&&!p.contested&&!p.claim)?points[0].owner:null;
      // Start at zero on the first fully secured sample: capture time never
      // counts toward holding the three areas. A challenge resets, not pauses.
      heldSeconds=side&&side===controlSide?Math.min(holdSeconds,heldSeconds+dt):0;controlSide=side;
      return side&&heldSeconds+1e-9>=holdSeconds?finish(side,'territories',elapsed,territories):null;
    }
    function state(){return{holdSeconds,controlSide,heldSeconds,result:result?clone(result):null};}
    return Object.freeze({observe,elimination,territoryStep,state});
  }
  return Object.freeze({create});
});
