const { test, expect } = require('@playwright/test');

test('Character Visuals v1 owns non-artillery top-down character rendering', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__CHARACTER_VISUALS_V1__&&window.NRTS?.subsystems.has('character-renderer')));

  const result=await page.evaluate(()=>{
    const api=window.__CHARACTER_VISUALS_V1__;
    const snapshot=window.NRTS.diagnostics.snapshot();
    const meta=snapshot.subsystems.find(s=>s.name==='character-renderer')?.meta;
    const base={id:101,x:0,y:0,targetX:0,targetY:0,routing:false,carry:0,chargeTimer:0};
    return {
      version:api.version,
      types:[...api.supportedTypes],
      meta,
      states:{
        idle:api.stateFor({...base,type:'infantry'}),
        moving:api.stateFor({...base,type:'infantry',targetX:40}),
        marching:api.stateFor({...base,type:'infantry',targetX:40,marchingV064:true}),
        gathering:api.stateFor({...base,type:'worker',task:'gather'}),
        building:api.stateFor({...base,type:'worker',task:'build'}),
        carrying:api.stateFor({...base,type:'worker',task:'return',carry:20}),
        charging:api.stateFor({...base,type:'cavalry',chargeTimer:5}),
        routing:api.stateFor({...base,type:'infantry',routing:true})
      }
    };
  });

  expect(result.version).toBe('character-visuals-v1');
  expect(result.types).toEqual(['worker','infantry','officer','drummer','cavalry']);
  expect(result.meta?.phase).toBe('architecture-v2');
  expect(result.meta?.legacyBridge).toBe(false);
  expect(result.states).toEqual({
    idle:'idle',moving:'moving',marching:'marching',gathering:'gathering',building:'building',carrying:'carrying',charging:'charging',routing:'routing'
  });

  // Let several real frames render all initial unit categories; the character layer must not throw.
  await page.evaluate(()=>window.RTS_SIM.step(.5));
  expect(errors).toEqual([]);
});
