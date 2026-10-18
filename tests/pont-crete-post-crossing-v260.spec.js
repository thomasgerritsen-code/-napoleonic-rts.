const{test,expect}=require('@playwright/test');
test('v260 Pont Crête reverse square movement finishes after tail and does not freeze at exit',async({page})=>{
 test.setTimeout(90000);
 await page.addInitScript(()=>{let seed=773311;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;}});
 await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.__ROAD_COLUMN_V257__?.singleAuthority&&!!window.RTS_SIM);
 const result=await page.evaluate(()=>{
 resetGame();v05PeaceMode=true;gameOver=false;for(const u of units)u.dead=true;for(const r of regiments)r.destroyed=true;
 const c=WATER_CROSSINGS_V067.find(x=>x.id==='pont-crete'),side=1,lateral=42,distance=c.length/2+210;
 const start=crossingPointV068(c,side*distance,lateral),target=crossingPointV068(c,-side*distance,-lateral*.35);
 const made=[];for(let i=0;i<18;i++)made.push(createUnit('france','infantry',start.x+(i%9)*16,start.y+Math.floor(i/9)*18));
 made.push(createUnit('france','officer',start.x+55,start.y-30));made.push(createUnit('france','drummer',start.x+80,start.y-30));
 const reg=createRegiment('france',made);orderGroupPathV06(reg,target.x,target.y,'square',c.angle+Math.PI);
 let done=false;const samples=[];
 for(let i=0;i<1400;i++){
  window.RTS_SIM.step(.05);if(i%40)continue;
  const members=regimentMembers(reg).filter(u=>!u.dead),center=centroid(members),
    remaining=Math.hypot(center.x-target.x,center.y-target.y),m=reg.marchV063,s=window.__ROAD_COLUMN_V257__.state(reg),
    dir=-side,progress=members.map(u=>crossingLocalV068(c,u.x,u.y).along*dir),a=m?crossingLocalV068(c,m.anchorX,m.anchorY):null,
    wp=reg.path?.[reg.pathIndex],goalLocal=crossingLocalV068(c,target.x,target.y);
  if(i%200===0||i>650&&i%80===0)samples.push({t:+elapsed.toFixed(1),remaining:+remaining.toFixed(1),
    pathIndex:reg.pathIndex,pathCount:reg.path?.length||0,
    anchor:a?{along:+(a.along*dir).toFixed(1),perp:+a.perp.toFixed(1)}:null,
    wp:wp?crossingLocalV068(c,wp.x,wp.y):null,goalLocal,
    min:+Math.min(...progress).toFixed(1),max:+Math.max(...progress).toFixed(1),
    state:s,traffic:reg.crossingTrafficV068?.state||null,phase:m?.phase||null,
    worst:(()=>{const u=members.reduce((w,u)=>crossingLocalV068(c,u.x,u.y).along*dir<crossingLocalV068(c,w.x,w.y).along*dir?u:w,members[0]);const q=crossingLocalV068(c,u.x,u.y);const p=crossingLocalV068(c,u.targetX,u.targetY);const delta=5*dir;const next=crossingPointV068(c,q.along+delta,q.perp);return {id:u.id,type:u.type,progress:q.along*dir,perp:q.perp,targetProgress:p.along*dir,targetPerp:p.perp,water:waterAtV067(u.x,u.y),nextWater:waterAtV067(next.x,next.y),nextBlocked:segmentCrossesBlockedWaterV067(u.x,u.y,next.x,next.y),targetBlocked:segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY),routing:u.routing};})(),
    skipped:window.__ROAD_COLUMN_V257__.metrics().staleBridgeWaypointsSkipped,
    caps:window.__ROAD_COLUMN_V257__.metrics().bridgeAnchorCaps});
  if(members.every(u=>crossingLocalV068(c,u.x,u.y).along*dir>c.length/2+24)||
    (reg.path?.length===0&&remaining<100)){done=true;break;}
 }
 const center=centroid(made),remaining=Math.hypot(center.x-target.x,center.y-target.y);
 return{done,remaining,final:samples.slice(-8),all:samples};
 });
 console.log('V260_PONT_CRETE_EXIT_STALL',JSON.stringify(result));
 expect(result.done,JSON.stringify(result.final)).toBe(true);
});
