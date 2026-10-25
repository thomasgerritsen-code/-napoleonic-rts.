'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {delta,merge}=require('../../server/state-delta.js');
const protocol=require('../../src/network/command-protocol.js');
function view(tick,units){return {v:1,tick,side:'france',state:{elapsed:tick*.05,units,buildings:[],groups:[],resources:[{id:5,amount:100}]},acknowledgements:[]};}
test('full and delta views reconstruct additions, changes and hidden removals without mutating baselines',()=>{
  const a=view(1,[{id:1,x:10},{id:2,x:20}]),b=view(2,[{id:1,x:12},{id:3,x:30}]);
  assert.deepEqual(merge(null,delta(null,a)),a);const d=delta(a,b);
  assert.deepEqual(d.view.state.units.remove,[2]);assert.deepEqual(d.view.state.resources.put,[]);
  assert.deepEqual(merge(a,d),b);assert.equal(a.state.units[0].x,10);
  assert.throws(()=>merge(null,d),/baseline/);
});
test('network gathering, rally and special actions have strict payload and selection validation',()=>{
  const c={v:1,seq:1,type:'gather',unitIds:[1],buildingId:null,data:{resourceId:5,food:1e9}};
  assert.deepEqual(protocol.normalize(c).command.data,{resourceId:5});
  assert.equal(protocol.normalize({...c,data:{resourceId:-1}}).ok,false);
  assert.equal(protocol.normalize({...c,type:'rally',unitIds:[],buildingId:2,data:{x:10,y:20}}).ok,true);
  assert.equal(protocol.normalize({...c,type:'action',unitIds:[],data:{action:'auto-regiment'}}).ok,false);
  assert.equal(protocol.normalize({...c,type:'action',data:{action:'give-resources'}}).ok,false);
  const rally=protocol.normalize({...c,type:'rally',buildingId:2,data:{x:1001,y:20}}).command;
  assert.equal(protocol.ownership(rally,'france',{unit:()=>({side:'france'}),building:()=>({side:'france'}),world:()=>({width:1000,height:1000})}).reason,'outside-world');
});
