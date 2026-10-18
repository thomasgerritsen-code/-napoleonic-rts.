'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const config=fs.readFileSync('src/foundation/config.js','utf8');
const roadSource=fs.readFileSync('src/v066.js','utf8');
const riverSource=fs.readFileSync('src/v067.js','utf8');

test('v281 playable map expands by at least 3.5x original world area',()=>{
 const m=config.match(/battlefield:\s*Object\.freeze\(\{\s*width:(\d+),\s*height:(\d+)/);
 assert(m,'missing centrally configured world bounds');
 const width=Number(m[1]),height=Number(m[2]);
 assert(width>=8000&&height>=5000);
 assert(width*height/(4300*2500)>=3.5);
});

test('v281 bridges are distant, traverse a continued river and have actual connecting roads',()=>{
 const match=riverSource.match(/const WATER_CROSSINGS_V067 = Object\.freeze\((\[[\s\S]*?\])\);/);
 assert(match,'missing crossing geometry array');
 const crossings=vm.runInNewContext(match[1],{});
 const northern=crossings.find(c=>c.id==='pont-grands-bois');
 const southern=crossings.find(c=>c.id==='pont-du-sud');
 assert(northern&&southern,'new crossing IDs must be usable');
 assert(Math.hypot(northern.x-southern.x,northern.y-southern.y)>1500);
 assert.match(riverSource,/\{x:1900,y:3050\}/);
 assert.match(riverSource,/\{x:2250,y:4580\}/);
 assert.match(roadSource,/id:'route-de-grands-bois'/);
 assert.match(roadSource,/id:'chaussee-du-sud'/);
 assert.match(roadSource,/\[1900,3050\]/);
 assert.match(roadSource,/\[2250,4580\]/);
 assert.match(riverSource,/id:'pont-grands-bois'/);
 assert.match(riverSource,/id:'pont-du-sud'/);
});
