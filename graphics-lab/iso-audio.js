// Graphics Lab v333/v334 — synthesised battle sounds for the isometric scene:
// musket shots, cannon, misfires, drums and spoken commands. Everything is generated with
// WebAudio (no sound files); commands use the browser's speech synthesis.
// Off by default; the AudioContext is only created after a click.
(function(){
'use strict';
function create(){
 let ctx=null,noise=null,master=null,on=false;
 const stats={shots:0,merged:0,misfires:0,drums:0,commands:0,cannon:0};
 // Shots in the same 60 ms window share one louder report instead of stacking.
 let windowAt=-1,windowCount=0;
 const MAX_PER_WINDOW=6;

 function init(){
   if(ctx)return;
   const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
   ctx=new AC();
   master=ctx.createGain();master.gain.value=0.7;
   const comp=ctx.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=6;
   master.connect(comp);comp.connect(ctx.destination);
   noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*1.5),ctx.sampleRate);
   const data=noise.getChannelData(0);let seed=12345;
   for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1103515245)+12345)>>>0;data[i]=seed/2147483648-1;}
 }
 const panner=pan=>{const p=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();if(p.pan)p.pan.value=Math.max(-1,Math.min(1,pan));p.connect(master);return p;};
 function burst({at,pan,gain,decay,freq,q,type='bandpass',rate=1}){
   const src=ctx.createBufferSource();src.buffer=noise;src.loop=true;src.playbackRate.value=rate;
   const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
   const g=ctx.createGain();g.gain.setValueAtTime(0.0001,at);g.gain.exponentialRampToValueAtTime(gain,at+0.004);
   g.gain.exponentialRampToValueAtTime(0.0001,at+decay);
   src.connect(f);f.connect(g);g.connect(panner(pan));src.start(at,Math.random()*0.5,decay+0.05);
 }
 function thump({at,pan,gain,from,to,decay}){
   const o=ctx.createOscillator(),g=ctx.createGain();
   o.frequency.setValueAtTime(from,at);o.frequency.exponentialRampToValueAtTime(to,at+decay);
   g.gain.setValueAtTime(gain,at);g.gain.exponentialRampToValueAtTime(0.0001,at+decay);
   o.connect(g);g.connect(panner(pan));o.start(at);o.stop(at+decay+0.02);
 }
 // pan -1..1 (screen left..right), near 0..1 (1 = in view, close).
 function shot(pan,near){
   if(!on||!ctx)return;
   const now=ctx.currentTime;
   if(now-windowAt>0.06){windowAt=now;windowCount=0;}
   if(++windowCount>MAX_PER_WINDOW){stats.merged++;return;}
   stats.shots++;
   const at=now+Math.random()*0.02,v=0.25+0.55*near;
   burst({at,pan,gain:v,decay:0.38,freq:900+Math.random()*500,q:0.7,rate:0.8+Math.random()*0.4});
   burst({at,pan,gain:v*0.5,decay:1.1,freq:260,q:0.5,type:'lowpass'});
   thump({at,pan,gain:v*0.6,from:90,to:38,decay:0.25});
 }
 // Field gun: a sharp crack over a long, low boom that rolls away.
 function cannon(pan,near){
   if(!on||!ctx)return;
   stats.cannon++;
   const at=ctx.currentTime,v=0.5+0.5*near;
   burst({at,pan,gain:v*0.8,decay:0.22,freq:1100,q:0.6});
   burst({at,pan,gain:v,decay:2.6,freq:170,q:0.4,type:'lowpass',rate:0.6});
   thump({at,pan,gain:v,from:72,to:26,decay:0.9});
 }
 // Flash in the pan: a click and a short fizz, no report.
 function misfire(pan,near){
   if(!on||!ctx)return;
   stats.misfires++;
   const at=ctx.currentTime;
   burst({at,pan,gain:0.12+0.2*near,decay:0.05,freq:3800,q:2});
   burst({at:at+0.03,pan,gain:0.06+0.1*near,decay:0.22,freq:5200,q:0.8,type:'highpass'});
 }
 function drum(pan,accent){
   if(!on||!ctx)return;
   stats.drums++;
   const at=ctx.currentTime,v=accent?0.32:0.2;
   burst({at,pan,gain:v,decay:0.12,freq:1800,q:0.9});
   thump({at,pan,gain:v*0.8,from:180,to:110,decay:0.14});
 }
 function say(text,lang){
   if(!on)return;
   stats.commands++;
   try{
     const s=window.speechSynthesis;if(!s||typeof SpeechSynthesisUtterance!=='function')return;
     const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=1.05;u.pitch=lang==='fr-FR'?1.1:0.85;u.volume=1;
     s.speak(u);
   }catch(_){/* speech is optional */}
 }
 function setOn(v){
   on=!!v;
   if(on){init();if(ctx&&ctx.state==='suspended')ctx.resume();}
   else{try{window.speechSynthesis&&window.speechSynthesis.cancel();}catch(_){}}
   return on;
 }
 return{shot,cannon,misfire,drum,say,setOn,isOn:()=>on,ready:()=>!!ctx,stats:()=>({...stats,on,context:ctx?ctx.state:'none'})};
}
window.NRTSIsoAudio={create};
})();
