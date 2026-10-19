'use strict';
// Visual-only animation contract for real musketeer reload and coordinated aim.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const characters=readFileSync('src/systems/rendering/characters.js','utf8');
const volleys=readFileSync('src/systems/rendering/topdown-volley-v271.js','utf8');

function fixture(){
  let fireCount=0;
  const registry=new Map();
  const context={
    elapsed:10,volleyClock:2.95,
    TYPES:{infantry:{reload:3,radius:6}},
    selectedUnits:new Set(),COLORS:{selected:'#ffffff'},
    camera:{zoom:1},ctx:{
      save(){},restore(){},translate(){},rotate(){},beginPath(){},arc(){},
      ellipse(){},fill(){},fillRect(){},moveTo(){},lineTo(){},stroke(){},
      closePath(){},setLineDash(){},strokeRect(){},fillText(){}
    },
    drawUnit(){},drawParticles(){},resetGame(){},
    isWorldVisible:()=>true,
    getRegiment:()=>regiment,
    fire(u){fireCount++;u.reload=3.2;u.facing=0;}
  };
  const regiment={id:27777,destroyed:false,formation:'line',
    engagementV069:{mode:'fire'},memberIds:[]};
  const root={
    NRTS:{subsystems:{register(name,api){registry.set(name,api);},has:()=>false}},
    __COMBAT_ANIMATIONS_V1__:{animationFor:u=>{
      const event=u.combatVisualV1;
      if(!event)return null;
      const age=context.elapsed-event.started;
      return event.kind==='musket-fire'&&age<event.duration?
        {kind:'musket-fire',age,duration:event.duration}:null;
    }}
  };
  context.window=root;
  runInNewContext(characters,context,{filename:'characters.js'});
  runInNewContext(volleys,context,{filename:'topdown-volley-v271.js'});
  const soldier=id=>({id,kind:'unit',type:'infantry',x:80,y:80+id*14,
    side:'france',regimentId:regiment.id,dead:false,routing:false,
    reload:.15,attackMode:'fire',facing:0,combatVisualV1:null});
  return{context,root,regiment,soldier,
    fireCount:()=>fireCount};
}

test('v277 preparatory aiming is staggered visually but never fires early',()=>{
  const f=fixture();
  const positions=Array.from({length:12},(_,i)=>{
    const u=f.soldier(i+1);
    return f.root.__CHARACTER_VISUALS_V2__.musketPose(u).shoulder;
  });
  assert(positions.every(s=>s>.1&&s<1));
  assert(new Set(positions.map(s=>s.toFixed(5))).size>=5);
  assert.equal(f.fireCount(),0);
  assert.equal(f.context.volleyClock,2.95);
  const blocked=f.soldier(3);
  f.regiment.crossingTrafficV068={forcedColumn:true,state:'crossing'};
  assert.equal(f.root.__TOPDOWN_VOLLEY_V271__.preFirePose(blocked),null);
  f.regiment.crossingTrafficV068=null;
  assert.equal(f.root.__TOPDOWN_VOLLEY_V271__.preFirePose(blocked)?.phase,'aim');
  assert.equal(f.fireCount(),0);
});

test('v277 muzzle flash starts exactly on a shot; recoil varies without moving the soldier',()=>{
  const f=fixture(),u=f.soldier(1);
  u.reload=-1;
  f.context.fire(u,{x:250,y:80});
  u.combatVisualV1={kind:'musket-fire',started:f.context.elapsed,duration:2.76};
  const api=f.root.__CHARACTER_VISUALS_V2__;
  assert.equal(api.musketPose(u).phase,'fire');
  assert.equal(api.musketPose(u).recoil,0);
  const before={x:u.x,y:u.y,facing:u.facing,reload:u.reload};
  f.context.elapsed+=.08;u.reload-=.08;
  assert(api.musketPose(u).recoil>.3);
  f.context.drawUnit(u);
  assert.deepEqual({x:u.x,y:u.y,facing:u.facing,reload:u.reload},beforeWithReload());
  function beforeWithReload(){return {...before,reload:before.reload-.08};}
  assert.equal(f.fireCount(),1);
});

test('v277 reload follows actual remaining time even after the old visual marker expires',()=>{
  const f=fixture(),u=f.soldier(2),api=f.root.__CHARACTER_VISUALS_V2__;
  u.combatVisualV1={kind:'musket-fire',started:10,duration:2.76};
  const sample=(age,remaining)=>{
    f.context.elapsed=10+age;u.reload=remaining;
    return api.musketPose(u);
  };
  assert.equal(sample(.32,2.88).phase,'lower');
  const cartridge=sample(.8,2.4);
  assert.equal(cartridge.phase,'reload');
  const ram=sample(1.9,1.3);
  assert.equal(ram.phase,'reload');
  assert(ram.ramrod>0);
  const extended=sample(2.95,.45);
  assert.notEqual(extended.phase,'carry');
  assert(extended.shoulder<1);
  const end=sample(3.19,.01);
  assert.equal(end.phase,'ready');
  assert(end.shoulder>.95);
  const final=sample(3.25,0);
  // An engaged, loaded soldier should immediately prepare the next volley.
  assert.equal(final.phase,'aim');
  f.regiment.engagementV069=null;
  assert.equal(sample(3.25,0).phase,'carry');
  assert.equal(f.fireCount(),0);
});
