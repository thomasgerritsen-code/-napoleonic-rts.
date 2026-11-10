'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(human=true){
 const workers=['france','britain'].map((side,i)=>({side,id:i+1,kind:'unit',type:'worker',x:0,y:0,targetX:0,targetY:0,task:null,resourceTarget:null,returnResource:null,carry:0,carryType:null,gatherClock:0}));
 const resources=[{id:10,type:'wood',x:0,y:0,radius:20,amount:100,dead:false},{id:11,type:'wood',x:40,y:0,radius:20,amount:100,dead:false},{id:12,type:'food',x:10,y:0,radius:20,amount:100,dead:false}];
 const economies={france:{food:20,wood:10,iron:0},britain:{food:20,wood:10,iron:0}};
 const s=createSandbox({window:{__NRTS_HUMAN_BRITAIN__:human},globals:{resources,economies,elapsed:0,buildings:['france','britain'].map(side=>({side,type:'towncenter',x:0,y:0,complete:true,dead:false})),livingUnits:side=>workers.filter(u=>u.side===side),moveToward:()=>true}});
 loadProductionScript(s.context,'src/economy.js');return{c:s.context,workers,resources,economies};
}
test('both human sides remain idle until ordered and the AI allocator cannot give Britain free automation',()=>{
 const {c,workers}=setup();c.autoAssignAIWorkers();for(let i=0;i<30;i++)for(const u of workers)c.updateWorker(u,.05);assert.ok(workers.every(u=>u.task===null&&u.resourceTarget===null));
});
test('both human sides switch to another source of the ordered type after depletion',()=>{
 for(const side of['france','britain']){const {c,workers,resources}=setup(),u=workers.find(u=>u.side===side);c.assignWorkerToResource(u,resources[0]);resources[0].dead=true;c.updateWorker(u,.05);assert.equal(u.task,'gather');assert.equal(u.resourceTarget.id,11);assert.equal(u.preferredResourceType,'wood');}
});
test('both human sides finish a delivery exactly once before resuming their chosen resource',()=>{
 for(const side of['france','britain']){const {c,workers,resources,economies}=setup(),u=workers.find(u=>u.side===side);Object.assign(u,{task:'return',carry:25,carryType:'wood',returnResource:resources[0],preferredResourceType:'wood'});resources[0].dead=true;c.updateWorker(u,.05);assert.equal(economies[side].wood,35);assert.equal(u.task,'gather');assert.equal(u.resourceTarget.id,11);assert.equal(u.carry,0);}
});
test('when the chosen resource is exhausted both humans stop rather than silently changing their job',()=>{
 for(const side of['france','britain']){const {c,workers,resources}=setup(),u=workers.find(u=>u.side===side);c.assignWorkerToResource(u,resources[0]);resources[0].dead=resources[1].dead=true;c.updateWorker(u,.05);c.updateWorker(u,.05);assert.equal(u.task,null);assert.equal(u.resourceExhaustedStop,true);assert.equal(u.preferredResourceType,'wood');}
});
test('singleplayer Britain still assigns work automatically',()=>{
 const {c,workers}=setup(false);c.autoAssignAIWorkers();assert.equal(workers[1].task,'gather');assert.equal(workers[0].task,null);
});
