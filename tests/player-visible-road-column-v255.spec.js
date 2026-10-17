const {test,expect}=require('@playwright/test');
test('DIAGNOSTIC: visible physical files after forming regiment via real player UI',async({page})=>{
  test.setTimeout(170000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=3d',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__OFFICER_REGIMENT_MOBILE_V1__&&window.__BATTLEFIELD_3D_V1__?.enabled?.()));
  await page.evaluate(()=>{
    for(const u of units)if(u.side==='britain')u.dead=true;
    for(const r of regiments)if(r.side==='britain')r.destroyed=true;
    const officer=freeUnits('france','officer')[0];
    selectedUnits.clear();selectedUnits.add(officer);
    actionSignature='';updateHud(true);
  });
  await page.locator('#actions [data-action="create-regiment"]').click();
  const result=await page.evaluate(()=>{
    const reg=selectedRegiments()[0];
    if(!reg)return{error:'regiment was not created from UI'};
    const members=regimentMembers(reg).filter(u=>u.type==='infantry');
    const road=(window.NRTS_ROAD_NETWORK_V7||ROAD_NETWORK_V066).find(r=>r.id==='grande-chaussee');
    const destination=road.points[road.points.length-3];
    issueMoveWithFacingV06(destination.x,destination.y,null);
    const samples=[];
    for(let i=0;i<2200;i++){
      window.RTS_SIM.step(.05);
      if(i%100!==0)continue;
      const m=reg.marchV063,st=window.__MARCH_LAB_LIVE_V253__?.state(reg);
      const moving=!!m && (m.locomotionV064==='road-march'||m.locomotionV064==='bridge-column');
      const angle=m?.marchFacing??0,ss=Math.sin(angle),cc=Math.cos(angle);
      const front=members.map(u=>u.x*cc+u.y*ss);
      const sideways=members.map(u=>-u.x*ss+u.y*cc);
      const ranks=Array.from({length:Math.ceil(members.length/4)},(_,k)=>members.slice(k*4,(k+1)*4));
      const meanRankWidth=ranks.reduce((sum,row)=>{
        const xs=row.map(u=>u.x*cc+u.y*ss);
        return sum+Math.max(...xs)-Math.min(...xs);
      },0)/ranks.length;
      const width=Math.max(...sideways)-Math.min(...sideways);
      samples.push({t:+elapsed.toFixed(1),phase:st?.phase||null,mphase:m?.phase||null,mode:m?.locomotionV064||null,
        route:reg.routePlanV065?.choice||null,anchor:m?[+m.anchorX.toFixed(1),+m.anchorY.toFixed(1)]:null,
        onRoad:m?!!roadAtV064(m.anchorX,m.anchorY):false,
        physicalFiles:width>38&&width<105&&meanRankWidth<13,
        width:+width.toFixed(1),rowMisalign:+meanRankWidth.toFixed(1),
        progress:+(st?.progress||0).toFixed(1),length:+(st?.length||0).toFixed(1),
        position:members.slice(0,8).map(u=>[+u.x.toFixed(0),+u.y.toFixed(0)]),
        actuallyMoving:moving});
    }
    const phys=samples.filter(x=>x.onRoad&&x.actuallyMoving);
    return{infantry:members.length,form:reg.formation,samples,
      physicalVisibleShare:phys.length?phys.filter(x=>x.physicalFiles).length/phys.length:0,
      roadSamples:phys.length,metrics:window.__MARCH_LAB_LIVE_V253__.metrics(),
      rendered:window.NRTS_3D_SOURCE.snapshot().units.includes(members[0]),
      threeD:window.__BATTLEFIELD_3D_V1__.enabled()};
  });
  console.log('PLAYER_VISIBLE_COLUMN_V255',JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.threeD).toBe(true);
  expect(result.rendered).toBe(true);
  expect(errors).toEqual([]);
});