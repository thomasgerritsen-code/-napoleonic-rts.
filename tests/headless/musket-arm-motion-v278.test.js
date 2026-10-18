'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');

const chars=readFileSync('src/systems/rendering/characters.js','utf8');
const effects=readFileSync('src/systems/rendering/topdown-effects-v264.js','utf8');
const overlay=readFileSync('src/systems/rendering/combat-animations.js','utf8');

function setup(){
  let fired=0,strokes=0;
  const ctx={
    save(){},restore(){},translate(){},rotate(){},beginPath(){},arc(){},
    ellipse(){},fill(){},fillRect(){},moveTo(){},lineTo(){},stroke(){strokes++;},
    closePath(){},strokeRect(){},fillText(){}
  };
  const u={id:17,kind:'unit',type:'infantry',side:'france',x:500,y:600,
    facing:0,morale:100,dead:false,routing:false,attackMode:'fire',
    targetX:500,targetY:600,reload:2.2,regimentId:null,
    combatVisualV1:{kind:'musket-fire',started:10,duration:2.8}};
  const world={
    elapsed:10.8,ctx,selectedUnits:new Set(),camera:{zoom:1},
    COLORS:{selected:'#fff'},TYPES:{infantry:{radius:6,reload:3}},
    drawUnit(){},drawParticles(){},resetGame(){},applyDamage(){},
    fire(){fired++;u.reload=3.1;},isWorldVisible:()=>true
  };
  const root={NRTS:{subsystems:{register(){},has:()=>false}},
    __COMBAT_ANIMATIONS_V1__:{animationFor(unit){
      const e=unit.combatVisualV1;
      const age=world.elapsed-e.started;
      return age<e.duration?{kind:'musket-fire',age,duration:e.duration}:null;
    }}};
  world.window=root;
  runInNewContext(chars,world,{filename:'characters.js'});
  const charDraw=world.drawUnit;
  return{world,root,u,charDraw,strokes:()=>strokes,fired:()=>fired};
}

test('v278 one joint-chain hand follows cartridge and ramrod without altering soldier',()=>{
  const f=setup(),visual=f.root.__CHARACTER_VISUALS_V2__;
  const arms=(age,reload)=>{
    f.world.elapsed=10+age;f.u.reload=reload;
    const pose=visual.musketPose(f.u);
    return{pose,hands:visual.musketHands(f.u,pose)};
  };
  const pouch=arms(.98,2.22),ram=arms(1.95,1.25),ready=arms(3.15,.05);
  assert.equal(pouch.pose.phase,'reload');
  assert.equal(ram.pose.phase,'reload');
  assert(pouch.hands.cartridge>.2);
  assert(ram.hands.ramrod>.2);
  assert.notEqual(pouch.hands.support.handX,ram.hands.support.handX);
  assert.equal(ready.pose.phase,'ready');
  assert(ready.pose.shoulder>.7);
  const before={x:f.u.x,y:f.u.y,reload:f.u.reload,facing:f.u.facing};
  f.world.drawUnit(f.u);
  assert.deepEqual({x:f.u.x,y:f.u.y,reload:f.u.reload,facing:f.u.facing},before);
  assert(f.strokes()>0);
  assert.equal(f.fired(),0);
});

test('v278 effects must not install a duplicate musket-arm renderer',()=>{
  const f=setup();
  runInNewContext(effects,f.world,{filename:'topdown-effects-v264.js'});
  assert.equal(f.world.drawUnit,f.charDraw);
  assert(f.root.__TOPDOWN_EFFECTS_V264__.features.includes(
    'single-owner-character-reload'));
  const before={x:f.u.x,y:f.u.y,reload:f.u.reload};
  f.world.drawUnit(f.u);
  assert.deepEqual({x:f.u.x,y:f.u.y,reload:f.u.reload},before);
  assert.equal(f.fired(),0);
});

test('v278 legacy combat flash overlay does not add a second ramrod',()=>{
  assert.doesNotMatch(effects,/drawTopdownFirePoseV263/);
  assert.doesNotMatch(overlay,/a\.age>\.34&&a\.age<a\.duration\*\.86/);
  assert.match(overlay,/a\?\.kind==='musket-fire'&&a\.age<\.11/);
  assert.match(chars,/if\(hands\.ramrod>0\)/);
});
