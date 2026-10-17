const {test,expect}=require('@playwright/test');
test('DIAGNOSTIC: real infantry visibly form four physical files during an ordinary player road march',async({page})=>{
  test.setTimeout(100000);
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__MARCH_LAB_LIVE_V253__));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const made=[];
    for(let i=0;i<24;i++)made.push(createUnit('france','infantry',780+(i%6)*12,880+Math.floor(i/6)*15));
    made.push(createUnit('france','officer',750,900));
    made.push(createUnit('france','drummer',750,920));
    const reg=createRegiment('france',made);
    selectWholeRegiment(reg);
    issueMoveWithFacingV06(1850,895,null);
    const samples=[];
    const feet=made.filter(u=>u.type==='infantry');
    for(let i=0;i<300;i++){
      window.RTS_SIM.step(.05);
      if(i%20!==0)continue;
      const st=window.__MARCH_LAB_LIVE_V253__.state(reg);
      const m=reg.marchV063;
      const heading=m?.marchFacing??0;
      const dir={x:Math.cos(heading),y:Math.sin(heading)};
      const lateral=feet.map(u=>-u.x*dir.y+u.y*dir.x);
      const forward=feet.map(u=>u.x*dir.x+u.y*dir.y);
      const byFile=Array.from({length:4},(_,f)=>feet.filter((u,k)=>k%4===f));
      const fileMeans=byFile.map(row=>row.reduce((s,u)=>s-u.x*dir.y+u.y*dir.x,0)/row.length);
      const fileSpread=fileMeans.length?Math.max(...fileMeans)-Math.min(...fileMeans):0;
      const ranks=Array.from({length:6},(_,rank)=>feet.slice(rank*4,rank*4+4));
      const rankWidths=ranks.map(row=>{
        const v=row.map(u=>u.x*dir.x+u.y*dir.y);return Math.max(...v)-Math.min(...v);
      });
      const rowDeviations=ranks.map(row=>{
        const x=row.map(u=>-u.x*dir.y+u.y*dir.x);return Math.max(...x)-Math.min(...x);
      });
      const idealSide=[-27,-9,9,27];
      const center=(Math.min(...lateral)+Math.max(...lateral))/2;
      const aligned=feet.filter((u,k)=>Math.abs(lateral[k]-center-idealSide[k%4])<11).length;
      samples.push({t:+elapsed.toFixed(1),mode:m?.locomotionV064,
        mphase:m?.phase,phase:st?.phase,files:st?.files,
        anchor:m?[+m.anchorX.toFixed(1),+m.anchorY.toFixed(1)]:null,
        lateralSpan:+(Math.max(...lateral)-Math.min(...lateral)).toFixed(1),
        forwardSpan:+(Math.max(...forward)-Math.min(...forward)).toFixed(1),
        fileSpread:+fileSpread.toFixed(1),
        rankWidthMax:+Math.max(...rankWidths).toFixed(1),
        rowDeviationMean:+(rowDeviations.reduce((a,b)=>a+b,0)/6).toFixed(1),
        aligned,slots:feet.slice(0,8).map(u=>[+u.x.toFixed(1),+u.y.toFixed(1)])});
    }
    return{samples,metrics:window.__MARCH_LAB_LIVE_V253__.metrics(),counts:feet.length};
  });
  console.log('VISIBLE_ROAD_COLUMN_DIAGNOSTIC',JSON.stringify(result));
  expect(result.counts).toBe(24);
  expect(result.samples.length).toBeGreaterThan(10);
});