'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {delta,merge,createEncoder}=require('../../server/state-delta.js');
const protocol=require('../../src/network/command-protocol.js');
function view(tick,units){return {v:1,tick,side:'france',state:{elapsed:tick*.05,units,buildings:[],groups:[],resources:[{id:5,amount:100}]},acknowledgements:[]};}
test('full and delta views reconstruct additions, changes and hidden removals without mutating baselines',()=>{
  const a=view(1,[{id:1,x:10},{id:2,x:20}]),b=view(2,[{id:1,x:12},{id:3,x:30}]);
  assert.deepEqual(merge(null,delta(null,a)),a);const d=delta(a,b);
  assert.deepEqual(d.view.state.units.remove,[2]);assert.deepEqual(d.view.state.resources.put,[]);
  assert.deepEqual(merge(a,d),b);assert.equal(a.state.units[0].x,10);
  assert.throws(()=>merge(null,d),/baseline/);
});
test('connection encoders preserve nested changes, fog removals and reappearing IDs without mixing players',()=>{
  const a=createEncoder(),b=createEncoder();
  const frames=[
    view(1,[{id:1,x:10,resourceTarget:{x:20,y:30}},{id:2,x:40}]),
    view(2,[{id:1,x:10,resourceTarget:{x:21,y:30}}]),
    view(3,[{id:1,x:11,resourceTarget:null},{id:2,x:40}])
  ];
  let client=null,previous=null;
  for(const frame of frames){
    const packet=a.encode(frame);
    assert.deepEqual(packet,delta(previous,frame));
    client=merge(client,packet);assert.deepEqual(client,frame);previous=frame;
  }
  const own=view(3,[{id:1,x:900}]);own.side='britain';
  assert.deepEqual(b.encode(own),{type:'snapshot',view:own});
  assert.deepEqual(a.encode(frames[2]).view.state.units.put,[]);
  assert.deepEqual(createEncoder().encode(frames[2]),{type:'snapshot',view:frames[2]});
});
test('encoded baselines represent sent values even when the caller later reuses or mutates its source objects',()=>{
  const encoder=createEncoder(),original=view(1,[{id:1,x:10}]);
  encoder.encode(original);
  original.state.units[0].x=50;
  const changed=encoder.encode(original);assert.deepEqual(changed.view.state.units.put,[{id:1,x:50}]);
  original.state.units=[];
  assert.deepEqual(encoder.encode(original).view.state.units.remove,[1]);
  original.state.units=[{id:1,x:50}];
  assert.deepEqual(encoder.encode(original).view.state.units.put,[{id:1,x:50}]);
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
