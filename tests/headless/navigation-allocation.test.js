'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createSandbox,loadProductionScript}=require('./harness');
const root=path.resolve(__dirname,'../..');
function waterRealm(){
 const realm=createSandbox({globals:{document:{title:'',querySelector:()=>null},clampV066:(v,a,b)=>Math.max(a,Math.min(b,v))}}),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const roads=read('src/v066.js'),water=read('src/v067.js');
 // Execute the actual immutable river construction/query prefix without the
 // unrelated legacy renderer/input wrappers that follow it in this old file.
 vm.runInContext(roads.slice(roads.indexOf('const STRATEGIC_LATITUDES_V282'),roads.indexOf('const ROAD_NETWORK_V066')),realm.context);
 vm.runInContext(roads.slice(roads.indexOf('function closestPointOnSegmentV066'),roads.indexOf('function roadNetworkAtV066')),realm.context);
 vm.runInContext(water.slice(0,water.indexOf('function crossingPassageContainsV067')),realm.context);
 vm.runInContext(`function originalRiverQuery(x,y){
  const points=RIVER_SMOOTH_POINTS_V296;let lo=0,hi=points.length-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(points[mid].y<y)lo=mid;else hi=mid;}
  let best=null;for(let i=Math.max(0,lo-7);i<=Math.min(points.length-2,lo+7);i++){
   const hit=closestPointOnSegmentV066(x,y,points[i],points[i+1]);if(!best||hit.distance<best.distance)best={...hit,segmentIndex:i};
  }return best;
 }`,realm.context);
 return realm;
}
test('river allocation reduction preserves every output bit at random positions, knots, banks and bridge edges',()=>{
 const {context:c,random}=waterRealm();
 const points=vm.runInContext('RIVER_SMOOTH_POINTS_V296.flatMap(p=>[-72,-58,-.000001,0,.000001,58,72].map(dx=>[p.x+dx,p.y]))',c);
 for(let i=0;i<12000;i++)points.push([random()*10000-1000,random()*7000-1000]);
 for(const x of[NaN,Infinity,-Infinity,0,-0])for(const y of[NaN,Infinity,-Infinity,0,-0])points.push([x,y]);
 for(const [x,y]of points){const a=c.riverHitV067(x,y),b=c.originalRiverQuery(x,y);assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(b))assert.ok(Object.is(a[k],b[k]),`${k} differs at ${x},${y}`);}
});
test('numeric navigation columns return exactly the legacy candidate order through moves, removals and rebuilds',()=>{
 const units=[],s=createSandbox({globals:{units,buildings:[],TYPES:{infantry:{radius:7,speed:50}},moveToward:()=>{}}});loadProductionScript(s.context,'src/navigation.js');
 vm.runInContext(`function originalNearby(u){const cx=Math.floor(u.x/NAV_CELL),cy=Math.floor(u.y/NAV_CELL),out=[];for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const b=navBuckets.get((cx+ox)+','+(cy+oy));if(b)out.push(...b);}return out;}`,s.context);
 for(let i=0;i<300;i++)units.push({id:i,type:'infantry',x:(s.random()-.2)*1200,y:(s.random()-.2)*1200,dead:i%11===0});
 units.push({id:301,x:0,y:0},{id:302,x:-52,y:52},{id:303,x:51.999999,y:52},{id:304,x:52,y:-.000001});
 const check=()=>{s.context.rebuildSpatialHash();for(const u of units)assert.deepEqual(Array.from(s.context.nearbyNavUnits(u),u=>u.id),Array.from(s.context.originalNearby(u),u=>u.id));};
 check();for(const u of units){u.x+=53;u.y-=104;}check();units[3].dead=true;units.splice(12,50);check();units.length=0;check();assert.equal(vm.runInContext('navBuckets.size+navColumns.size',s.context),0);
});
