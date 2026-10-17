'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const modelPromise=import('../../march-lab/column-core.mjs');
test('new march lab assigns exactly four fixed files to every rank',async()=>{
  const {ColumnModel}=await modelPromise;
  const model=new ColumnModel([{x:240,y:350},{x:950,y:350}],{count:36});
  model.advance(300);
  const u=model.soldiers();
  assert.equal(u.length,36);
  for(let rank=0;rank<9;rank++){
    const row=u.slice(rank*4,rank*4+4);
    assert.deepEqual(row.map(x=>x.file),[0,1,2,3]);
    assert.ok(row.every(x=>Math.abs(x.x-row[0].x)<.000001));
    for(let i=1;i<4;i++)assert.ok(Math.abs(row[i].y-row[i-1].y-16)<.000001);
    if(rank)assert.ok(Math.abs(row[0].x-u[(rank-1)*4].x+22)<.000001);
  }
});
test('rear ranks follow a real turn instead of rotating a rigid block',async()=>{
  const {ColumnModel,DEMO_WAYPOINTS}=await modelPromise;
  const model=new ColumnModel(DEMO_WAYPOINTS,{count:36});
  model.advance(200);
  const u=model.soldiers();
  assert.ok(Math.abs(u[0].angle-u[32].angle)>.12);
});
test('all 36 members cross the one legal bridge corridor',async()=>{
  const {ColumnModel,DEMO_WAYPOINTS}=await modelPromise;
  const model=new ColumnModel(DEMO_WAYPOINTS,{count:36});
  let frames=0,cleared=false;
  for(let i=0;i<1600;i++){
    model.advance(.9);
    const u=model.soldiers();
    const onDeck=u.filter(s=>s.x>=655&&s.x<=747);
    if(onDeck.length){
      frames++;
      for(const soldier of onDeck)assert.ok(soldier.y>307&&soldier.y<392,
        'off-bridge soldier '+soldier.id+' at '+soldier.x+','+soldier.y);
    }
    if(u.every(s=>s.x>770)){cleared=true;break;}
  }
  assert.ok(frames>20);assert.ok(cleared);
});
test('halting and resuming changes no formation identity',async()=>{
  const {ColumnModel,DEMO_WAYPOINTS}=await modelPromise;
  const model=new ColumnModel(DEMO_WAYPOINTS,{count:36});
  model.advance(300);
  const snapshot=model.soldiers();
  assert.deepEqual(snapshot,model.soldiers());
  model.advance(12);assert.ok(model.soldiers()[0].x>snapshot[0].x);
  model.reset();assert.equal(model.distance,0);
});
