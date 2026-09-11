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

  const activeRoadNetwork=global.NRTS_ROAD_NETWORK_V7 || ROAD_NETWORK_V066;
  const activeHamlets=global.NRTS_ROAD_HAMLETS_V7 || ROAD_HAMLETS_V066;

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
    core:{along:[44,118],offset:[22,46],roadMax:92,jitter:.07,spacing:56,depthJitter:8},
    residential:{along:[96,244],offset:[28,64],roadMax:128,jitter:.11,spacing:68,depthJitter:14},
    'farm-edge':{along:[176,352],offset:[52,108],roadMax:178,jitter:.16,spacing:104,depthJitter:24}
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
    for (const road of activeRoadNetwork) {
      const g=roadGeometryV069(road,hamlet.x,hamlet.y);
      if (g && g.distance <= road.width/2 + 28) branches.push(g);
    }
    if (!branches.length) {
      let nearest=null;
      for(const road of activeRoadNetwork){
        const g=roadGeometryV069(road,hamlet.x,hamlet.y);
        if(g&&(!nearest||g.edgeClearance<nearest.edgeClearance)) nearest=g;
      }
      if (nearest) branches.push(nearest);
    }
    return branches;
  }

  function roofClear(candidate,occupied,gap=16) {
    const r=Math.hypot(candidate.w,candidate.h)*.53;
    for(const other of occupied){
      const or=Math.hypot(other.w,other.h)*.53;
      const sameCluster=Boolean(candidate.clusterId && other.clusterId===candidate.clusterId);
      const localGap=sameCluster?Math.max(8,gap*.58):gap;
      if(Math.hypot(candidate.x-other.x,candidate.y-other.y)<r+or+localGap) return false;
    }
    return true;
  }

  function nearestActiveRoadGeometry(x,y){
    let best=null;
    for(const road of activeRoadNetwork){
      const g=roadGeometryV069(road,x,y);
      if(g&&(!best||g.edgeClearance<best.edgeClearance)) best=g;
    }
    return best;
  }

  function normalizedAngle(angle){
    while(angle>Math.PI) angle-=Math.PI*2;
    while(angle<-Math.PI) angle+=Math.PI*2;
    return angle;
  }

  function makeCandidate(hamlet,branch,zone,slot,kind,state,occupied,options={}) {
    const cfg=ZONES[zone];
    const size=sizeFor(kind,state);
    const preferredSide=Number.isFinite(options.side) ? options.side : (slot%2===0?-1:1);
    const preferredDirection=Number.isFinite(options.direction) ? options.direction : (Math.floor(slot/2)%2===0?-1:1);
    const clusterId=options.clusterId||null;
    const pairIndex=Math.floor(slot/2);
    const anchorX=Number.isFinite(branch.px)?branch.px:hamlet.x;
    const anchorY=Number.isFinite(branch.py)?branch.py:hamlet.y;

    let best=null;
    for(let attempt=0;attempt<220;attempt++){
      const side=attempt<110?preferredSide:-preferredSide;
      const direction=(attempt%55)<38?preferredDirection:-preferredDirection;
      const sweep=Math.floor(attempt/22);
      const sub=attempt%22;
      const nominal=cfg.along[0] + pairIndex*cfg.spacing + (slot%2)*cfg.spacing*.42 + (options.alongBias||0);
      const along=Math.min(cfg.along[1],nominal) + (sub-10.5)*4.4 + (random(state)-.5)*18;
      const depthBand=(attempt%18)/17;
      const offset=branch.road.width/2 + cfg.offset[0] + (cfg.offset[1]-cfg.offset[0])*depthBand +
        (random(state)-.5)*cfg.depthJitter + (options.offsetBias||0) + sweep*1.2;
      const x=anchorX + branch.tx*direction*along - branch.ty*side*offset;
      const y=anchorY + branch.ty*direction*along + branch.tx*side*offset;
      if(x<70||y<70||x>WORLD.width-70||y>WORLD.height-70) continue;

      const nearest=nearestActiveRoadGeometry(x,y);
      if(!nearest) continue;
      const roofRadius=Math.hypot(size.w,size.h)*.5;
      const roofEdgeGap=nearest.edgeClearance-roofRadius;
      if(roofEdgeGap<9 || nearest.edgeClearance>cfg.roadMax) continue;

      let angle=Math.atan2(nearest.ty,nearest.tx)+(random(state)-.5)*cfg.jitter;
      if(kind==='barn' && random(state)>.58) angle+=Math.PI/2;
      angle=normalizedAngle(angle);

      const candidate={
        x,y,w:size.w,h:size.h,angle,side,direction,
        roadName:nearest.road.name,roadClass:nearest.road.roadClass,
        roadClearance:nearest.edgeClearance,
        accessX:nearest.px,accessY:nearest.py,
        frontageDistance:Math.hypot(x-nearest.px,y-nearest.py),
        frontageDirection:direction,
        frontageSide:side,
        clusterId
      };
      if(!roofClear(candidate,occupied,zone==='core'?18:14)) continue;

      const targetClearance=zone==='core'?roofRadius+26:zone==='residential'?roofRadius+38:roofRadius+66;
      const score=Math.abs(nearest.edgeClearance-targetClearance) + Math.abs(along-nominal)*.075 + (sweep*1.5);
      if(score<(best?.score??Infinity)) best={...candidate,score};
      if(best && attempt>74 && score<10) break;
    }
    if(!best) return null;
    const {score,...candidate}=best;
    return candidate;
  }

  function pushStructure(list,hamlet,branch,zone,slot,kind,state,meta={}) {
    const candidate=makeCandidate(hamlet,branch,zone,slot,kind,state,list,meta);
    if(!candidate) return null;
    const index=list.length;
    const clusterId=meta.clusterId||`${zone}-${Math.floor(slot/2)}`;
    const item={
      id:`${hamlet.name.replace(/\s+/g,'-').toLowerCase()}-v6-${index}`,
      kind,zone,
      clusterId,
      clusterRole:meta.clusterRole||'standalone',
      compoundId:meta.compoundId||null,
      sharedYardId:meta.sharedYardId||clusterId,
      settlementV6:true,
      villageCenterX:hamlet.x,
      villageCenterY:hamlet.y,
      yardSeed:(hashText(hamlet.name)^Math.imul(index+1,2654435761))>>>0,
      ...candidate,
      clusterId
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

    const anchorKind=roadCount>=3 || random(state)>.48 ? 'chapel' : 'inn';
    pushStructure(houses,hamlet,branches[0],'core',0,anchorKind,state,{clusterId:'core',sharedYardId:'core-common',clusterRole:'anchor'});
    pushStructure(houses,hamlet,branches[roadCount>1?1:0],'core',1,'cottage',state,{clusterId:'core',sharedYardId:'core-common',clusterRole:'core-house'});
    pushStructure(houses,hamlet,branches[0],'core',2,random(state)>.55?'inn':'cottage',state,{clusterId:'core',sharedYardId:'core-common',clusterRole:'core-house'});

    const residentialCount=5+Math.min(3,roadCount)+Math.floor(random(state)*2);
    for(let i=0;i<residentialCount;i++){
      const pair=Math.floor(i/2);
      const branch=branches[(pair+1)%branches.length];
      const kind=random(state)<.24?'farmhouse':'cottage';
      const side=(pair+villageIndex)%2===0?-1:1;
      const direction=Math.floor(pair/2)%2===0?1:-1;
      const clusterId=`res-${pair}`;
      pushStructure(houses,hamlet,branch,'residential',i,kind,state,{
        clusterId,sharedYardId:clusterId,
        clusterRole:kind==='farmhouse'?'household-anchor':'dwelling',
        side,direction,
        alongBias:(i%2)*20,
        offsetBias:(i%2)*5
      });
    }

    const compoundCount=2+(roadCount>=3?1:0);
    for(let c=0;c<compoundCount;c++){
      const branch=branches[(c*2+villageIndex)%branches.length];
      const compoundId=`farm-${c}`;
      const side=c%2===0?-1:1;
      const direction=Math.floor(c/2)%2===0?1:-1;
      pushStructure(houses,hamlet,branch,'farm-edge',c*2,'farmhouse',state,{
        clusterId:compoundId,sharedYardId:compoundId,compoundId,clusterRole:'farmhouse',side,direction,alongBias:c*20
      });
      pushStructure(houses,hamlet,branch,'farm-edge',c*2+1,'barn',state,{
        clusterId:compoundId,sharedYardId:compoundId,compoundId,clusterRole:'barn',side,direction,alongBias:58+c*20,offsetBias:20
      });
    }

    const zoneCounts=houses.reduce((acc,h)=>{acc[h.zone]=(acc[h.zone]||0)+1;return acc;},{});
    const kindCounts=houses.reduce((acc,h)=>{acc[h.kind]=(acc[h.kind]||0)+1;return acc;},{});
    const frontageGroups=new Set(houses.map(h=>h.sharedYardId).filter(Boolean)).size;
    const meanRoadClearance=houses.length?houses.reduce((sum,h)=>sum+h.roadClearance,0)/houses.length:0;
    return Object.freeze({
      name:hamlet.name,x:hamlet.x,y:hamlet.y,
      junctionRoadCount:roadCount,
      settlementModel:'core-residential-farm-edge',
      structureCount:houses.length,
      frontageGroups,
      meanRoadClearance,
      zoneCounts:Object.freeze(zoneCounts),
      kindCounts:Object.freeze(kindCounts),
      houses:Object.freeze(houses.map(h=>Object.freeze(h)))
    });
  }

  const villages=Object.freeze(activeHamlets.map(buildVillage).filter(Boolean));
  let structureCount=0,compoundCount=0,frontageGroupCount=0;
  const zones={core:0,residential:0,'farm-edge':0};
  for(const village of villages){
    structureCount+=village.houses.length;
    frontageGroupCount+=village.frontageGroups||0;
    for(const [zone,count] of Object.entries(village.zoneCounts)) zones[zone]=(zones[zone]||0)+count;
    compoundCount+=new Set(village.houses.map(h=>h.compoundId).filter(Boolean)).size;
  }

  const api=Object.freeze({
    version:'village-layout-v6',
    model:'core-residential-farm-edge',
    villageCount:villages.length,
    structureCount,
    compoundCount,
    frontageGroupCount,
    zones:Object.freeze(zones),
    hierarchical:true,
    roadOriented:true,
    farmCompounds:true,
    clusteredFrontages:true,
    sharedYardGroups:true,
    roadAccessMetadata:true,
    curvedRoadAlignment:true,
    deterministicFabric:true,
    roadCount:activeRoadNetwork.length,
    battlefieldV7:Boolean(global.NRTS_ROAD_NETWORK_V7)
  });

  global.__VILLAGE_LAYOUT_V6_DATA__=villages;
  global.VILLAGE_SCENERY_V6=villages;
  global.__VILLAGE_LAYOUT_V6__=api;
  nrts.subsystems.register('village-layout-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'hierarchical clustered settlement generation with road-aligned frontages and shared household fabric'
  });
})(window);
