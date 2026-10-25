'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(){
 const units=[],regiments=[],events=new Map();let id=0;
 const s=createSandbox({window:{location:{search:'?view=iso'}},globals:{units,regiments,projectiles:[],particles:[],elapsed:0,document:{readyState:'complete'},statusEl:{textContent:''},
  getRegiment:id=>regiments.find(r=>r.id===id&&!r.destroyed)||null,
  regimentMembers:r=>units.filter(u=>!u.dead&&u.regimentId===r.id),
  refreshRegiment:r=>{if(r&&!r.destroyed&&!units.some(u=>!u.dead&&u.regimentId===r.id))r.destroyed=true;}}});
 loadProductionScript(s.context,'src/foundation/config.js');
 s.window.NRTS={events:{on:(k,fn)=>events.set(k,fn)}};
 loadProductionScript(s.context,'src/combat-ai.js');loadProductionScript(s.context,'src/systems/combat/regiment-experience.js');
 const c=s.context,api=s.window.__REGIMENT_EXPERIENCE__;
 function group(side='france',n=6){const r={id:++id,side,name:'Regiment '+id,memberIds:[],destroyed:false};regiments.push(r);for(let i=0;i<n;i++){const u={id:++id,kind:'unit',type:'infantry',side,regimentId:r.id,x:i*100,y:0,hp:20,maxHp:20,morale:100,dead:false};units.push(u);r.memberIds.push(u.id);}return r;}
 function members(r){return units.filter(u=>u.regimentId===r.id);}
 function source(r){return c.combatSourceFor(members(r)[0]);}
 function kill(r,attacker){for(const u of members(r))c.dealCombatDamage(attacker?source(attacker):null,u,100,0);c.refreshRegiment(r);}
 return {c,api,group,members,source,kill,reset:()=>events.get('game:reset')()};
}
test('six combat victories earn bounded ranks once each and never heal soldiers',()=>{
 const {c,api,group,members,kill}=setup(),winner=group();members(winner)[0].hp=12;
 for(let i=1;i<=8;i++){
  const enemy=group('britain');kill(enemy,winner);c.refreshRegiment(enemy);c.refreshRegiment(enemy);
  assert.equal(winner.victories,i);assert.equal(winner.rank,i>=6?3:i>=3?2:1);
 }
 assert.equal(api.rankOf(winner).label,'Elite');assert.equal(api.attackMultiplier(winner.id),1.15);
 assert.equal(members(winner)[0].hp,12);assert.equal(api.stats().promotions,3);
});
test('credit follows the largest casualty contribution, not the last shot',()=>{
 const {c,group,members,source}=setup(),major=group(),last=group(),enemy=group('britain');
 const m=members(enemy);for(let i=0;i<m.length;i++)c.dealCombatDamage(source(i===m.length-1?last:major),m[i],100,0);
 c.refreshRegiment(enemy);assert.equal(major.victories,1);assert.equal(last.victories,undefined);
});
test('equal contributions break ties by regiment ID and exclude already defeated attackers',()=>{
 const {c,group,members,source}=setup(),first=group(),second=group(),enemy=group('britain');
 for(const [i,u] of members(enemy).entries())c.dealCombatDamage(source(i<3?second:first),u,100,0);
 c.refreshRegiment(enemy);assert.equal(first.victories,1);assert.equal(second.victories,undefined);
 const enemy2=group('britain');for(const [i,u] of members(enemy2).entries())c.dealCombatDamage(source(i<5?first:second),u,100,0);
 first.destroyed=true;c.refreshRegiment(enemy2);assert.equal(second.victories,1);
});
test('friendly fire, towers, unaffiliated units and deaths without combat credit earn no honours',()=>{
 const {c,group,members,kill,api}=setup(),winner=group(),friend=group();kill(friend,winner);
 const enemy=group('britain');for(const u of members(enemy))c.dealCombatDamage({side:'france',regimentId:null,damageFactor:1},u,100,0);c.refreshRegiment(enemy);
 const other=group('britain');kill(other,null);assert.equal(winner.victories,undefined);assert.equal(api.stats().victories,0);
});
test('reviving one casualty cannot manufacture repeated contributions for the same regiment',()=>{
 const {c,group,members,source}=setup(),first=group(),second=group(),enemy=group('britain');
 const [u,...rest]=members(enemy);for(let i=0;i<10;i++){u.dead=false;u.hp=20;u.morale=100;c.dealCombatDamage(source(first),u,100,0);}
 for(const v of rest)c.dealCombatDamage(source(second),v,100,0);c.refreshRegiment(enemy);
 assert.equal(first.victories,undefined);assert.equal(second.victories,1);
});
test('firing-time bonus stays with the projectile source and incoming hit shock is reduced',()=>{
 const {c,group,members,kill,source}=setup(),winner=group();const shot=source(winner);
 for(let i=0;i<6;i++)kill(group('britain'),winner);
 const target=members(group('britain'))[0];c.dealCombatDamage(shot,target,10,0);assert.equal(target.hp,10);
 target.hp=20;c.dealCombatDamage(source(winner),target,10,0);assert.equal(target.hp,8.5);
 const veteran=members(winner)[0];veteran.morale=100;c.applyDamage(veteran,0,20);assert.equal(veteran.morale,83);
});
test('reset clears pending credit and damage source scopes restore after exceptions',()=>{
 const {c,group,members,source,reset}=setup(),winner=group(),enemy=group('britain');
 for(const u of members(enemy))c.dealCombatDamage(source(winner),u,100,0);reset();c.refreshRegiment(enemy);assert.equal(winner.victories,undefined);
 c.applyDamage=()=>{throw Error('test impact failure');};assert.throws(()=>c.dealCombatDamage(source(winner),{},10),/impact failure/);
 assert.equal(vm.runInContext('combatDamageSource',c),null);
});
