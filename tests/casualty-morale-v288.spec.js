const { test, expect } = require('@playwright/test');

test('v288 witnessed casualties cause local morale shock, while leaders steady a regiment', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    Boolean(window.__CASUALTY_MORALE_V288__?.stats &&
            window.__TOPDOWN_MORALE_V274__?.stateFor &&
            window.__RTS_DEBUG__?.setPeaceMode));

  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const x = 4000, y = 350;
    const fallen = createUnit('britain','infantry',x,y);
    const alone = createUnit('britain','infantry',x+22,y);
    const supported = createUnit('britain','infantry',x+22,y);
    const officer = createUnit('britain','officer',x+35,y+40);
    const drummer = createUnit('britain','drummer',x+35,y-40);
    const far = createUnit('britain','infantry',x+430,y);
    const enemy = createUnit('france','infantry',x+20,y);

    const regId = 982880;
    const reg = { id:regId,side:'britain',kind:'infantry',formation:'line',
      memberIds:[supported.id,officer.id,drummer.id],
      officerId:officer.id,drummerId:drummer.id,morale:90,destroyed:false };
    regiments.push(reg);
    for(const u of [supported,officer,drummer])u.regimentId=regId;
    alone.morale = supported.morale = 26;
    far.morale = enemy.morale = 80;

    const api = window.__CASUALTY_MORALE_V288__;
    const targetBefore = {x:alone.targetX,y:alone.targetY};
    const sampleBefore = api.stats();
    const hypotheticalLeader = api.witnessShock(alone,
      {id:-1,side:'britain',type:'officer',x,y});
    const hypotheticalPrivate = api.witnessShock(alone,
      {id:-2,side:'britain',type:'infantry',x,y});
    const worldSize = {...WORLD};

    applyDamage(fallen,fallen.hp+10,8);
    const afterHit = {
      dead:fallen.dead,
      aloneMorale:alone.morale,supportedMorale:supported.morale,
      farMorale:far.morale,enemyMorale:enemy.morale,
      moraleState:window.__TOPDOWN_MORALE_V274__.stateFor(alone),
      target:{x:alone.targetX,y:alone.targetY},
      stats:api.stats(),
      support:api.supportingRoles(supported)
    };
    applyDamage(fallen,30,8);
    const duplicateStats = api.stats();
    updateUnit(alone,.1);
    const afterTick = { routing:alone.routing, worldSize:{...WORLD} };
    return {
      sampleBefore,hypotheticalLeader,hypotheticalPrivate,
      afterHit,duplicateStats,afterTick,targetBefore,worldSize,
      installed:window.NRTS.subsystems.has('casualty-morale-v288')
    };
  });

  expect(errors).toEqual([]);
  expect(result.installed).toBe(true);
  expect(result.hypotheticalLeader).toBeGreaterThan(result.hypotheticalPrivate);
  expect(result.afterHit.dead).toBe(true);
  expect(result.afterHit.aloneMorale).toBeLessThan(22);
  expect(result.afterHit.supportedMorale).toBeGreaterThan(result.afterHit.aloneMorale);
  expect(result.afterHit.supportedMorale).toBeGreaterThan(22);
  expect(result.afterHit.farMorale).toBe(80);
  expect(result.afterHit.enemyMorale).toBe(80);
  expect(result.afterHit.moraleState).toBe('panicking');
  expect(result.afterHit.target).toEqual(result.targetBefore);
  expect(result.afterHit.support).toEqual({officer:true,drummer:true});
  expect(result.afterHit.stats.deaths).toBe(result.sampleBefore.deaths+1);
  expect(result.duplicateStats).toEqual(result.afterHit.stats);
  expect(result.afterTick.routing).toBe(true);
  expect(result.afterTick.worldSize).toEqual(result.worldSize);
});
