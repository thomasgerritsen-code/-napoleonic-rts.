const {test,expect}=require('@playwright/test');

async function open(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.setPeaceMode&&window.__RTS_DEBUG__?.grantResources));
  return errors;
}

test('v292 opening has no free cannons, iron ore deposits and zero initial iron',async({page})=>{
  const errors=await open(page);
  const state=await page.evaluate(()=>{
    resetGame();
    return {
      guns:{france:livingUnits('france').filter(u=>u.type==='artillery').length,
        britain:livingUnits('britain').filter(u=>u.type==='artillery').length},
      iron:{france:economies.france.iron,britain:economies.britain.iron},
      ore:resources.filter(r=>!r.dead&&r.type==='iron').length,
      ironHud:document.querySelector('#iron')?.textContent,
      cannonRecipe:TRAINING.artillery,
      foundryCost:BUILDINGS.foundry.cost
    };
  });
  expect(errors).toEqual([]);
  expect(state.guns).toEqual({france:0,britain:0});
  expect(state.iron).toEqual({france:0,britain:0});
  expect(state.ore).toBeGreaterThanOrEqual(15);
  expect(state.ironHud).toBe('0');
  expect(state.cannonRecipe.cost.iron).toBe(160);
  expect(state.cannonRecipe.time).toBeGreaterThanOrEqual(24);
  expect(state.foundryCost.iron).toBeGreaterThanOrEqual(90);
});

test('v292 French miners deliver iron and new foundry plus cannon spend its stock',async({page})=>{
  const errors=await open(page);
  const result=await page.evaluate(()=>{
    __RTS_DEBUG__.setPeaceMode(true);resetGame();
    const worker=livingUnits('france').find(u=>u.type==='worker');
    const ore=nearestResource('iron',worker.x,worker.y);
    const initialOre=ore.amount;
    assignWorkerToResource(worker,ore);
    worker.x=ore.x;worker.y=ore.y;
    for(let i=0;i<5;i++)updateWorker(worker,.5);
    const carrying={type:worker.carryType,qty:worker.carry,task:worker.task};
    const town=livingBuildings('france').find(b=>b.type==='towncenter');
    worker.x=town.x;worker.y=town.y;
    updateWorker(worker,.3);
    const delivered=economies.france.iron;
    const ironRemaining=ore.amount;
    const canBuildBefore=canAfford('france',BUILDINGS.foundry.cost);
    const canTrainBefore=canAfford('france',TRAINING.artillery.cost);
    const beforeFoundry={food:economies.france.food,wood:economies.france.wood,iron:economies.france.iron};
    __RTS_DEBUG__.grantResources('france',200,500,150);
    let spot=null;
    for(let x=1050;x<1550&&!spot;x+=90)for(let y=450;y<1600&&!spot;y+=130)
      if(validBuildingSpot('foundry',x,y))spot={x,y};
    const factory=constructBuilding('france','foundry',spot?.x,spot?.y,[]);
    if(!factory)return{carrying,delivered,ironRemaining,canBuildBefore,canTrainBefore,beforeFoundry,spot,buildError:true};
    factory.complete=true;
    elapsed=70;
    const early=queueUnitForBuilding('france',factory,'artillery');
    elapsed=121;
    const before=economies.france.iron;
    const queued=queueUnitForBuilding('france',factory,'artillery');
    const after=economies.france.iron;
    const incorrectBuilding=queueUnitForBuilding('france',town,'artillery');
    return{carrying,delivered,ironRemaining,initialOre,canBuildBefore,canTrainBefore,
      beforeFoundry,spot,buildError:false,early,queued,before,after,
      incorrectBuilding,queue:factory.queue.map(q=>q.type)};
  });
  expect(errors).toEqual([]);
  expect(result.buildError).toBe(false);
  expect(result.carrying).toEqual({type:'iron',qty:25,task:'return'});
  expect(result.delivered).toBe(25);
  expect(result.initialOre-result.ironRemaining).toBe(25);
  expect(result.canBuildBefore).toBe(false);
  expect(result.canTrainBefore).toBe(false);
  expect(result.early).toBe(false);
  expect(result.queued).toBe(true);
  expect(result.before-result.after).toBe(160);
  expect(result.queue).toEqual(['artillery']);
  expect(result.incorrectBuilding).toBe(false);
});

test('v292 AI assigns late-game iron miners without spawning free artillery',async({page})=>{
  const errors=await open(page);
  const r=await page.evaluate(()=>{
    resetGame();
    elapsed=110;
    autoAssignAIWorkers();
    const workers=livingUnits('britain').filter(u=>u.type==='worker');
    const ore=resources.filter(r=>!r.dead&&r.type==='iron');
    const miners=workers.filter(u=>u.preferredResourceType==='iron' && u.resourceTarget?.type==='iron');
    const guns=livingUnits('britain').filter(u=>u.type==='artillery');
    return{miners:miners.length,ore:ore.length,guns:guns.length,balance:economies.britain.iron,
      plans:miners.map(u=>({type:u.resourceTarget.type,task:u.task}))};
  });
  expect(errors).toEqual([]);
  expect(r.miners).toBeGreaterThanOrEqual(1);
  expect(r.ore).toBeGreaterThanOrEqual(15);
  expect(r.guns).toBe(0);
  expect(r.balance).toBe(0);
});
