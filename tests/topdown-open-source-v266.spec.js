const{test,expect}=require('@playwright/test');

test('v262-v266 2D march, black-powder effects, user-unlocked audio and utility AI',async({page})=>{
  test.setTimeout(100000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_MARCH_V262__&&
      window.__TOPDOWN_EFFECTS_V264__&&window.__TOPDOWN_AUDIO_V265__&&window.__TOPDOWN_TACTICS_V266__));
  const first=await page.evaluate(()=>{
    const march=window.__TOPDOWN_MARCH_V262__,effect=window.__TOPDOWN_EFFECTS_V264__,
      audio=window.__TOPDOWN_AUDIO_V265__,ai=window.__TOPDOWN_TACTICS_V266__;
    // v281 expanded the battlefield: sample visible units so camera culling
    // does not intentionally skip their animation hooks.
    const attacker=createUnit('france','infantry',camera.x,camera.y);
    const defender=createUnit('britain','infantry',camera.x+55,camera.y);
    attacker.targetX=attacker.x+320;attacker.targetY=attacker.y;
    drawUnit(attacker);
    const idleSpeed=march.speedFor(attacker);
    window.RTS_SIM.step(.05);
    // Sample real displacement after a guaranteed positive visual-clock step.
    elapsed+=.1;
    attacker.x+=5;drawUnit(attacker);
    const moveSpeed=march.speedFor(attacker);
    const before={x:attacker.x,y:attacker.y};
    attacker.reload=-1;
    const shots=effect.stats().shots;
    fire(attacker,defender);
    drawUnit(attacker);drawParticles();
    const after={x:attacker.x,y:attacker.y};
    const condition=ai.condition({memberIds:[attacker.id],side:'france'});
    const choices=ai.flankPressure({x:1200,y:800},{x:800,y:800},[
      {x:1200,y:550,morale:100,type:'infantry'}
    ]);
    return{
      versions:[march.version,effect.version,audio.version,ai.version],
      idleSpeed,moveSpeed,shoot:effect.stats().shots-shots,
      effects:effect.stats(),before,after,audioBefore:audio.stats(),
      ai2d:ai.stats().activeOnlyIn2D,flank:ai.weakerSide(choices),
      condition,subsystems:['topdown-march-v262','topdown-effects-v264','topdown-audio-v265','topdown-tactics-v266'].map(n=>NRTS.subsystems.has(n)),
      has2dCanvas:!!document.getElementById('game')
    };
  });
  console.log('TOPDOWN_OPEN_SOURCE_V266',JSON.stringify(first));
  expect(errors).toEqual([]);
  expect(first.versions).toEqual(['262.0','264.0','265.0','266.0']);
  expect(first.subsystems).toEqual([true,true,true,true]);
  expect(first.has2dCanvas).toBe(true);
  expect(first.idleSpeed).toBe(0);
  expect(first.moveSpeed).toBeGreaterThan(10);
  expect(first.shoot).toBe(1);
  expect(first.before).toEqual(first.after);
  expect(first.audioBefore.enabled).toBe(false);
  expect(first.ai2d).toBe(true);
  expect(first.flank).toBe(1);
  expect(first.condition).toBeGreaterThan(.01);
  expect(first.effects.active).toBeGreaterThan(0);
  expect(first.effects.active).toBeLessThanOrEqual(first.effects.cap);
  const toggle=page.locator('#topdown-audio-toggle');
  await expect(toggle).toHaveText(/Geluid aan/);
  await toggle.click();
  const audioAfter=await page.evaluate(()=>window.__TOPDOWN_AUDIO_V265__.stats());
  console.log('TOPDOWN_SOUND_V265',JSON.stringify(audioAfter));
  expect(audioAfter.unlockAttempts).toBe(1);
  expect(audioAfter.enabled).toBe(true);
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(errors).toEqual([]);
});

