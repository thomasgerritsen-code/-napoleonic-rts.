'use strict';
// v265: asset-free 2D positional sound, built on the browser Web Audio API.
// Nothing plays or creates an AudioContext until the player clicks Geluid aan.
(function installTopdownSoundV265(root){
  if(!root.NRTS)return;
  const stats={shots:0,muskets:0,cannons:0,drums:0,voiceDrops:0,unlockAttempts:0};
  const maxVoices=12;
  let audio=null,noise=null,voices=0,enabled=false,lastBeat=-Infinity;
  const lastVolley=new Map();
  const twoD=()=>true;
  const supported=!!(root.AudioContext||root.webkitAudioContext);
  const button=document.createElement('button');
  button.id='topdown-audio-toggle';
  button.type='button';
  button.textContent='🔇 Geluid aan';
  button.title='2D gevechtsgeluid: musketten, kanonnen en trommels (standaard uit)';
  button.setAttribute('aria-label','Zet 2D gevechtsgeluid aan');
  button.setAttribute('aria-pressed','false');
  const after=document.getElementById('resetBtn');
  after?.insertAdjacentElement('afterend',button);
  if(!supported){button.disabled=true;button.title='Web Audio wordt niet ondersteund';}

  function allocate(){
    if(audio||!supported)return audio;
    const Audio=root.AudioContext||root.webkitAudioContext;
    audio=new Audio();
    // Cache noise rather than regenerating a buffer on every volley.
    noise=audio.createBuffer(1,Math.max(1,Math.round(audio.sampleRate*.7)),audio.sampleRate);
    const data=noise.getChannelData(0);
    let seed=10391;
    for(let i=0;i<data.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)|0;
      data[i]=((seed>>>0)/2147483648-1);
    }
    return audio;
  }
  function audibility(x,y){
    const zoom=Math.max(.25,Number(camera?.zoom)||1);
    const halfView=Math.max(innerWidth,innerHeight)/zoom*.8;
    const dx=x-camera.x,dy=y-camera.y,dist=Math.hypot(dx,dy);
    const falloff=1/(1+(dist/Math.max(150,halfView*.55))**2);
    return{gain:dist>halfView*2?0:falloff,pan:Math.max(-.85,Math.min(.85,dx/Math.max(120,halfView)))};
  }
  function play(x,y,kind){
    if(!enabled||!audio||audio.state!=='running'||!twoD())return;
    const {gain,pan}=audibility(x,y);
    if(gain<.045)return;
    if(voices>=maxVoices){stats.voiceDrops++;return;}
    const cannon=kind==='cannon',drum=kind==='drum',time=audio.currentTime;
    const duration=cannon?.48:drum?.095:.19;
    const volume=cannon?.28:drum?.08:.12;
    const source=audio.createBufferSource();source.buffer=noise;
    const filter=audio.createBiquadFilter();filter.type=drum?'bandpass':'lowpass';
    filter.frequency.value=cannon?460:drum?185:1550;
    const envelope=audio.createGain();
    envelope.gain.setValueAtTime(.001,time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.001,gain*volume),time+.006);
    envelope.gain.exponentialRampToValueAtTime(.001,time+duration);
    source.connect(filter);filter.connect(envelope);
    if(audio.createStereoPanner){
      const stereo=audio.createStereoPanner();stereo.pan.value=pan;
      envelope.connect(stereo);stereo.connect(audio.destination);
    }else envelope.connect(audio.destination);
    voices++;
    source.onended=()=>{voices=Math.max(0,voices-1);try{source.disconnect();filter.disconnect();envelope.disconnect();}catch(_e){}};
    source.start(time);source.stop(time+duration+.015);
    if(drum)stats.drums++;
    else{stats.shots++;if(cannon)stats.cannons++;else stats.muskets++;}
  }
  async function toggle(){
    if(!supported)return false;
    stats.unlockAttempts++;
    if(!enabled){
      const context=allocate();
      try{await context.resume();}catch(_e){enabled=false;return false;}
      enabled=context.state==='running';
    }else enabled=false;
    button.textContent=enabled?'🔊 Geluid uit':'🔇 Geluid aan';
    button.setAttribute('aria-pressed',String(enabled));
    return enabled;
  }
  button.addEventListener('click',()=>{void toggle();});
  function shot(unit,kind){
    if(!unit||!enabled||!twoD())return;
    if(kind==='musket'&&unit.regimentId){
      const key=unit.regimentId,now=elapsed;
      const last=lastVolley.get(key)??-Infinity;
      // Group a 12- or 36-man volley into a compact realistic crack.
      if(now-last<.095)return;
      lastVolley.set(key,now);
    }
    play(unit.x,unit.y,kind);
  }
  const originalUpdate=update;
  update=function updateTopdownSoundV265(dt){
    const result=originalUpdate.apply(this,arguments);
    if(!enabled||!twoD()||gameOver||elapsed-lastBeat<.7)return result;
    lastBeat=elapsed;
    const visible=regiments.filter(r=>!r.destroyed&&r.marchV063?.v064&&
      groupKindV06(r)==='infantry'&&r.movementPhaseV063!=='bridge-waiting');
    const candidates=visible.map(reg=>{
      const m=regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
      const p=m.length?centroid(m):null;
      return p?{x:p.x,y:p.y,dist:Math.hypot(p.x-camera.x,p.y-camera.y)}:null;
    }).filter(Boolean).sort((a,b)=>a.dist-b.dist);
    if(candidates[0])play(candidates[0].x,candidates[0].y,'drum');
    return result;
  };
  const originalReset=resetGame;
  resetGame=function resetTopdownSoundV265(){
    lastVolley.clear();lastBeat=-Infinity;return originalReset.apply(this,arguments);
  };
  const api=Object.freeze({
    version:'265.0',projection:'Canvas2D',requiresUserGesture:true,enabled:()=>enabled,
    supported,stats:()=>({...stats,voices,enabled}),
    shot,buttonId:button.id
  });
  root.__TOPDOWN_AUDIO_V265__=api;
  root.NRTS.subsystems.register('topdown-audio-v265',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'optional user-unlocked positional synthetic cannon, musket and drum audio'
  });
})(window);
