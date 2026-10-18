'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');

const source=readFileSync('src/systems/rendering/topdown-volley-v271.js','utf8');
function setup(){
  let use3D=false;
  const ellipses=[],labels=[];
  const ctx={
    save(){},restore(){},beginPath(){},fill(){},
    ellipse(...args){ellipses.push(args);},
    fillText(...args){labels.push(args);}
  };
  const regiment={id:271777,destroyed:false,formation:'line',
    engagementV069:{mode:'fire'},memberIds:[]};
  const root={
    NRTS:{subsystems:{register(){}}},
    __BATTLEFIELD_3D_V1__:{enabled:()=>use3D},
    __MAP_AMBIENT_MOTION_V1__:{currentWind:()=>({x:1,y:0,strength:1})}
  };
  const world={
    window:root,ctx,elapsed:10,volleyClock:2.95,
    getRegiment:id=>id===regiment.id?regiment:null,
    isWorldVisible:()=>true,
    fire(u){u.reload=3.1;u.facing=0;},
    drawParticles(){},
    resetGame(){}
  };
  runInNewContext(source,world,{filename:'topdown-volley-v271.js'});
  return{world,root,regiment,ellipses,labels,set3D:v=>{use3D=v;}};
}
function shoot(world,i){
  const u={id:i+1,kind:'unit',type:'infantry',regimentId:271777,
    x:100,y:100+i*15,reload:-1,side:'france',facing:0,dead:false};
  world.fire(u,{x:300,y:u.y});
  return u;
}

test('v276 twelve-musket volley produces spatial muzzle smoke, not an arcade ring or text',()=>{
  const{world,root,ellipses,labels}=setup();
  const soldiers=Array.from({length:12},(_,i)=>shoot(world,i));
  const api=root.__TOPDOWN_VOLLEY_V271__;
  const group=api.groups()[0];
  assert.equal(group.count,12);
  assert.equal(group.muzzles.length,12);
  assert.equal(group.muzzles[0].x,soldiers[0].x+20);
  assert.equal(group.muzzles[0].y,soldiers[0].y);
  world.drawParticles();
  assert.equal(labels.length,0);
  assert.equal(ellipses.length,12);
  assert(Math.max(...ellipses.map(e=>e[1]))-Math.min(...ellipses.map(e=>e[1]))>150);
  assert.equal(api.stats().grouped,11);
  assert.equal(api.stats().maxDrawPuffs,240);
});
test('v276 effects are capped, disabled in 3D and cleared on reset',()=>{
  const{world,root,set3D,ellipses}=setup();
  for(let i=0;i<50;i++)shoot(world,i);
  const api=root.__TOPDOWN_VOLLEY_V271__;
  assert.equal(api.groups()[0].count,50);
  assert.equal(api.groups()[0].muzzles.length,32);
  world.drawParticles();
  assert(ellipses.length<=api.stats().maxDrawPuffs);
  const before=api.stats().shots;
  set3D(true);
  shoot(world,50);
  world.drawParticles();
  assert.equal(api.stats().shots,before);
  set3D(false);
  world.resetGame();
  assert.equal(api.groups().length,0);
});
test('v276 2D pre-volley aim obeys contact and crossing rules',()=>{
  const{world,root,regiment}=setup();
  const u=shoot(world,0);
  u.reload=.15;
  assert.equal(root.__TOPDOWN_VOLLEY_V271__.preFirePose(u).phase,'aim');
  regiment.crossingTrafficV068={forcedColumn:true,state:'crossing'};
  assert.equal(root.__TOPDOWN_VOLLEY_V271__.preFirePose(u),null);
});
