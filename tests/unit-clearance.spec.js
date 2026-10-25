const {test,expect}=require('@playwright/test');
test.use({trace:'off'});
test('complete starting armies and real trained units have room beside forests, visible roofs, trees and buildings on both sides',async({browser})=>{
 test.setTimeout(60000);const c=await browser.newContext();await c.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('/play.html?view=iso&test=clear-spawn&gpu=off');await p.waitForFunction(()=>window.__UNIT_PLACEMENT__&&window.__ONLINE_SIM_V1__);
  const result=await p.evaluate(()=>{
   // Check geometry independently of the placement predicate itself.
   const houses=(window.VILLAGE_SCENERY_V4||window.__VILLAGE_SCENERY_V4_DATA__).flatMap(v=>v.houses);
   const legal=u=>{const body=({worker:16,infantry:18,drummer:18,officer:38,cavalry:38,artillery:40})[u.type],m=body+24;
    return !waterAtV067(u.x,u.y)&&!TERRAIN_WOODS.some(w=>u.x>w.x-m&&u.x<w.x+w.w+m&&u.y>w.y-m&&u.y<w.y+w.h+m)&&
     !houses.some(h=>{const dx=u.x-h.x,dy=u.y-h.y,c=Math.cos(h.angle||0),s=Math.sin(h.angle||0);return Math.abs(dx*c+dy*s)<h.w*.8+m&&Math.abs(-dx*s+dy*c)<h.h*.8+m;})&&
     !buildings.some(b=>!b.dead&&Math.abs(u.x-b.x)<b.w/2+m&&Math.abs(u.y-b.y)<b.h/2+m)&&
     !resources.some(t=>t.type==='wood'&&!t.dead&&t.amount>0&&(u.x-t.x)**2+(u.y-t.y)**2<(body+38)**2);
   };
   const initial=units.map(u=>({id:u.id,side:u.side,type:u.type,x:u.x,y:u.y,legal:legal(u)}));
   const commands=['france','britain'].map(side=>({side,command:{v:1,seq:1,type:'train',unitIds:[],buildingId:buildings.find(b=>b.side===side&&b.type==='towncenter').id,data:{unitType:'worker'}}}));
   for(let i=0;i<200;i++)__ONLINE_SIM_V1__.advance(i===0?commands:[],true,false,.05);
   const fresh=units.filter(u=>!initial.some(v=>v.id===u.id));const trained=fresh.map(u=>({side:u.side,type:u.type,legal:legal(u),target:legal({...u,x:u.targetX,y:u.targetY})}));
   resetGame();const resetClear=units.length===50&&units.every(legal);
   const layout=[{type:'infantry',dx:0,dy:0}],home=buildings.find(b=>b.side==='france'&&b.type==='towncenter');
   const deterministic=JSON.stringify(__UNIT_PLACEMENT__.formation(home,layout))===JSON.stringify(__UNIT_PLACEMENT__.formation(home,layout));
   const center=centroid(livingUnits('france')),cameraInView=Math.abs(camera.x-center.x)<=innerWidth/(2*camera.zoom)&&Math.abs(camera.y-center.y)<=innerHeight/camera.zoom;
   return{initial,trained,resetClear,deterministic,cameraInView};
  });
  expect(result.initial.filter(u=>u.side==='france')).toHaveLength(25);expect(result.initial.filter(u=>u.side==='britain')).toHaveLength(25);expect(result.initial.every(u=>u.legal)).toBe(true);
  expect(result.trained).toHaveLength(2);expect(result.trained.every(u=>u.legal&&u.target)).toBe(true);expect(result.resetClear).toBe(true);expect(result.deterministic).toBe(true);expect(result.cameraInView).toBe(true);expect(errors).toEqual([]);
 }finally{await c.close();}
});

test('mobile soldiers behind a house stay visible through reused sprites while unseen opponents stay hidden',async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('/play.html?view=iso&test=clear-view&gpu=off');await p.waitForFunction(()=>window.__ISO_ASSETS_READY__&&window.__UNIT_PLACEMENT__);
  await p.evaluate(()=>{
   const home=buildings.find(b=>b.side==='france'&&b.type==='towncenter'),u=units.find(u=>u.side==='france'&&u.type==='infantry');Object.assign(u,{x:home.x,y:home.y-50,targetX:home.x,targetY:home.y-50});camera.x=home.x;camera.y=home.y;camera.zoom=1.6;
  });
  await expect.poll(()=>p.evaluate(()=>__ISO_VIEW_V1__.stats().readabilityOverlays)).toBeGreaterThan(0);expect(await p.evaluate(()=>__ISO_VIEW_V1__.stats().seeThrough)).toBeGreaterThan(0);
  await p.screenshot({path:test.info().outputPath('clearance-mobile-house.png')});
  const r=await p.evaluate(()=>{const hidden=units.filter(u=>u.side==='britain'&&!isVisibleToFrance(u));return{hidden:hidden.length,drawn:__ISO_VIEW_V1__.stats().drawn,visible:units.filter(u=>!u.dead&&(u.side==='france'||isVisibleToFrance(u))).length};});expect(r.hidden).toBe(25);expect(r.drawn).toBeLessThanOrEqual(r.visible);expect(errors).toEqual([]);
 }finally{await c.close();}
});
