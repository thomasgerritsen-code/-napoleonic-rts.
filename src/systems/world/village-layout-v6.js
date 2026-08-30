'use strict';
// ---------- Village layout v6: core + residential + farm-edge settlement hierarchy ----------
(function installVillageLayoutV6(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before Village V6 layout.');
  if (typeof ROAD_HAMLETS_V066 === 'undefined' || typeof ROAD_NETWORK_V066 === 'undefined') {
    throw new Error('Road hamlets must load before Village V6 layout.');
  }
  if (typeof roadGeometryV069 !== 'function' || typeof nearestRoadGeometryV069 !== 'function') {
    throw new Error('Village road geometry helpers must load before Village V6 layout.');
  }

  function hashText(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function random(state) {
    state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0;
    return state.value / 4294967296;
  }

  const PROFILES = Object.freeze({
    cottage:{w:[30,42],h:[18,26]},
    farmhouse:{w:[44,59],h:[23,31]},
    barn:{w:[37,52],h:[20,28]},
    inn:{w:[54,66],h:[29,37]},
    chapel:{w:[58,70],h:[23,30]}
  });

  const ZONES = Object.freeze({
    core:{along:[48,120],offset:[22,48],roadMax:90,jitter:.08},
    residential:{along:[105,235],offset:[30,66],roadMax:125,jitter:.13},
    'farm-edge':{along:[185,340],offset:[54,108],roadMax:175,jitter:.18}
  });

  function sizeFor(kind,state) {
    const p = PROFILES[kind] || PROFILES.cottage;
    return {
      w:p.w[0] + random(state) * (p.w[1] - p.w[0]),
      h:p.h[0] + random(state) * (p.h[1] - p.h[0])
    };
  }

  function roadBranchesAt(hamlet) {
    const branches=[];
    for (const road of ROAD_NETWORK_V066) {
      const g=roadGeometryV069(road,hamlet.x,hamlet.y);
      if (g && g.distance <= road.width/2 + 28) branches.push(g);
    }
    if (!branches.length) {
      const nearest=nearestRoadGeometryV069(hamlet.x,hamlet.y);
      if (nearest) branches.push(nearest);
    }
    return branches;
  }

  function roofClear(candidate,occupied,gap=16) {
    const r=Math.hypot(candidate.w,candidate.h)*.53;
    for(const other of occupied){
      const or=Math.hypot(other.w,other.h)*.53;
      if(Math.hypot(candidate.x-other.x,candidate.y-other.y)<r+or+gap) return false;
    }
    return true;
  }

  function makeCandidate(hamlet,branch,zone,slot,kind,state,occupied,options={}) {
    const cfg=ZONES[zone];
    const size=sizeFor(kind,state);
    const angle0=Math.atan2(branch.ty,branch.tx);
    const preferredSide=Number.isFinite(options.side) ? options.side : (slot%2===0?-1:1);
    const preferredDirection=Number.isFinite(options.direction) ? options.direction : (Math.floor(slot/2)%2===0?-1:1);

    for(let attempt=0;attempt<180;attempt++){
      const side=attempt<90?preferredSide:-preferredSide;
      const direction=attempt%45<30?preferredDirection:-preferredDirection;
      const alongT=(slot*.31 + attempt*.071 + random(state)*.19)%1;
      const along=cfg.along[0] + (cfg.along[1]-cfg.along[0])*alongT + (options.alongBias||0);
      const depthT=(attempt%18)/17;
      const offset=branch.road.width/2 + cfg.offset[0] + (cfg.offset[1]-cfg.offset[0])*depthT + (options.offsetBias||0);
      const lateralJitter=(random(state)-.5)*(zone==='farm-edge'?24:14);
      const x=hamlet.x + branch.tx*direction*(along+lateralJitter) - branch.ty*side*offset;
      const y=hamlet.y + branch.ty*direction*(along+lateralJitter) + branch.tx*side*offset;
      if(x<70||y<70||x>WORLD.width-70||y>WORLD.height-70) continue;

      const nearest=nearestRoadGeometryV069(x,y);
      if(!nearest) continue;
      const roofRadius=Math.hypot(size.w,size.h)*.5;
      if(nearest.edgeClearance-roofRadius<9 || nearest.edgeClearance>cfg.roadMax) continue;

      let angle=angle0+(random(state)-.5)*cfg.jitter;
      if(kind==='barn' && random(state)>.58) angle+=Math.PI/2;
      const candidate={x,y,w:size.w,h:size.h,angle,side,direction,roadName:branch.road.name,roadClass:branch.road.roadClass,roadClearance:nearest.edgeClearance};
      if(!roofClear(candidate,occupied,zone==='core'?18:14)) continue;
      return candidate;
    }
    return null;
  }

  function pushStructure(list,hamlet,branch,zone,slot,kind,state,meta={}) {
    const candidate=makeCandidate(hamlet,branch,zone,slot,kind,state,list,meta);
    if(!candidate) return null;
    const index=list.length;
    const item={
      id:`${hamlet.name.replace(/\s+/g,'-').toLowerCase()}-v6-${index}`,
      kind,zone,
      clusterId:meta.clusterId||`${zone}-${Math.floor(slot/2)}`,
      clusterRole:meta.clusterRole||'standalone',
      compoundId:meta.compoundId||null,
      settlementV6:true,
      villageCenterX:hamlet.x,
      villageCenterY:hamlet.y,
      yardSeed:(hashText(hamlet.name)^Math.imul(index+1,2654435761))>>>0,
      ...candidate
    };
    list.push(item);
    return item;
  }

  function buildVillage(hamlet,villageIndex) {
    const state={value:hashText(`v6:${hamlet.name}`)};
    const branches=roadBranchesAt(hamlet);
    if(!branches.length) return null;
    const houses=[];
    const roadCount=branches.length;

    // 1) A readable village core: one civic anchor plus a few close roadside buildings.
    const anchorKind=roadCount>=3 || random(state)>.48 ? 'chapel' : 'inn';
    pushStructure(houses,hamlet,branches[0],'core',0,anchorKind,state,{clusterId:'core',clusterRole:'anchor'});
    pushStructure(houses,hamlet,branches[roadCount>1?1:0],'core',1,'cottage',state,{clusterId:'core',clusterRole:'core-house'});
    pushStructure(houses,hamlet,branches[0],'core',2,random(state)>.55?'inn':'cottage',state,{clusterId:'core',clusterRole:'core-house'});

    // 2) Residential ribbon: varied spacing and mixed cottages/farmhouses along all road arms.
    const residentialCount=5+Math.min(3,roadCount)+Math.floor(random(state)*2);
    for(let i=0;i<residentialCount;i++){
      const branch=branches[(i+1)%branches.length];
      const kind=random(state)<.24?'farmhouse':'cottage';
      pushStructure(houses,hamlet,branch,'residential',i,kind,state,{
        clusterId:`res-${Math.floor(i/2)}`,
        clusterRole:kind==='farmhouse'?'household-anchor':'dwelling'
      });
    }

    // 3) Agricultural edge: farmhouse + barn compounds at the settlement fringe.
    const compoundCount=2+(roadCount>=3?1:0);
    for(let c=0;c<compoundCount;c++){
      const branch=branches[(c*2+villageIndex)%branches.length];
      const compoundId=`farm-${c}`;
      const side=c%2===0?-1:1;
      const direction=Math.floor(c/2)%2===0?1:-1;
      pushStructure(houses,hamlet,branch,'farm-edge',c*2,'farmhouse',state,{
        clusterId:compoundId,compoundId,clusterRole:'farmhouse',side,direction,alongBias:c*18
      });
      pushStructure(houses,hamlet,branch,'farm-edge',c*2+1,'barn',state,{
        clusterId:compoundId,compoundId,clusterRole:'barn',side,direction,alongBias:42+c*18,offsetBias:20
      });
    }

    const zoneCounts=houses.reduce((acc,h)=>{acc[h.zone]=(acc[h.zone]||0)+1;return acc;},{});
    const kindCounts=houses.reduce((acc,h)=>{acc[h.kind]=(acc[h.kind]||0)+1;return acc;},{});
    return Object.freeze({
      name:hamlet.name,x:hamlet.x,y:hamlet.y,
      junctionRoadCount:roadCount,
      settlementModel:'core-residential-farm-edge',
      structureCount:houses.length,
      zoneCounts:Object.freeze(zoneCounts),
      kindCounts:Object.freeze(kindCounts),
      houses:Object.freeze(houses.map(h=>Object.freeze(h)))
    });
  }

  const villages=Object.freeze(ROAD_HAMLETS_V066.map(buildVillage).filter(Boolean));
  let structureCount=0,compoundCount=0;
  const zones={core:0,residential:0,'farm-edge':0};
  for(const village of villages){
    structureCount+=village.houses.length;
    for(const [zone,count] of Object.entries(village.zoneCounts)) zones[zone]=(zones[zone]||0)+count;
    compoundCount+=new Set(village.houses.map(h=>h.compoundId).filter(Boolean)).size;
  }

  const api=Object.freeze({
    version:'village-layout-v6',
    model:'core-residential-farm-edge',
    villageCount:villages.length,
    structureCount,
    compoundCount,
    zones:Object.freeze(zones),
    hierarchical:true,
    roadOriented:true,
    farmCompounds:true
  });

  global.__VILLAGE_LAYOUT_V6_DATA__=villages;
  global.VILLAGE_SCENERY_V6=villages;
  global.__VILLAGE_LAYOUT_V6__=api;
  nrts.subsystems.register('village-layout-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'hierarchical settlement generation with village core, residential ribbon and agricultural edge compounds'
  });
})(window);
