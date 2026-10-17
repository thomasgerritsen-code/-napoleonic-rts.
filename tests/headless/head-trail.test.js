'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const trailPromise=import('../../march-lab/head-trail.mjs');
test('four fixed files follow the leader around both corners of a long winding route',async()=>{
  const {HeadTrail}=await trailPromise;
  const t=new HeadTrail({limit:800});
  const route=[{x:0,y:0},{x:360,y:0},{x:360,y:240},{x:900,y:240}];
  t.reset(0,0,0);
  for(let k=1;k<route.length;k++){
    const a=route[k-1],b=route[k],d=Math.hypot(b.x-a.x,b.y-a.y);
    for(let s=1;s<=Math.ceil(d/2);s++){
      const w=Math.min(1,s*2/d);
      t.record(a.x+(b.x-a.x)*w,a.y+(b.y-a.y)*w);
    }
  }
  assert.ok(t.length>=650);
  const laneGap=18,rankGap=20;
  const files=[];
  for(let rank=0;rank<32;rank++){
    const center=t.sample(rank*rankGap);
    const row=Array.from({length:4},(_,file)=>{
      const side=(file-1.5)*laneGap;
      return {x:center.x-Math.sin(center.angle)*side,
              y:center.y+Math.cos(center.angle)*side,angle:center.angle};
    });
    for(let f=1;f<4;f++)
      assert.ok(Math.abs(Math.hypot(row[f].x-row[f-1].x,row[f].y-row[f-1].y)-laneGap)<1e-6);
    files.push(row);
  }
  // Front rank follows the last straight; rear ranks must still turn.
  assert.ok(Math.abs(files[0][0].angle-files[29][0].angle)>1.2);
  assert.ok(Math.abs(files[0][0].x-files[15][0].x)>200);
});
test('head trail survives arbitrarily long marches without resetting at 1800 units',async()=>{
  const {HeadTrail}=await trailPromise;
  const t=new HeadTrail();
  t.reset(0,50,0);
  for(let x=2;x<=5000;x+=2)t.record(x,50);
  assert.ok(t.length>=720);
  assert.ok(t.points.length<500);
  assert.ok(Math.abs(t.sample(180).x-4820)<3);
  assert.ok(Math.abs(t.sample(180).y-50)<.001);
});
test('leader replan can preserve track, but discontinuous jumps reset safely',async()=>{
  const {HeadTrail}=await trailPromise;
  const t=new HeadTrail();
  t.reset(0,0,0);
  for(let x=3;x<200;x+=3)t.record(x,0);
  const old=t.sample(100);
  // A path array change must not reorder soldiers or clear their history.
  t.record(200,0);
  assert.ok(Math.abs(old.x-t.sample(103).x)<4);
  t.record(1000,1000);
  assert.equal(t.points.length,1);
  assert.ok(t.sample(100).x<1000);
});
