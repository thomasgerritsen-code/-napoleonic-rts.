'use strict';
// v279: CI bridge-column autsim: test the entire regiment physically (including
// the last rank) rather than treating centroid proximity as completed.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

const REPORT=path.join(process.cwd(),'test-results','bridge-column-autosim-v279.json');
test('v279 six real 4-wide regiment routes must clear every bridge without stranded tails',async({page})=>{
  test.setTimeout(230_000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let seed=279711;
    Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.NRTS_NAVIGATION_V2?.active&&
    window.__BRIDGE_FOLLOWER_SAFETY_V1__&&window.__BRIDGE_FORMATION_FLOW_V1__));
  const report=await page.evaluate(()=>{
    // All routes are driven by the exact same production stepping engine,
    // path-planning and column behavior as the playable game.
    const cases=[
      {id:'pont-chaussee',side:-1,count:12,lateral:0},
      {id:'pont-chaussee',side: 1,count:36,lateral:-40},
      {id:'pont-crete',side:-1,count:24,lateral:68},
      {id:'pont-crete',side: 1,count:12,lateral:-45},
      {id:'pont-fermes',side:-1,count:18,lateral:32},
      {id:'pont-fermes',side: 1,count:24,lateral:-26}
    ];
    const results=[];
    for(const spec of cases){
      resetGame();v05PeaceMode=true;gameOver=false;
      for(const u of units)u.dead=true;
      for(const r of regiments)r.destroyed=true;
      selectedUnits.clear();
      const crossing=WATER_CROSSINGS_V067.find(c=>c.id===spec.id);
      if(!crossing||crossing.type!=='bridge'){
        results.push({...spec,ok:false,reasons:['missing-bridge-definition']});continue;
      }
      const side=spec.side,headDist=crossing.length/2+245;
      const members=[];
      for(let i=0;i<spec.count;i++){
        const p=crossingPointV068(crossing,side*(headDist+Math.floor(i/4)*19),
          spec.lateral+(i%4-1.5)*17);
        members.push(createUnit('france','infantry',p.x,p.y));
      }
      for(const [alongOffset,across] of [[43,-15],[43,15]]){
        const p=crossingPointV068(crossing,side*(headDist+alongOffset),
          spec.lateral+across);
        members.push(createUnit('france',alongOffset===43&&across===-15?'officer':'drummer',p.x,p.y));
      }
      const reg=createRegiment('france',members);
      if(!reg){results.push({...spec,ok:false,reasons:['failed-to-create-regiment']});continue;}
      const destination=crossingPointV068(crossing,-side*(crossing.length/2+365),
        -spec.lateral*.18);
      orderGroupPathV06(reg,destination.x,destination.y,'column',
        crossingHeadingV068(crossing,side));
      const route=(reg.routeCrossingsV067||[]).map(c=>c.id);
      const slotOffsets=marchColumnOffsetsV063(reg);
      const initialFiles=new Set(members.filter(u=>u.type==='infantry')
        .map(u=>Math.round(slotOffsets.get(u.id)?.oy*100)/100)).size;
      const direction=-side,limit=crossing.length/2+27;
      let maxWater=0,maxBlocked=0,maxBridge=0,alignedFrames=0;
      let crossedAt=null,steps=0,maxTailStall=0,previousLeader=-Infinity,backtracks=0;
      const perSoldier=new Map(),samples=[];
      for(;steps<4800;steps++){
        gameOver=false; // initial army-clear setup is only for test isolation
        window.RTS_SIM.step(.05);
        if(steps%4!==0)continue;
        const live=members.filter(u=>!u.dead);
        const bridgeSoldiers=[];
        let minAlong=Infinity,maxAlong=-Infinity,water=0,blocked=0;
        for(const u of live){
          const position=crossingLocalV068(crossing,u.x,u.y);
          const along=position.along*direction;
          minAlong=Math.min(minAlong,along);maxAlong=Math.max(maxAlong,along);
          if(waterAtV067(u.x,u.y))water++;
          if(Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&
            segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY))blocked++;
          if(u.type==='infantry'&&Math.abs(position.along)<crossing.length/2-12)
            bridgeSoldiers.push(position.perp);
          // A leader crossing is NOT enough: measure every unfinished follower.
          // Waiting in an active crossing queue is legal; this is a solo case.
          if(along<limit){
            const previous=perSoldier.get(u.id);
            if(!previous||Math.hypot(previous.x-u.x,previous.y-u.y)>2.5)
              perSoldier.set(u.id,{x:u.x,y:u.y,at:elapsed});
            else maxTailStall=Math.max(maxTailStall,elapsed-previous.at);
          }else perSoldier.delete(u.id);
        }
        maxWater=Math.max(maxWater,water);maxBlocked=Math.max(maxBlocked,blocked);
        maxBridge=Math.max(maxBridge,bridgeSoldiers.length);
        if(bridgeSoldiers.length>=8){
          // Actual body positions must populate four distinct 15-unit deck
          // lanes; checking slot metadata alone missed visually broken files.
          const lanes=[-22.5,-7.5,7.5,22.5];
          const occupied=new Set();
          let fitted=0;
          for(const y of bridgeSoldiers){
            let best=0;
            for(let k=1;k<4;k++)
              if(Math.abs(y-lanes[k])<Math.abs(y-lanes[best]))best=k;
            if(Math.abs(y-lanes[best])<=11){occupied.add(best);fitted++;}
          }
          const span=Math.max(...bridgeSoldiers)-Math.min(...bridgeSoldiers);
          if(occupied.size===4&&fitted>=8&&span<=80)alignedFrames++;
        }
        const anchor=reg.marchV063;
        if(anchor){
          const pos=crossingLocalV068(crossing,anchor.anchorX,anchor.anchorY);
          const progress=pos.along*direction;
          if(previousLeader>crossing.length/2+40&&progress<crossing.length/2-20)
            backtracks++;
          previousLeader=Math.max(previousLeader,progress);
        }
        if(steps%200===0&&samples.length<25)samples.push({
          t:+elapsed.toFixed(1),phase:reg.movementPhaseV063,
          crossing:reg.crossingTrafficV068?.state||null,
          min:+minAlong.toFixed(1),max:+maxAlong.toFixed(1),
          onDeck:bridgeSoldiers.length,water,blocked,
          stalled:+maxTailStall.toFixed(1)
        });
        // This is deliberately more strict than the existing map traversal
        // test: every infantryman AND the officer/drummer must be off the deck
        // and physically on the destination bank, not just the centroid.
        if(live.length===members.length&&minAlong>limit&&!water){
          crossedAt=elapsed;break;
        }
        if(maxTailStall>38)break;
      }
      const live=members.filter(u=>!u.dead);
      const stragglers=live.filter(u=>{
        const p=crossingLocalV068(crossing,u.x,u.y);
        return p.along*direction<=limit||waterAtV067(u.x,u.y);
      }).map(u=>({
        id:u.id,type:u.type,x:+u.x.toFixed(1),y:+u.y.toFixed(1),
        along:+(crossingLocalV068(crossing,u.x,u.y).along*direction).toFixed(1),
        targetX:+(u.targetX??0).toFixed(1),targetY:+(u.targetY??0).toFixed(1)
      }));
      const reasons=[];
      if(!route.includes(spec.id))reasons.push('wrong-bridge-route');
      if(initialFiles!==4)reasons.push('not-4-files');
      if(maxBridge<8||alignedFrames<3)reasons.push('physical-deck-formation-failed');
      if(maxWater)reasons.push('unit-in-water');
      if(maxBlocked)reasons.push('unsafe-cross-water-target');
      if(backtracks)reasons.push('uncommanded-return-to-deck');
      if(maxTailStall>38)reasons.push('tail-stuck-over-38s');
      if(live.length!==members.length)reasons.push('missing-soldiers');
      if(crossedAt===null)reasons.push('last-rank-never-cleared');
      results.push({
        ...spec,ok:reasons.length===0,reasons,route,initialFiles,
        memberCount:members.length,alive:live.length,
        crossedAt:crossedAt===null?null:+crossedAt.toFixed(1),
        simSeconds:+(steps*.05).toFixed(1),maxWater,maxBlocked,
        maxBridge,alignedFrames,maxTailStall:+maxTailStall.toFixed(1),
        backtracks,stragglers,samples
      });
    }
    return{version:window.RTS_VERSION,scenarioCount:cases.length,
      passed:results.filter(r=>r.ok).length,results};
  });
  fs.mkdirSync(path.dirname(REPORT),{recursive:true});
  fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
  const errorsInCases=report.results.filter(r=>!r.ok);
  console.log('BRIDGE_COLUMN_AUTOSIM_V279',JSON.stringify({
    version:report.version,passed:report.passed,total:report.scenarioCount,
    failures:errorsInCases}));
  expect(report.scenarioCount).toBe(6);
  expect(errors,errors.join('\n')).toEqual([]);
  expect(errorsInCases,JSON.stringify(errorsInCases,null,2)).toEqual([]);
});
