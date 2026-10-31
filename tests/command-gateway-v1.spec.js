const {test,expect} = require('@playwright/test');
test.beforeEach(async({page}) => {
  await page.goto('/?test=commands');
  await page.waitForFunction(() => !!window.__COMMAND_GATEWAY_V1__);
});
test('real movement inputs serialize one command despite nested movement hooks', async({page}) => {
  const result = await page.evaluate(() => {
    selectedUnits.clear(); selectedBuilding=null;
    const unit=units.find(u => u.side==='france'&&!u.dead&&u.type==='infantry');
    selectedUnits.add(unit);issueMoveWithFacingV06(unit.x+100,unit.y,.4);
    const first=window.__COMMAND_GATEWAY_V1__.history();
    issueMove(unit.x+140,unit.y+50);
    return {id:unit.id, first, history:window.__COMMAND_GATEWAY_V1__.history(),stats:window.__COMMAND_GATEWAY_V1__.stats()};
  });
  expect(result.first).toHaveLength(1);expect(result.first[0].command.data.facing).toBe(.4);
  expect(result.history).toHaveLength(2);expect(result.history[0].command.unitIds).toEqual([result.id]);
  expect(result.history[1].command.seq).toBe(2);
});
test('ID commands work independently of UI selection and reject enemy control and replays', async({page}) => {
  const result=await page.evaluate(() => {
    const own=units.find(u=>u.side==='france'&&u.type==='infantry'),enemy=units.find(u=>u.side==='britain'&&u.type==='infantry');
    selectedUnits.clear();selectedUnits.add(own);
    const raw={v:1,seq:1,type:'move',unitIds:[own.id],buildingId:null,data:{x:own.x+70,y:own.y}};
    const beforeEnemy=[enemy.targetX,enemy.targetY];
    const first=window.__COMMAND_GATEWAY_V1__.dispatch(raw);
    const replay=window.__COMMAND_GATEWAY_V1__.dispatch(raw);
    const attack=window.__COMMAND_GATEWAY_V1__.dispatch({...raw,seq:2,unitIds:[enemy.id]});
    return {first:first.ok,replay:replay.reason,attack:attack.reason,selection:[...selectedUnits].map(u=>u.id),id:own.id,enemyUnchanged:enemy.targetX===beforeEnemy[0]&&enemy.targetY===beforeEnemy[1]};
  });
  expect(result.first).toBe(true);expect(result.replay).toBe('stale-sequence');expect(result.attack).toBe('unit-not-owned');
  expect(result.selection).toEqual([result.id]);expect(result.enemyUnchanged).toBe(true);
});
test('training still pays the real price and command history resets with a new battle', async({page}) => {
  const result=await page.evaluate(() => {
    selectedUnits.clear();selectedBuilding=buildings.find(b=>b.side==='france'&&b.type==='towncenter');
    const before=economies.france.food;queuePlayerUnit('worker');
    const after=economies.france.food,queued=selectedBuilding.queue.length;
    const history=window.__COMMAND_GATEWAY_V1__.history();
    resetGame();return {paid:before-after,cost:TRAINING.worker.cost.food,queued,history,afterReset:window.__COMMAND_GATEWAY_V1__.stats()};
  });
  expect(result.paid).toBe(result.cost);expect(result.queued).toBe(1);expect(result.history[0].command.type).toBe('train');expect(result.afterReset.retained).toBe(0);expect(result.afterReset.seq).toBe(0);
});
