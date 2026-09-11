'use strict';
// ---------- Village layout v6: hierarchical settlement fabric with deterministic archetypes ----------
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

  const ARCHETYPES = Object.freeze({
    'parish-centre':Object.freeze({coreCount:4,residentialBase:6,compoundCount:2,spacingScale:.84,residentialDepthBias:-4,farmDepthBias:2,branchMode:'fan',angleJitter:.015}),
    crossroads:Object.freeze({coreCount:3,residentialBase:7,compoundCount:2,spacingScale:.94,residentialDepthBias:0,farmDepthBias:6,branchMode:'fan',angleJitter:.025}),
    ribbon:Object.freeze({coreCount:2,residentialBase:8,compoundCount:2,spacingScale:1.18,residentialDepthBias:-8,farmDepthBias:8,branchMode:'primary',angleJitter:.018}),
    agrarian:Object.freeze({coreCount:2,residentialBase:4,compoundCount:3,spacingScale:1.08,residentialDepthBias:8,farmDepthBias:18,branchMode:'fan',angleJitter:.04}),
    woodland:Object.freeze({coreCount:2,residentialBase:5,compoundCount:2,spacingScale:.98,residentialDepthBias:12,farmDepthBias:14,branchMode:'fan',angleJitter:.075})
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
    return branches.sort((a,b)=>{
      const priority={chaussee:3,secondary:2,track:1};
      return (priority[b.road.roadClass]||0)-(priority[a.road.roadClass]||0) || a.distance-b.distance;
    });
  }

  function chooseArchetype(hamlet,branches) {
    const name=String(hamlet.name||'').toLowerCase();
    if(name.includes('ferme')) return 'agrarian';
    if(name.includes('bois')) return 'woodland';
    if(name.startsWith('st.')||name.startsWith('saint')) return 'parish-centre';
    if(branches.length>=3) return 'crossroads';
    if(branches.length<=1) return 'ribbon';
    return (hashText(hamlet.name)&1)===0?'crossroads':'ribbon';
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
    const spacingScale=Number.isFinite(options.spacingScale)?options.spacingScale:1;

    let best=null;
    for(let attempt=0;attempt<240;attempt++){
      const side=attempt<120?preferredSide:-preferredSide;
      const direction=(attempt%60)<42?preferredDirection:-preferredDirection;
      const sweep=Math.floor(attempt/24);
      const sub=attempt%24;
      const nominal=cfg.along[0] + pairIndex*cfg.spacing*spacingScale + (slot%2)*cfg.spacing*.42*spacingScale + (options.alongBias||0);
      const along=Math.min(cfg.along[1],nominal) + (sub-11.5)*4.2 + (random(state)-.5)*18;
      const depthBand=(attempt%18)/17;
      const offset=branch.road.width/2 + cfg.offset[0] + (cfg.offset[1]-cfg.offset[0])*depthBand +
        (random(state)-.5)*cfg.depthJitter + (options.offsetBias||0) + sweep*1.15;
      const x=anchorX + branch.tx*direction*along - branch.ty*side*offset;
      const y=anchorY + branch.ty*direction*along + branch.tx*side*offset;
      if(x<70||y<70||x>WORLD.width-70||y>WORLD.height-70) continue;

      const nearest=nearestActiveRoadGeometry(x,y);
      if(!nearest) continue;
      const roofRadius=Math.hypot(size.w,size.h)*.5;
      const roofEdgeGap=nearest.edgeClearance-roofRadius;
      if(roofEdgeGap<9 || nearest.edgeClearance>cfg.roadMax+(options.roadMaxExtra||0)) continue;

      let angle=Math.atan2(nearest.ty,nearest.tx)+(random(state)-.5)*(cfg.jitter+(options.angleJitter||0));
      if(kind==='barn' && random(state)>.58) angle+=Math.PI/2;
      angle=normalizedAngle(angle+(options.angleBias||0));

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
      if(best && attempt>78 && score<10) break;
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
      archetype:meta.archetype||'crossroads',
      villageCenterX:hamlet.x,
      villageCenterY:hamlet.y,
      yardSeed:(hashText(hamlet.name)^Math.imul(index+1,2654435761))>>>0,
      ...candidate,
      clusterId
    };
    list.push(item);
    return item;
  }

  function branchFor(archetype,branches,index,offset=0){
    if(archetype.branchMode==='primary') return branches[0];
    return branches[(index+offset)%branches.length];
  }

  function buildVillage(hamlet,villageIndex) {
    const state={value:hashText(`v6:${hamlet.name}`)};
    const branches=roadBranchesAt(hamlet);
    if(!branches.length) return null;
    const houses=[];
    const roadCount=branches.length;
    const archetypeName=chooseArchetype(hamlet,branches);
    const archetype=ARCHETYPES[archetypeName];

    const anchorKind=archetypeName==='parish-centre'?'chapel':roadCount>=3 || random(state)>.48 ? 'chapel' : 'inn';
    for(let i=0;i<archetype.coreCount;i++){
      const branch=branchFor(archetype,branches,i);
      const kind=i===0?anchorKind:(i===1&&archetypeName==='parish-centre'?'inn':random(state)>.72?'farmhouse':'cottage');
      pushStructure(houses,hamlet,branch,'core',i,kind,state,{
        archetype:archetypeName,clusterId:'core',sharedYardId:'core-common',clusterRole:i===0?'anchor':'core-house',
        spacingScale:archetype.spacingScale,angleJitter:archetype.angleJitter,
        alongBias:archetypeName==='ribbon'?i*18:0,
        offsetBias:archetypeName==='woodland'?6:0
      });
    }

    const residentialCount=archetype.residentialBase+Math.min(2,Math.max(0,roadCount-1))+Math.floor(random(state)*2);
    for(let i=0;i<residentialCount;i++){
      const pair=Math.floor(i/2);
      const branch=branchFor(archetype,branches,pair,1);
      const farmhouseChance=archetypeName==='agrarian'?.42:archetypeName==='woodland'?.28:.22;
      const kind=random(state)<farmhouseChance?'farmhouse':'cottage';
      const side=archetypeName==='ribbon'?(i%2===0?-1:1):((pair+villageIndex)%2===0?-1:1);
      const direction=archetypeName==='ribbon'?(pair%2===0?1:-1):(Math.floor(pair/2)%2===0?1:-1);
      const clusterId=`res-${pair}`;
      pushStructure(houses,hamlet,branch,'residential',i,kind,state,{
        archetype:archetypeName,clusterId,sharedYardId:clusterId,
        clusterRole:kind==='farmhouse'?'household-anchor':'dwelling',
        side,direction,spacingScale:archetype.spacingScale,angleJitter:archetype.angleJitter,
        alongBias:(i%2)*20 + (archetypeName==='ribbon'?pair*9:0),
        offsetBias:(i%2)*5+archetype.residentialDepthBias,
        roadMaxExtra:archetypeName==='woodland'?12:0
      });
    }

    const compoundCount=archetype.compoundCount+(archetypeName==='crossroads'&&roadCount>=3?1:0);
    for(let c=0;c<compoundCount;c++){
      const branch=branchFor(archetype,branches,c*2,villageIndex%branches.length);
      const compoundId=`farm-${c}`;
      const side=c%2===0?-1:1;
      const direction=Math.floor(c/2)%2===0?1:-1;
      pushStructure(houses,hamlet,branch,'farm-edge',c*2,'farmhouse',state,{
        archetype:archetypeName,clusterId:compoundId,sharedYardId:compoundId,compoundId,clusterRole:'farmhouse',side,direction,
        spacingScale:archetype.spacingScale,angleJitter:archetype.angleJitter,alongBias:c*20,offsetBias:archetype.farmDepthBias
      });
      pushStructure(houses,hamlet,branch,'farm-edge',c*2+1,'barn',state,{
        archetype:archetypeName,clusterId:compoundId,sharedYardId:compoundId,compoundId,clusterRole:'barn',side,direction,
        spacingScale:archetype.spacingScale,angleJitter:archetype.angleJitter,alongBias:58+c*20,offsetBias:20+archetype.farmDepthBias
      });
    }

    const zoneCounts=houses.reduce((acc,h)=>{acc[h.zone]=(acc[h.zone]||0)+1;return acc;},{});
    const kindCounts=houses.reduce((acc,h)=>{acc[h.kind]=(acc[h.kind]||0)+1;return acc;},{});
    const frontageGroups=new Set(houses.map(h=>h.sharedYardId).filter(Boolean)).size;
    const meanRoadClearance=houses.length?houses.reduce((sum,h)=>sum+h.roadClearance,0)/houses.length:0;
    const maxRadius=houses.length?Math.max(...houses.map(h=>Math.hypot(h.x-hamlet.x,h.y-hamlet.y))):0;
    return Object.freeze({
      name:hamlet.name,x:hamlet.x,y:hamlet.y,
      junctionRoadCount:roadCount,
      archetype:archetypeName,
      settlementModel:'archetype-core-residential-farm-edge',
      structureCount:houses.length,
      frontageGroups,
      meanRoadClearance,
      maxRadius,
      zoneCounts:Object.freeze(zoneCounts),
      kindCounts:Object.freeze(kindCounts),
      houses:Object.freeze(houses.map(h=>Object.freeze(h)))
    });
  }

  const villages=Object.freeze(activeHamlets.map(buildVillage).filter(Boolean));
  let structureCount=0,compoundCount=0,frontageGroupCount=0;
  const zones={core:0,residential:0,'farm-edge':0};
  const archetypeCounts={};
  for(const village of villages){
    structureCount+=village.houses.length;
    frontageGroupCount+=village.frontageGroups||0;
    archetypeCounts[village.archetype]=(archetypeCounts[village.archetype]||0)+1;
    for(const [zone,count] of Object.entries(village.zoneCounts)) zones[zone]=(zones[zone]||0)+count;
    compoundCount+=new Set(village.houses.map(h=>h.compoundId).filter(Boolean)).size;
  }

  const api=Object.freeze({
    version:'village-layout-v6',
    model:'archetype-core-residential-farm-edge',
    villageCount:villages.length,
    structureCount,
    compoundCount,
    frontageGroupCount,
    archetypeCount:Object.keys(archetypeCounts).length,
    archetypes:Object.freeze(archetypeCounts),
    zones:Object.freeze(zones),
    hierarchical:true,
    roadOriented:true,
    farmCompounds:true,
    clusteredFrontages:true,
    sharedYardGroups:true,
    roadAccessMetadata:true,
    curvedRoadAlignment:true,
    deterministicFabric:true,
    deterministicArchetypes:true,
    nonUniformSettlementForms:true,
    roadCount:activeRoadNetwork.length,
    battlefieldV7:Boolean(global.NRTS_ROAD_NETWORK_V7)
  });

  global.__VILLAGE_LAYOUT_V6_DATA__=villages;
  global.VILLAGE_SCENERY_V6=villages;
  global.__VILLAGE_LAYOUT_V6__=api;
  nrts.subsystems.register('village-layout-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'deterministic archetype-driven settlement generation with varied cores, ribbons and farm compounds'
  });
})(window);
