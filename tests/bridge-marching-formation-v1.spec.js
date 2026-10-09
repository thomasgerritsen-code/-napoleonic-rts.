const { test, expect } = require('@playwright/test');

test('Pont de la Crête forms two marching files before the bridge, maintains them across the deck, then reforms line', async ({page}) => {
  test.setTimeout(120_000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => {
    let seed=22051996;
    Math.random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__BRIDGE_FORMATION_FLOW_V1__&&window.NRTS_NAVIGATION_V2?.active));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const c=WATER_CROSSINGS_V067.find(x=>x.id==='pont-crete');
    const side=-1,heading=crossingHeadingV068(c,side);
    // Actual western off-axis approach from the player's Crete area; both
    // endpoints are close enough to prefer this bridge rather than Chaussée.
    const start=crossingPointV068(c,side*(c.length/2+260),110);
    const goal=crossingPointV068(c,c.length/2+360,-25);
    const members=[];
    for(let i=0;i<24;i++)members.push(createUnit('france','infantry',start.x+(i%12)*12,start.y+Math.floor(i/12)*16));
    members.push(createUnit('france','officer',start.x+35,start.y-22));
    members.push(createUnit('france','drummer',start.x+55,start.y-22));
    const reg=createRegiment('france',members);
    orderGroupPathV06(reg,goal.x,goal.y,'line',heading);
    const chosen=(reg.routeCrossingsV067||[]).map(c=>c.id);
    let before=null,deck=null,cleared=false,regainedLine=false,water=0,startedAt=elapsed;
    const samples=[];
    function snapshot(label) {
      const live=regimentMembers(reg).filter(u=>!u.dead);
      const local=live.map(u=>{
        const q=crossingLocalV068(c,u.x,u.y);
        const target=crossingLocalV068(c,u.targetX,u.targetY);
        return{id:u.id,type:u.type,along:q.along,perp:q.perp,targetAlong:target.along,targetPerp:target.perp,
          water:waterAtV067(u.x,u.y)};
      });
      const active=local.filter(u=>u.type==='infantry');
      const inDeck=active.filter(u=>Math.abs(u.along)<c.length/2-10);
      const perpValues=active.map(u=>u.perp);
      const targetPerpValues=active.map(u=>u.targetPerp);
      const offsets=reg.marchV063?.slotOffsetsV064||new Map();
      const alongOffsets=[...offsets.values()].map(x=>x.ox);
      const sidewaysOffsets=[...offsets.values()].map(x=>x.oy);
      return{label,at:+elapsed.toFixed(2),
        phase:reg.movementPhaseV063,traffic:reg.crossingTrafficV068?.state||null,
        anchor:reg.marchV063?crossingLocalV068(c,reg.marchV063.anchorX,reg.marchV063.anchorY):null,
        inDeck:inDeck.length,across:active.filter(u=>u.along>c.length/2+22).length,
        spanPerp:Math.max(...perpValues)-Math.min(...perpValues),
        targetSpanPerp:Math.max(...targetPerpValues)-Math.min(...targetPerpValues),
        targetWidthOffsets:Math.max(...sidewaysOffsets)-Math.min(...sidewaysOffsets),
        offsetFrontBack:Math.max(...alongOffsets)-Math.min(...alongOffsets),
        deckSpanPerp:inDeck.length?Math.max(...inDeck.map(u=>u.perp))-Math.min(...inDeck.map(u=>u.perp)):null,
        water:local.filter(u=>u.water).length,
        formation:reg.formation,local};
    }
    for(let i=0;i<6000;i++){
      window.RTS_SIM.step(.05);
      if(i%10)continue;
      const info=reg.crossingTrafficV068;
      const march=reg.marchV063;
      const along=march?crossingLocalV068(c,march.anchorX,march.anchorY).along:null;
      const live=regimentMembers(reg).filter(u=>!u.dead);
      water=Math.max(water,live.filter(u=>waterAtV067(u.x,u.y)).length);
      if(!before&&info?.forcedColumn&&along!==null&&along<-c.length/2-65&&along>-c.length/2-120)
        before=snapshot('before-mouth');
      const onDeck=live.filter(u=>u.type==='infantry'&&Math.abs(crossingLocalV068(c,u.x,u.y).along)<c.length/2-10);
      if(info?.state==='crossing'&&onDeck.length>=8&&(!deck||onDeck.length>deck.inDeck))deck=snapshot('on-deck');
      if(!cleared&&live.every(u=>crossingLocalV068(c,u.x,u.y).along>c.length/2+25)){
        cleared=true;
      }
      if(cleared&&reg.movementPhaseV063==='formed'){
        regainedLine=true;
        samples.push(snapshot('reformed'));break;
      }
    }
    return{chosen,before,deck,cleared,regainedLine,water,finalReg:reg.movementPhaseV063,
      stats:window.__BRIDGE_FORMATION_FLOW_V1__.stats(),samples};
  });
  const compact=(p)=>p&&{phase:p.phase,traffic:p.traffic,at:p.at,anchor:p.anchor,inDeck:p.inDeck,
    spanPerp:p.spanPerp,targetSpanPerp:p.targetSpanPerp,targetWidthOffsets:p.targetWidthOffsets,
    offsetFrontBack:p.offsetFrontBack,deckSpanPerp:p.deckSpanPerp,water:p.water};
  console.log('BRIDGE_MARCHING_FORMATION',JSON.stringify({chosen:result.chosen,before:compact(result.before),deck:compact(result.deck),cleared:result.cleared,regainedLine:result.regainedLine,water:result.water,stats:result.stats}));
  expect(result.chosen).toEqual(['pont-crete']);
  expect(result.before).not.toBeNull();
  // A paper-perfect target is insufficient: troops must actually close
  // into recognizable marching files before entering the bridge mouth.
  expect(result.before.targetWidthOffsets).toBeLessThanOrEqual(20);
  expect(result.before.spanPerp).toBeLessThanOrEqual(65);
  expect(result.before.offsetFrontBack).toBeGreaterThan(125);
  expect(result.deck).not.toBeNull();
  expect(result.deck.inDeck).toBeGreaterThanOrEqual(8);
  expect(result.deck.targetWidthOffsets).toBeLessThanOrEqual(20);
  expect(result.deck.offsetFrontBack).toBeGreaterThan(125);
  expect(result.deck.deckSpanPerp).toBeLessThanOrEqual(35);
  expect(result.water).toBe(0);
  expect(result.cleared).toBe(true);
  expect(result.regainedLine).toBe(true);
  expect(errors).toEqual([]);
});
