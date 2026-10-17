const {test,expect}=require('@playwright/test');

test('normal regiment column uses four physical files for every supported infantry count',async({page})=>{
  test.setTimeout(100000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__MARCH_LAB_LIVE_V253__));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const cases=[];
    for(const count of [12,16,18,24,36]){
      const y=340;
      const infantry=Array.from({length:count},(_,i)=>
        createUnit('france','infantry',650+(i%12)*16,y+Math.floor(i/12)*18));
      const officer=createUnit('france','officer',610,y);
      const drummer=createUnit('france','drummer',610,y+22);
      const reg=createRegiment('france',[...infantry,officer,drummer]);
      if(!reg){cases.push({count,error:'regiment missing'});continue;}
      selectWholeRegiment(reg);
      // This is the same command as the player's Colonne formation button.
      applyFormationNow('column');
      const offsets=regimentRoleOffsets(reg,'column');
      const lateral=[...new Set(infantry.map(u=>offsets.get(u.id)?.ox))];
      const rows=[...new Set(infantry.map(u=>offsets.get(u.id)?.oy))];
      const initialTargets=infantry.map(u=>({x:u.targetX,y:u.targetY}));
      const angle=reg.facing,sideways=p=>-Math.sin(angle)*p.x+Math.cos(angle)*p.y;
      const targetFiles=[...new Set(initialTargets.map(p=>Math.round(sideways(p)*100)/100))].length;
      const xStart=infantry[0].x,yStart=infantry[0].y;
      for(let i=0;i<220;i++)window.RTS_SIM.step(.05);
      const targetAfter=infantry.map(u=>({x:u.targetX,y:u.targetY}));
      const settled=infantry.every((u,i)=>Math.hypot(u.x-initialTargets[i].x,u.y-initialTargets[i].y)<14);
      const retargeted=infantry.filter((u,i)=>Math.hypot(targetAfter[i].x-initialTargets[i].x,targetAfter[i].y-initialTargets[i].y)>4).length;
      const positionFiles=[...new Set(infantry.map(u=>Math.round(sideways(u)/19)))].length;
      const within14=infantry.filter((u,i)=>Math.hypot(u.x-initialTargets[i].x,u.y-initialTargets[i].y)<14).length;
      const maxDeviation=Math.max(...infantry.map((u,i)=>Math.hypot(u.x-initialTargets[i].x,u.y-initialTargets[i].y)));
      cases.push({count,mode:reg.formation,files:lateral.length,rows:rows.length,
        targetFiles,settled,retargeted,positionFiles,within14,maxDeviation,angle,
        firstTargets:initialTargets.slice(0,4),
        firstLateTargets:targetAfter.slice(0,4),
        moved:Math.hypot(infantry[0].x-xStart,infantry[0].y-yStart),
        firstRank:[...infantry.slice(0,4).map(u=>[+u.x.toFixed(2),+u.y.toFixed(2)])]});
      for(const u of [...infantry,officer,drummer])u.dead=true;
      reg.destroyed=true;
    }
    return {cases};
  });
  console.log('MANUAL_COLUMN_V256',JSON.stringify(result));
  expect(result.cases.map(c=>c.count)).toEqual([12,16,18,24,36]);
  for(const item of result.cases){
    expect(item.error).toBeUndefined();
    expect(item.mode).toBe('column');
    expect(item.files,JSON.stringify(item)).toBe(4);
    expect(item.rows).toBe(Math.ceil(item.count/4));
    expect(item.targetFiles).toBe(4);
    // Track physical convergence separately from target geometry; never
    // declare success merely because four intended slots were generated.
    expect(item.within14,JSON.stringify(item)).toBeGreaterThan(item.count*.74);
  }
  expect(errors).toEqual([]);
});
