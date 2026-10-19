const {test,expect}=require('@playwright/test');

test('v293 all iron deposits remain on dry land clear of riverbanks, roads and bridges after each reset',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__BATTLEFIELD_ECOLOGY_V1__?.oreShoreExclusion&&
    window.__NATURAL_RESOURCES_V1__?.oreNaturalBlend&&window.__RTS_DEBUG__?.getState));
  const result=await page.evaluate(()=>{
    const ecology=window.__BATTLEFIELD_ECOLOGY_V1__;
    const snapshots=[];
    const inspect=label=>{
      const ore=resources.filter(r=>r.type==='iron'&&!r.dead&&r.amount>0);
      const unsafe=ore.filter(r=>ecology.oreShoreConflict(r.x,r.y) ||
        waterAtV067(r.x,r.y) || ecology.roadConflict('iron',r.x,r.y));
      const riverDistances=ore.map(r=>riverHitV067(r.x,r.y)?.distance??Infinity);
      return {label,count:ore.length,unsafe:unsafe.map(r=>({id:r.id,x:r.x,y:r.y})),
        minimumShoreDistance:Math.min(...riverDistances),
        untagged:ore.filter(r=>r.visualKind!=='embedded-ironstone').length,
        noSize:ore.filter(r=>r.radius!==ecology.resourceRadius('iron')).length};
    };
    snapshots.push(inspect('new game'));
    resetGame();
    snapshots.push(inspect('first reset'));
    resetGame();
    snapshots.push(inspect('second reset'));

    // An ore deposit requested inside water or right on a bridge deck
    // must be relocated inland, not simply hidden by the renderer.
    const center=RIVER_POINTS_V067[12];
    const crossing=WATER_CROSSINGS_V067[0];
    const unsafeRequested=[
      {x:center.x,y:center.y},
      {x:crossing.x,y:crossing.y},
      {x:center.x+RIVER_NAV_HALF_WIDTH_V067+10,y:center.y}
    ];
    const inserted=unsafeRequested.map(p=>{
      const wasUnsafe=ecology.oreShoreConflict(p.x,p.y);
      const r=createResource('iron',p.x,p.y,300);
      return{wasUnsafe,exists:!!r,valid:r?ecology.validSpot('iron',r.x,r.y,r):false,
        dry:r?!ecology.oreShoreConflict(r.x,r.y)&&!waterAtV067(r.x,r.y):false,
        moved:r?Math.hypot(r.x-p.x,r.y-p.y):0,
        visualKind:r?.visualKind||null};
    });
    snapshots.push(inspect('after requested wet/bridge ore'));
    return{snapshots,inserted,minimumRequired:RIVER_NAV_HALF_WIDTH_V067+
      ecology.resourceRadius('iron')+30,
      radius:ecology.resourceRadius('iron'),
      style:window.__NATURAL_RESOURCES_V1__.ironStyle,
      roads:ecology.resourceRoadExclusion};
  });
  expect(errors).toEqual([]);
  expect(result.radius).toBe(22);
  expect(result.roads).toBe(true);
  expect(result.style).toBe('mossy-half-buried-fieldstones');
  expect(result.snapshots).toHaveLength(4);
  for(const snapshot of result.snapshots){
    expect(snapshot.count).toBeGreaterThanOrEqual(15);
    expect(snapshot.unsafe).toEqual([]);
    expect(snapshot.untagged).toBe(0);
    expect(snapshot.noSize).toBe(0);
    expect(snapshot.minimumShoreDistance).toBeGreaterThanOrEqual(result.minimumRequired-0.01);
  }
  for(const item of result.inserted){
    expect(item.wasUnsafe).toBe(true);
    expect(item.exists).toBe(true);
    expect(item.valid).toBe(true);
    expect(item.dry).toBe(true);
    expect(item.moved).toBeGreaterThan(35);
    expect(item.visualKind).toBe('embedded-ironstone');
  }
});

