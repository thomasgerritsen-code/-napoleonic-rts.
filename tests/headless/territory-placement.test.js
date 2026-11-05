'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {place}=require('../../src/systems/scenario/territory-placement.js');
const settings={homes:[{x:316,y:799},{x:7380,y:4360}],world:{width:8000,height:5000},sites:[{id:'food'},{id:'wood'},{id:'iron'}],isOpen:()=>true};
test('three supply fronts span the map, stay apart and remain equidistant from both headquarters',()=>{
 const p=place(settings);assert.ok(p[2].y-p[0].y>3500);
 for(let i=0;i<p.length;i++){
  const a=p[i];assert.ok(a.x>340&&a.y>340&&a.x<7660&&a.y<4660);
  const d=settings.homes.map(h=>Math.hypot(a.x-h.x,a.y-h.y));assert.ok(Math.abs(d[0]-d[1])<1e-8);
  for(const b of p.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=1700);
 }
 assert.deepEqual(p,place(settings));assert.deepEqual(p.map(a=>a.id),['food','wood','iron']);
});
test('posts seek nearby supply roads without entering blocked ground or merging fronts',()=>{
 const p=place({...settings,isOpen:p=>p.y>600&&!(p.y>2400&&p.y<2530),roadDistance:p=>Math.abs(p.y-2700)});
 for(const a of p)assert.ok(a.y>600&&!(a.y>2400&&a.y<2530));
 for(let i=1;i<p.length;i++)assert.ok(Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y)>=1700);
 assert.ok(Math.abs(p[1].y-2700)<Math.abs(place(settings)[1].y-2700));
});
test('rotated or reversed headquarters preserve geographic order, safety and fairness',()=>{
 for(const homes of [[{x:7000,y:4000},{x:800,y:900}],[{x:1000,y:2500},{x:7000,y:2500}]]){
  const p=place({...settings,homes});assert.ok(p[0].y<p[1].y&&p[1].y<p[2].y);
  for(const a of p)assert.ok(Math.abs(Math.hypot(a.x-homes[0].x,a.y-homes[0].y)-Math.hypot(a.x-homes[1].x,a.y-homes[1].y))<1e-8);
 }
 assert.throws(()=>place({...settings,isOpen:()=>false}),/Geen veilig terrein/);
 assert.throws(()=>place({...settings,homes:[{x:500,y:500},{x:500,y:500}]}),/Hoofdkwartieren/);
});
