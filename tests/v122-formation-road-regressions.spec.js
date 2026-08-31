const { test, expect } = require('@playwright/test');

async function openGame(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v122regression',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.NRTS_NAVIGATION_V2?.active&&window.__COMMAND_ROLE_CROSSING_V1__));
  return errors;
}

test('drummer remains committed to the battalion and clears the bridge',async({page})=>{
  const errors=await openGame(page);
  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(true);
    const c=WATER_CROSSINGS_V067.find(x=>x.id==='pont-chaussee');
    const corridor=window.NRTS_NAVIGATION_V2.bridgeCorridor(c.id,-1);
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',corridor.approach.x-90,corridor.approach.y+35);
    const reg=getRegiment(id),drummer=units.find(u=>u.id===reg.drummerId);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(corridor.clear.x+260,corridor.clear.y,0);
    let crossed=false,everWater=false;
    for(let i=0;i<1500;i++){
      window.RTS_SIM.step(.05);
      everWater=everWater||waterAtV067(drummer.x,drummer.y);
      const q=crossingLocalV068(c,drummer.x,drummer.y);
      if(q.along>c.length/2+45){crossed=true;break;}
    }
    return{crossed,everWater,drummerType:drummer.type,regimentId:drummer.regimentId,stats:window.__COMMAND_ROLE_CROSSING_V1__.stats()};
  });
  expect(result.drummerType).toBe('drummer');
  expect(result.regimentId).toBeTruthy();
  expect(result.crossed).toBe(true);
  expect(result.everWater).toBe(false);
  expect(result.stats.drummerCorrections).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('route planner again chooses a meaningful faster road route when one exists',async({page})=>{
  const errors=await openGame(page);
  const result=await page.evaluate(()=>{
    const pairs=[
      [{x:520,y:610},{x:2710,y:1210}],
      [{x:620,y:1260},{x:2720,y:610}],
      [{x:760,y:520},{x:2520,y:1320}],
      [{x:520,y:1080},{x:2850,y:820}],
      [{x:820,y:1320},{x:2540,y:540}]
    ];
    const plans=[];
    for(const [start,goal] of pairs){
      const path=buildRegimentPathV06(start,goal);
      plans.push(path?.v065Plan||null);
    }
    return{plans,graph:window.NRTS_ROAD_GRAPH_V2};
  });
  const roadPlans=result.plans.filter(p=>p?.choice==='road');
  expect(result.graph.roadPreferenceV122).toBe(true);
  expect(roadPlans.length).toBeGreaterThan(0);
  expect(roadPlans.some(p=>p.roadDistance>=180&&p.roadShare>=0.18)).toBe(true);
  expect(roadPlans.some(p=>p.chosenTime<=p.directTime*1.03)).toBe(true);
  expect(errors).toEqual([]);
});
