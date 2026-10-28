'use strict';
// Sending peasants to fell a tree where no logging camp of yours stands yet used
// to do nothing but print a status line: they walked to the tree and stood
// there. Now a player's click or tap on such a tree has them build a camp at
// the edge of that wood first (through the ordinary build order, so it is the
// same command online), and the camp then sets them to felling, as the British
// AI already does. Without the wood for it, the status line says what is
// missing. Only the player's own gesture does this: the gather command itself
// (and the server) still refuses to fell without a finished camp.
(function installLoggingOrders(root){
  if(document.readyState!=='complete'){addEventListener('load',()=>setTimeout(()=>installLoggingOrders(root)),{once:true});return;}
  const lumber=root.__LUMBER_V1__;
  if(!lumber||root.__LOGGING_ORDERS_V1__||typeof assignGather!=='function')return;
  const stats={campsOrdered:0,unaffordable:0,noSite:0};
  // Free ground at the edge of this tree's wood, close enough for the camp to reach it.
  function siteNear(tree,from){
    const toward=Math.atan2(from.y-tree.y,from.x-tree.x);
    // Nearest first; out to the camp's reach (a tree deep in a wood needs the far edge).
    for(let distance=110;distance<=lumber.radius-30;distance+=35)for(let i=0;i<24;i++){
      const a=toward+(i%2?1:-1)*Math.ceil(i/2)*Math.PI/12,p={x:tree.x+Math.cos(a)*distance,y:tree.y+Math.sin(a)*distance};
      if(Math.hypot(p.x-tree.x,p.y-tree.y)<=lumber.radius-30&&lumber.validSite(p.x,p.y))return p;
    }
    return null;
  }
  // A site for this tree, or failing that one by a neighbouring tree of the same
  // wood that still reaches it.
  function siteFor(tree,from){
    const near=resources.filter(t=>t.type==='wood'&&!t.dead&&t.amount>0&&Math.hypot(t.x-tree.x,t.y-tree.y)<lumber.radius)
      .sort((a,b)=>Math.hypot(a.x-tree.x,a.y-tree.y)-Math.hypot(b.x-tree.x,b.y-tree.y)).slice(0,12);
    for(const t of[tree,...near.filter(t=>t!==tree)]){const p=siteNear(t,from);if(p&&Math.hypot(p.x-tree.x,p.y-tree.y)<=lumber.radius-10)return p;}
    return null;
  }
  // True only while a player's click or tap is being handled.
  let gesture=false;
  for(const type of['contextmenu','pointerup','mouseup','touchend'])
    root.addEventListener(type,()=>{gesture=true;setTimeout(()=>{gesture=false;});},true);
  const base=assignGather;
  assignGather=function gatherOrBuildCamp(r){
    if(!gesture||r?.type!=='wood')return base.apply(this,arguments);
    const workers=[...selectedUnits].filter(u=>u&&!u.dead&&u.side==='france'&&u.type==='worker');
    if(!workers.length||lumber.campFor(r,'france'))return base.apply(this,arguments);
    // A camp of yours already going up at this wood: help build it.
    const rising=lumber.camps('france').find(b=>!b.dead&&!b.complete&&Math.hypot(b.x-r.x,b.y-r.y)<=lumber.radius);
    if(rising&&!root.__ONLINE_MATCH_V1__?.active){
      for(const u of workers)Object.assign(u,{task:'build',buildingTarget:rising,resourceTarget:null,targetX:rising.x,targetY:rising.y});
      statusEl.textContent=`${workers.length===1?'De boer helpt':'De boeren helpen'} eerst het houthakkerskamp bij dit bos af te bouwen.`;return true;
    }
    if(!canAfford('france',BUILDINGS.lumbercamp.cost)){
      stats.unaffordable++;statusEl.textContent=`Hier staat nog geen houthakkerskamp; daarvoor is ${BUILDINGS.lumbercamp.cost.wood} hout nodig.`;return true;
    }
    const p=siteFor(r,workers[0]);
    if(!p){stats.noSite++;return base.apply(this,arguments);}
    // The ordinary build order with the selected peasants as builders.
    placeBuilding('lumbercamp',p.x,p.y);
    stats.campsOrdered++;actionSignature='';
    statusEl.textContent=`${workers.length===1?'De boer bouwt':'De boeren bouwen'} eerst een houthakkerskamp aan de bosrand en kappen daarna hout.`;
    return true;
  };
  root.__LOGGING_ORDERS_V1__=Object.freeze({version:'1.0',siteNear,siteFor,stats:()=>({...stats})});
})(window);
