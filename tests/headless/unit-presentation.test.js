'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = require('../../src/systems/rendering/unit-presentation-v1.js');
const unit = (extra = {}) => ({id:17,type:'infantry',x:0,y:0,facing:0,...extra});
function advance(p,u,seconds,hz,vx=0,vy=0){
  for(let i=0;i<seconds*hz;i++){
    u.x+=vx/hz;u.y+=vy/hz;
    api.update(p,u,1/hz,(i+1)/hz,(i+1)/hz);
  }
}
test('presentation has the same walking cadence at 30, 60 and 120 Hz and does not write units',()=>{
  const results=[30,60,120].map(hz=>{
    const u=unit(),p=api.create(u);advance(p,u,2,hz,60);
    const before=JSON.stringify(u);api.update(p,u,0,2,2);assert.equal(JSON.stringify(u),before);
    return p;
  });
  for(const p of results){assert.equal(p.moving,true);assert.ok(Math.abs(p.phase-results[0].phase)<1e-9);assert.ok(Math.abs(p.speed-results[0].speed)<1e-8);}
});
test('direction resists boundary chatter and a reverse order turns through adjacent headings',()=>{
  const u=unit(),p=api.create(u);
  for(let i=0;i<120;i++){
    const a=Math.PI/8+(i%2?.04:-.04);u.x+=Math.cos(a);u.y+=Math.sin(a);
    api.update(p,u,1/60,i/60,i/60);assert.equal(p.dir,0);
  }
  const dirs=[];u.facing=Math.PI;
  for(let i=0;i<60;i++){u.x-=2;api.update(p,u,1/60,2+i/60,2+i/60);dirs.push(p.dir);}
  for(let i=1;i<dirs.length;i++){const d=(dirs[i]-dirs[i-1]+8)%8;assert.ok(d===0||d===1||d===7);}
  assert.equal(dirs.at(-1),4);assert.ok(new Set(dirs).size>=4);
});
test('horse gait transitions keep the foot cycle and reject boundary chatter',()=>{
  const u=unit({type:'cavalry'}),p=api.create(u);
  advance(p,u,1,60,70);assert.equal(p.gait,'trot');const phase=p.phase;
  u.chargeTimer=2;u.x+=70/60;api.update(p,u,1/60,1,1);
  assert.equal(p.gait,'gallop');assert.ok(Math.abs((p.phase-phase+1)%1-(70/60)/22.5/3.6)<1e-9);
  u.chargeTimer=0;advance(p,u,1,60,110);assert.equal(p.gait,'gallop');
  advance(p,u,1,60,100);assert.equal(p.gait,'gallop');
  advance(p,u,1,60,80);assert.equal(p.gait,'trot');
});
test('stopping eases the body to rest, relocation does not create running feet',()=>{
  const u=unit({type:'cavalry'}),p=api.create(u);advance(p,u,1,60,110);
  const scales=[];for(let i=0;i<60;i++){api.update(p,u,1/60,1+i/60,1+i/60);scales.push(p.scaleX);}
  assert.equal(p.moving,false);assert.ok(p.weight<.001);assert.ok(Math.min(...scales)<.999);
  const phase=p.phase;u.x+=2000;api.update(p,u,1/60,3,3);assert.equal(p.phase,phase);assert.equal(p.moving,false);
});
test('real strike variants have different timing, defense settles back without modifying health or orders',()=>{
  const frames=[0,1].map(meleeVariant=>{
    const u=unit({meleeAction:'strike',meleeActionAt:2,meleeActionUntil:2.54,meleeActionFacing:0,meleeVariant});
    const before=JSON.stringify(u),p=api.create(u),seen=[];
    for(let i=0;i<40;i++){const t=2+i/60;api.update(p,u,1/60,t,t);seen.push(api.strikeFrame(u,t));}
    assert.equal(JSON.stringify(u),before);assert.ok(p.dx>0);return seen;
  });
  assert.notDeepEqual(frames[0],frames[1]);for(const f of frames)assert.deepEqual([...new Set(f)],[0,1,2]);
  const u=unit({meleeAction:'parry',meleeActionAt:0,meleeActionUntil:.38,meleeActionFacing:0}),p=api.create(u);
  advance(p,u,.3,60);assert.ok(p.dx<0);advance(p,u,1,60);assert.equal(p.action,null);assert.ok(Math.abs(p.dx)<.01);
});
test('fall and recovery show all four frames, vary by soldier and keep corpses down',()=>{
  const sequences=[1,2,3,4].map(id=>Array.from({length:115},(_,i)=>api.fallFrame(id,i/60,1.9)));
  for(const frames of sequences){assert.equal(frames[0],0);assert.deepEqual([...new Set(frames)].sort(),[0,1,2,3]);assert.equal(frames.at(-1),0);}
  assert.ok(new Set(sequences.map(s=>s.join(','))).size>1);
  for(let t=1;t<30;t++)assert.equal(api.fallFrame(7,t),3);
});
test('injuries affect the body pose and hidden units skip pose work while keeping distance phase',()=>{
  const u=unit(),v=unit({injuryLevel:2}),p=api.create(u),q=api.create(v);
  advance(p,u,1,60,60);advance(q,v,1,60,60);assert.ok(q.scaleY<p.scaleY);assert.equal(p.phase,q.phase);
  const before={dx:q.dx,dy:q.dy,scale:q.scaleY},phase=q.phase;v.x+=1;
  api.update(q,v,1/60,2,2,false);assert.deepEqual({dx:q.dx,dy:q.dy,scale:q.scaleY},before);assert.notEqual(q.phase,phase);
});
