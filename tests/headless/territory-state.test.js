'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../../src/systems/scenario/territory-state.js');
const protocol=require('../../src/network/command-protocol.js');
const site={id:'food',label:'Landgoed',x:500,y:500,resource:'food',rate:3};
const soldier=(side='france',more={})=>({side,type:'infantry',x:500,y:500,hp:80,dead:false,routing:false,...more});
function setup(){const model=create([site]),earned={france:0,britain:0},credit=(side,resource,amount)=>{assert.equal(resource,'food');earned[side]+=amount;};return{model,earned,step:(dt,actors=[soldier()])=>model.step(dt,actors,credit),point:()=>model.state().points[0]};}
test('capture takes fifteen real seconds and only subsequent ownership earns resources',()=>{
 const {step,point,earned}=setup();step(14.75);assert.equal(point().owner,null);assert.equal(earned.france,0);step(.25);assert.equal(point().owner,'france');assert.equal(earned.france,0);step(2);assert.equal(earned.france,6);
});
test('ownership transitions prorate income and are independent of the simulation step size',()=>{
 const a=setup(),b=setup();a.step(20);for(let i=0;i<80;i++)b.step(.25);assert.deepEqual(a.point(),b.point());assert.equal(a.earned.france,15);assert.equal(b.earned.france,15);
});
test('civilian, staff, routed, dead, zero-health and distant actors cannot capture',()=>{
 for(const extra of[{type:'worker'},{type:'officer'},{type:'drummer'},{routing:true},{dead:true},{hp:0},{x:661}]){
  const s=setup();s.step(100,[soldier('france',extra)]);assert.equal(s.point().owner,null);assert.equal(s.earned.france,0);
 }
 const edge=setup();edge.step(15,[soldier('france',{x:660})]);assert.equal(edge.point().owner,'france');
});
test('opposing troops freeze capture progress and stop an owned territory paying income',()=>{
 const s=setup();s.step(7.5);s.step(10,[soldier(),soldier('britain')]);assert.equal(s.point().progress,.5);assert.equal(s.point().contested,true);assert.equal(s.earned.france,0);
 s.step(7.5);assert.equal(s.point().owner,'france');s.step(10,[soldier(),soldier('britain')]);assert.equal(s.earned.france,0);assert.equal(s.point().incomeActive,false);
});
test('hostile occupation stops income immediately, recaptures after fifteen seconds and pays only the new owner',()=>{
 const s=setup();s.step(15);s.step(10,[soldier('britain')]);assert.equal(s.point().owner,'france');assert.equal(s.earned.france,0);assert.equal(s.point().incomeActive,false);
 s.step(6,[soldier('britain')]);assert.equal(s.point().owner,'britain');assert.ok(Math.abs(s.earned.britain-3)<1e-9);assert.equal(s.earned.france,0);
});
test('vacating an area discards unfinished capture but retains established ownership and income',()=>{
 const s=setup();s.step(10);s.step(5,[]);assert.equal(s.point().claim,null);assert.equal(s.point().progress,0);assert.equal(s.point().owner,null);
 s.step(15);s.step(5,[]);assert.equal(s.point().owner,'france');assert.equal(s.earned.france,15);
});
test('invalid elapsed input cannot create resources and snapshots do not expose actors or mutable authority',()=>{
 const s=setup(),old=s.model.state();for(const dt of[0,-1,NaN,Infinity])s.step(dt);assert.deepEqual(s.model.state(),old);
 const snapshot=s.model.state();snapshot.points[0].owner='britain';assert.equal(s.point().owner,null);assert.equal('actors' in snapshot,false);
 const fresh=create([site]);s.step(20);assert.equal(fresh.state().points[0].owner,null);
});
test('independent sites credit their configured resource to the correct faction and reject capture commands',()=>{
 const sites=[site,{...site,id:'wood',x:1000,resource:'wood',rate:2},{...site,id:'iron',x:1500,resource:'iron',rate:1}],model=create(sites),credits=[];
 model.step(20,sites.map(p=>soldier(p.id==='iron'?'britain':'france',{x:p.x})),(...args)=>credits.push(args));
 assert.deepEqual(credits,[['france','food',15],['france','wood',10],['britain','iron',5]]);
 assert.equal(protocol.normalize({v:1,seq:1,type:'capture-territory',unitIds:[1],buildingId:null,data:{owner:'france'}}).ok,false);
});
