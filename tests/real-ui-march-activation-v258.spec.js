const {test,expect}=require('@playwright/test');

test('v258 real 3D tap-to-move WITHOUT drag facing starts four-file road march for 12 and 36 infantry',async({page})=>{
  test.setTimeout(95000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.NRTS_3D_SOURCE?.dispatch&&
    window.__ROAD_COLUMN_V257__?.singleAuthority&&
    window.__RTS_FORMATION_FACING_V146__?.active));
  const result=await page.evaluate(()=>{
    const rows=[];
    const road=ROAD_NETWORK_V066.find(x=>x.id==='grande-chaussee');
    const start=road?.points[1],target=road?.points[4];
    if(!start||!target)return{error:'missing road waypoints'};
    for(const count of [12,36]){
      resetGame();v05PeaceMode=true;gameOver=false;
      for(const u of units)u.dead=true;
      for(const g of regiments)g.destroyed=true;
      selectedUnits.clear();
      const members=[];
      for(let i=0;i<count;i++)members.push(createUnit('france','infantry',
        start.x+(i%4)*17,start.y+Math.floor(i/4)*19));
      members.push(createUnit('france','officer',start.x-25,start.y-22));
      members.push(createUnit('france','drummer',start.x-25,start.y+22));
      const reg=createRegiment('france',members);
      if(!reg){rows.push({count,error:'no regiment'});continue;}
      const selected=window.NRTS_3D_SOURCE.dispatch({type:'select-group',id:reg.id});
      // Exactly the command 3D iPhone single-tap dispatches (NO facing).
      const accepted=window.NRTS_3D_SOURCE.dispatch({type:'move',x:target.x,y:target.y});
      const commandPath=reg.path?.length||0;
      const commandMarch=Boolean(reg.marchV063?.v064);
      for(let i=0;i<110;i++)window.RTS_SIM.step(.05);
      const controller=window.__ROAD_COLUMN_V257__.state(reg);
      const infantry=regimentMembers(reg).filter(u=>u.type==='infantry');
      const heading=reg.marchV063?.marchFacing??0;
      const side=u=>-u.x*Math.sin(heading)+u.y*Math.cos(heading);
      const files=infantry.slice(0,4).map(u=>+side(u).toFixed(1));
      const width=Math.max(...files)-Math.min(...files);
      rows.push({count,selected,accepted,commandPath,commandMarch,
        controller,roadAtAnchor:reg.marchV063?roadAtV064(reg.marchV063.anchorX,reg.marchV063.anchorY):null,
        physicalFileWidth:width,positions:infantry.slice(0,4).map(u=>[+u.x.toFixed(1),+u.y.toFixed(1)]),
        status:statusEl.textContent});
    }
    return{rows,metrics:window.__ROAD_COLUMN_V257__.metrics()};
  });
  console.log('REAL_UI_MARCH_ACTIVATION_258',JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.rows).toHaveLength(2);
  for(const row of result.rows){
    expect(row.selected).toBe(true);
    expect(row.accepted).toBe(true);
    expect(row.commandPath,JSON.stringify(row)).toBeGreaterThan(0);
    expect(row.commandMarch,JSON.stringify(row)).toBe(true);
    expect(row.controller?.active,JSON.stringify(row)).toBe(true);
    expect(row.controller?.files).toBe(4);
    expect(row.physicalFileWidth,JSON.stringify(row)).toBeGreaterThan(35);
  }
  expect(errors).toEqual([]);
});
