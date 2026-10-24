'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(query='?view=iso'){
 const s=createSandbox({globals:{elapsed:0},window:{location:{search:query}}});loadProductionScript(s.context,'src/foundation/config.js');loadProductionScript(s.context,'src/systems/world/seasons-v1.js');return{api:s.window.__SEASONS_V1__,context:s.context};
}
test('the year visits all four seasons and repeats without a colour jump at the boundary',()=>{
 const {api}=setup();for(const [t,key,snow]of[[0,'spring',0],[240,'summer',0],[480,'autumn',0],[720,'winter',1],[960,'spring',0]]){const s=api.at(t);assert.equal(s.key,key);assert.equal(s.snow,snow);}
 for(const t of [0,100,218,460,702,940]){const a=api.at(t),b=api.at(t+960);assert.equal(a.key,b.key);assert.equal(a.groundTint,b.groundTint);assert.equal(a.blend,b.blend);assert.equal(a.snow,b.snow);assert.equal(b.year,a.year+1);}
 assert.equal(api.at(0).groundTint,null);assert.ok(api.at(719.999).snow>.9999);assert.ok(api.at(959.999).snow<.0001);
});
test('ground and snow transitions are gradual, finite and bounded over repeated years',()=>{
 const {api}=setup();for(let t=0;t<1920;t+=.25){const a=api.at(t),b=api.at(t+.25);assert.ok(Number.isFinite(a.groundAlpha));assert.ok(a.groundAlpha>=0&&a.groundAlpha<=.7);assert.ok(Math.abs(a.snow-b.snow)<.02);assert.ok(Math.abs(a.groundAlpha-b.groundAlpha)<.02);}
 assert.ok(api.at(697.5).snow>.49&&api.at(697.5).snow<.51);
});
test('tree changes are stable in world space, preserve evergreens and progress across the forest',()=>{
 const {api}=setup(),a=api.at(480),half=api.at(697.5),winter=api.at(720);let autumn=0,white=0;
 for(let i=0;i<200;i++){const x=i*17+10,y=i*31+20;const p=api.paletteFor('oak',x,y,half);assert.equal(p,api.paletteFor('oak',x,y,half));if(p==='winter')white++;else if(p==='autumn')autumn++;assert.equal(api.paletteFor('pine',x,y,a),'base');assert.equal(api.paletteFor('oak',x,y,a),'autumn');assert.equal(api.paletteFor('oak',x,y,winter),'winter');assert.equal(api.paletteFor('cottage',x,y,winter),'base');}
 assert.ok(white>50&&autumn>50);
});
test('season state uses only game time, resets at zero and stays absent from the legacy game',()=>{
 const {api,context}=setup();context.elapsed=800;const s=api.state();assert.equal(s.key,'winter');assert.equal(api.state(),s);assert.ok(Object.isFrozen(s));assert.equal(context.elapsed,800);context.elapsed=0;assert.equal(api.state().key,'spring');assert.equal(setup('?test=legacy').api,undefined);
});
