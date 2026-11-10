'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../../src/systems/rendering/battlefield-atmosphere-v1.js');
const smoke=()=>({wx:100,wy:200,h:1.45,size:.4,seed:.37,born:0,life:4,facing:0});
function canvas(w,h){
 const c={scale(){},translate(){},save(){},restore(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},createRadialGradient:()=>({addColorStop(){}})};
 return{width:w,height:h,getContext:()=>c};
}
test('smoke follows both wind axes and a turn bends its path without teleporting',()=>{
 const s=smoke();api.advanceSmoke(s,1,{x:1,y:0,strength:1});const a=api.smokeProfile(s,1);
 assert.ok(a.x>100);const before=JSON.stringify(a);
 api.advanceSmoke(s,1,{x:0,y:1,strength:1});assert.equal(JSON.stringify(api.smokeProfile(s,1)),before);
 api.advanceSmoke(s,2,{x:0,y:1,strength:1});const b=api.smokeProfile(s,2);
 assert.ok(b.y>a.y);assert.ok(b.x>=a.x-4);assert.ok(b.height>a.height);assert.ok(b.radius>a.radius);assert.ok(b.opacity<a.opacity);
});
test('smoke drift is frame-rate independent, idempotent and fades out',()=>{
 const runs=[30,60,120].map(hz=>{const s=smoke();for(let i=1;i<=hz*2;i++)api.advanceSmoke(s,i/hz,{x:.6,y:-.8,strength:1});return s;});
 for(const s of runs){assert.ok(Math.abs(s.driftX-runs[0].driftX)<1e-9);assert.ok(Math.abs(s.driftY-runs[0].driftY)<1e-9);
  const before=JSON.stringify(s);api.advanceSmoke(s,2,{x:.6,y:-.8,strength:1});assert.equal(JSON.stringify(s),before);
  assert.equal(api.smokeProfile(s,10).opacity,0);}
 const calm=smoke();api.advanceSmoke(calm,2,{x:1,y:1,strength:0});assert.equal(calm.driftX,0);assert.equal(calm.driftY,0);
});
test('ground layout is deterministic, world aligned and excludes water',()=>{
 const describe=(x,y)=>({kind:x<192?'water':y<192?'road':'woods',angle:.5});
 const a=api.groundSamples(0,0,describe);assert.deepEqual(a,api.groundSamples(0,0,describe));assert.ok(a.length>0&&a.length<64);
 assert.ok(a.every(p=>p.x>=192&&p.x<384&&p.y>=0&&p.y<384));assert.ok(a.some(p=>p.kind==='road')&&a.some(p=>p.kind==='woods'));
 assert.notDeepEqual(a,api.groundSamples(1,0,describe));assert.deepEqual(api.groundSamples(0,0,()=>({kind:'water'})),[]);
});
test('warm ground tiles reuse their canvas through camera zoom changes and respect relief',()=>{
 let creates=0;const cache=api.createGroundCache({mobile:true,makeCanvas:(w,h)=>{creates++;return canvas(w,h);},describe:()=>({kind:'hill'}),height:(x,y)=>y*.28});
 const tile=cache.get(2,3),before=cache.stats();for(let i=0;i<40;i++)assert.equal(cache.get(2,3),tile);
 assert.equal(creates,1);assert.equal(cache.stats().builds,before.builds);assert.equal(cache.stats().bytes,before.bytes);assert.ok(cache.stats().hits>=40);
 for(const p of api.groundSamples(2,3,()=>({kind:'hill'}))){const py=p.y*.5-p.y*.28;assert.ok(py>=tile.y&&py<=tile.y+tile.height);}
 assert.equal(cache.get(100,100,false),null);assert.equal(creates,1);
});
test('long camera travel keeps mobile ground storage below four MiB and reset frees it',()=>{
 const cache=api.createGroundCache({mobile:true,makeCanvas:canvas,describe:()=>({kind:'open'}),height:()=>0});
 for(let i=0;i<150;i++){
  cache.get(i,i%11);const s=cache.stats();assert.ok(s.tiles<=s.maxTiles);assert.ok(s.bytes<=s.maxBytes);
 }
 assert.ok(cache.stats().evictions>0);assert.equal(cache.stats().maxBytes,4*2**20);
 cache.reset();assert.equal(cache.stats().tiles,0);assert.equal(cache.stats().bytes,0);
});
