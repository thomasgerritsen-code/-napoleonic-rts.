'use strict';
const {test,expect}=require('@playwright/test');

// v283 regression: the same ROAD_NETWORK_V7 that draws the roads must be
// traversable by the real navigation graph without trying to cross open water.
test('v283 Napoleonic post roads form one safe road graph from NW France to SE Britain',async({page})=>{
  test.setTimeout(90_000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.NRTS_ROAD_GRAPH_V2&&window.NRTS_ROAD_INDEX_V2&&window.NRTS_ROAD_NETWORK_V7));
  const data=await page.evaluate(()=>{
    const network=window.NRTS_ROAD_NETWORK_V7;
    const imperial=network.filter(r=>r.id.startsWith('imperial-'));
    const byClass={chaussee:0,secondary:0,track:0},badSegments=[];
    const bridgeNodes={};
    for(const r of imperial){
      byClass[r.roadClass]=(byClass[r.roadClass]||0)+1;
      for(let i=1;i<r.points.length;i++){
        const a=r.points[i-1],b=r.points[i];
        // A road may cross the river ONLY inside actual existing bridges.
        if(segmentCrossesBlockedWaterV067(a.x,a.y,b.x,b.y))
          badSegments.push({road:r.id,a,b});
      }
    }
    const nodes=ROAD_GRAPH_V066;
    const head=nodes.get('650,60'),tail=nodes.get('7900,4480');
    const route=roadGraphRouteV066(head,tail,'infantry');
    const routePoints=route?.points||[];
    let prev=head,badRoute=0;
    for(const p of routePoints){
      if(segmentCrossesBlockedWaterV067(prev.x,prev.y,p.x,p.y))badRoute++;
      prev=p;
    }
    const seen=new Set(),queue=[head?.key].filter(Boolean);
    while(queue.length){
      const key=queue.pop();if(seen.has(key))continue;
      seen.add(key);
      const n=nodes.get(key);if(!n)continue;
      for(const edge of n.edges){
        const b=nodes.get(edge.to);
        if(!seen.has(edge.to)&&b&&!segmentCrossesBlockedWaterV067(n.x,n.y,b.x,b.y))
          queue.push(edge.to);
      }
    }
    const disconnected=[];
    for(const r of imperial){
      for(const p of r.points){
        const key=p.x+','+p.y;
        if(!seen.has(key))disconnected.push({id:r.id,key});
      }
    }
    const france=buildings.find(b=>b.side==='france'&&b.type==='towncenter'&&!b.dead);
    const britain=buildings.find(b=>b.side==='britain'&&b.type==='towncenter'&&!b.dead);
    const access=(tc)=>{const p=nearestStrategicRoadPointV066({x:tc.x,y:tc.y},'infantry');return p?.distance??null;};
    const coords=imperial.flatMap(r=>r.points);
    return{
      version:window.RTS_VERSION,world:{...WORLD},roadCount:imperial.length,byClass,
      postRelays:window.__BATTLEFIELD_EXPANSION_V7__?.relayVillageCount||0,
      indexes:window.NRTS_ROAD_INDEX_V2.segments,
      minX:Math.min(...coords.map(p=>p.x)),maxX:Math.max(...coords.map(p=>p.x)),
      minY:Math.min(...coords.map(p=>p.y)),maxY:Math.max(...coords.map(p=>p.y)),
      disjoint:disconnected.slice(0,20),disjointCount:disconnected.length,
      badSegments:badSegments.slice(0,12),badSegmentCount:badSegments.length,
      routeLength:routePoints.length,routeTime:route?.time??null,badRoute,
      franceAccess:access(france),britainAccess:access(britain)
    };
  });
  console.log('NAPOLEONIC_ROAD_NETWORK_V283',JSON.stringify(data));
  expect(errors).toEqual([]);
  expect(data.world.width).toBeGreaterThanOrEqual(8000);
  expect(data.world.height).toBeGreaterThanOrEqual(5000);
  expect(data.roadCount).toBeGreaterThanOrEqual(22);
  expect(data.byClass.chaussee).toBeGreaterThanOrEqual(6);
  expect(data.byClass.secondary).toBeGreaterThanOrEqual(8);
  expect(data.byClass.track).toBeGreaterThanOrEqual(4);
  expect(data.postRelays).toBeGreaterThanOrEqual(6);
  expect(data.indexes).toBeGreaterThanOrEqual(130);
  expect(data.minX).toBeLessThanOrEqual(260);
  expect(data.maxX).toBeGreaterThanOrEqual(7940);
  expect(data.minY).toBeLessThanOrEqual(80);
  expect(data.maxY).toBeGreaterThanOrEqual(4900);
  expect(data.badSegments,JSON.stringify(data.badSegments)).toEqual([]);
  expect(data.disjoint,JSON.stringify(data.disjoint)).toEqual([]);
  expect(data.disjointCount).toBe(0);
  expect(data.routeLength).toBeGreaterThan(12);
  expect(data.routeTime).toBeGreaterThan(0);
  expect(data.badRoute).toBe(0);
  expect(data.franceAccess).toBeLessThan(250);
  expect(data.britainAccess).toBeLessThan(250);
});
