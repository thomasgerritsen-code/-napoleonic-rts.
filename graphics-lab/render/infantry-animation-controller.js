// Graphics Lab v321 — deterministic infantry animation controller (PR D1).
// Pure visual state: it never reads or changes damage, reload time or orders.
// Both renderers (Canvas now, Pixi later) ask this controller for the same
// state/frame at the same lab clock, so a paused frame is pixel-identical.
(function(root){
'use strict';
const ORDER=['idle','march','aim','fire','reload'];

function validateConfig(config){
 if(!config||typeof config!=='object')throw new Error('animation config ontbreekt');
 if(!config.states)throw new Error('animation config zonder states');
 for(const name of ORDER){
   const s=config.states[name];
   if(!s||!(s.frames>0)||!(s.frameMs>0))throw new Error('ongeldige animatiestaat: '+name);
 }
 const m=config.muzzleEvent;
 if(!m||m.state!=='fire'||!(m.frame>=0&&m.frame<config.states.fire.frames))throw new Error('ongeldig muzzleEvent');
 return config;
}

// Small stable hash so 128 soldiers do not step as identical copies.
function unitOffsetMs(unitId,periodMs){
 let h=2166136261;
 const text=String(unitId);
 for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
 return ((h>>>0)%1000)/1000*periodMs;
}

function frameNames(prefix,config){
 const out={};
 for(const name of ORDER){
   out[name]=[];
   for(let i=1;i<=config.states[name].frames;i++)out[name].push(prefix+'_line_'+name+'_'+String(i).padStart(2,'0'));
 }
 return out;
}

function createInfantryAnimationController(config){
 validateConfig(config);
 const S=config.states,units=new Map();
 const duration=name=>S[name].frames*S[name].frameMs;
 const metrics={updates:0,muzzleEvents:0,transitions:0};

 function enter(u,name,atMs){
   if(u.state!==name)metrics.transitions++;
   u.state=name;u.since=atMs;u.muzzleDone=false;
 }
 // Advance one-shot states in order; large clock jumps still pass through
 // fire exactly once so muzzle flash and smoke are never doubled or lost.
 function settle(u,nowMs,input,events){
   for(let guard=0;guard<16;guard++){
     if(u.state==='fire'&&!u.muzzleDone&&nowMs>=u.since+config.muzzleEvent.frame*S.fire.frameMs){
       u.muzzleDone=true;metrics.muzzleEvents++;
       events.push({type:'muzzle',atMs:u.since+config.muzzleEvent.frame*S.fire.frameMs});
     }
     if(S[u.state].loop||nowMs<u.since+duration(u.state))return;
     const end=u.since+duration(u.state);
     if(u.state==='aim')enter(u,'fire',end);
     else if(u.state==='fire')enter(u,'reload',end);
     else if(u.state==='reload')enter(u,input.fireOrder?'aim':'idle',end);
     else return;
   }
 }

 function update(unitId,nowMs,input={}){
   metrics.updates++;
   const moving=!!input.moving,fireOrder=!!input.fireOrder&&!moving;
   let u=units.get(unitId);
   if(!u){u={state:moving?'march':'idle',since:nowMs,muzzleDone:false,last:nowMs};units.set(unitId,u);}
   // A rewound clock (scrubbed demo) restarts the state cleanly.
   if(nowMs<u.last)enter(u,moving?'march':'idle',nowMs);
   u.last=nowMs;
   const events=[];
   if(moving){
     // Safe interruption: a new march never leaves a fire frame behind.
     if(u.state!=='march')enter(u,'march',nowMs);
   }else{
     if(u.state==='march')enter(u,fireOrder?'aim':'idle',nowMs);
     else if(u.state==='idle'&&fireOrder)enter(u,'aim',nowMs);
     else if(u.state==='aim'&&!fireOrder)enter(u,'idle',nowMs);
     settle(u,nowMs,{fireOrder},events);
   }
   const s=S[u.state],elapsed=nowMs-u.since;
   let frame;
   if(s.loop){
     const period=s.frames*s.frameMs;
     frame=Math.floor((elapsed+unitOffsetMs(unitId,period))/s.frameMs)%s.frames;
   }else frame=Math.min(s.frames-1,Math.floor(elapsed/s.frameMs));
   return{state:u.state,frame:Math.max(0,frame),events};
 }

 return{update,metrics:()=>({...metrics,units:units.size}),
   reset(){units.clear();metrics.updates=metrics.muzzleEvents=metrics.transitions=0;},
   frameNames:prefix=>frameNames(prefix,config)};
}

const api={createInfantryAnimationController,validateConfig,unitOffsetMs,frameNames,STATES:ORDER.slice()};
if(typeof module==='object'&&module.exports)module.exports=api;
root.NRTSInfantryAnimation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
