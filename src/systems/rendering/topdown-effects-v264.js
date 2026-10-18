'use strict';
// v263/v264: small, bounded Canvas2D effects synchronized to real shots/hits.
// The existing pooled smoke line, projectile physics and damage remain untouched.
(function installTopdownBattleEffects(root){
  if(!root.NRTS||typeof fire!=='function')return;
  const bursts=[];
  const MAX_BURSTS=100;
  const stats={shots:0,musketShots:0,cannonShots:0,impactEvents:0,drawn:0,peakBursts:0};
  const twoD=()=>!root.__BATTLEFIELD_3D_V1__?.enabled?.();
  function add(kind,x,y,angle,weight=1,seed=1){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    bursts.push({kind,x,y,angle,weight,seed,born:elapsed});
    if(bursts.length>MAX_BURSTS)bursts.shift();
    stats.peakBursts=Math.max(stats.peakBursts,bursts.length);
  }
  const baseFire=fire;
  fire=function fireTopdownEffectsV264(unit,enemy){
    const before=unit?.reload;
    const result=baseFire.apply(this,arguments);
    if(!unit||unit.dead||!(unit.reload>before))return result;
    if(['infantry','officer','artillery'].includes(unit.type)&&unit.attackMode!=='bayonet'){
      const cannon=unit.type==='artillery',angle=unit.facing||0;
      const muzzle=cannon?19:16;
      add(cannon?'cannon':'musket',unit.x+Math.cos(angle)*muzzle,
        unit.y+Math.sin(angle)*muzzle,angle,1,unit.id);
      stats.shots++;if(cannon)stats.cannonShots++;else stats.musketShots++;
      // Audio is optional and unlocked only after a direct user gesture.
      root.__TOPDOWN_AUDIO_V265__?.shot(unit,cannon?'cannon':'musket');
    }
    return result;
  };
  const baseDamage=applyDamage;
  applyDamage=function applyDamageTopdownImpactV264(victim,damage,shock){
    const wasAlive=!!victim&&!victim.dead;
    const health=victim?.hp;
    const result=baseDamage.apply(this,arguments);
    if(wasAlive&&Number.isFinite(health)&&victim.hp<health&&victim.x!=null){
      // Throttle cascaded splash damage: only a fraction of nearby hits get
      // a visible impact accent; geometry is visual, damage stays upstream.
      const seed=(Math.imul(victim.id||1,1103515245)+Math.floor(elapsed*20))>>>0;
      if(seed%3===0){
        add('impact',victim.x,victim.y,seed/65535,Math.min(2.2,Math.max(.7,(health-victim.hp)/25)),seed);
        stats.impactEvents++;
      }
    }
    return result;
  };
  function drawBursts(){
    if(!twoD())return;
    const now=elapsed;
    ctx.save();
    for(let i=bursts.length-1;i>=0;i--){
      const b=bursts[i],age=now-b.born;
      const duration=b.kind==='cannon'?1.15:b.kind==='musket'?.58:.48;
      if(age<0||age>=duration){bursts.splice(i,1);continue;}
      if(!isWorldVisible(b.x,b.y,56))continue;
      const p=age/duration,e=1-p;
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
      if(b.kind==='impact'){
        ctx.globalAlpha=.32*e;
        ctx.fillStyle='#6a5c45';
        for(let k=0;k<4;k++){
          const a=k*2.399+b.seed*.00001;
          const r=3+p*17*(.7+k*.13);
          ctx.beginPath();ctx.ellipse(Math.cos(a)*r,Math.sin(a)*r,2.1*e+1,1.3*e+1,a,0,Math.PI*2);ctx.fill();
        }
      }else{
        const cannon=b.kind==='cannon';
        const shock=cannon?27:11;
        ctx.globalAlpha=(cannon?.27:.17)*e;
        ctx.strokeStyle=cannon?'#e2d6b5':'#efe3c0';
        ctx.lineWidth=(cannon?3.2:1.7)*e+.4;
        ctx.beginPath();ctx.ellipse(0,0,4+shock*p,(cannon?8:3)+shock*.4*p,0,0,Math.PI*2);ctx.stroke();
        // Dirt/smoke pool from the blast; existing persistent black powder
        // cloud continues to be owned by combat-animations.js.
        ctx.fillStyle=cannon?'#a79d84':'#c1b7a1';
        ctx.globalAlpha=(cannon?.18:.12)*e;
        for(let k=0;k<(cannon?5:2);k++){
          const dx=(k-2)*7;
          ctx.beginPath();ctx.arc(7+24*p+dx,Math.sin(k*2)*9,3.5+10*p,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.restore();stats.drawn++;
    }
    ctx.restore();
  }
  const baseDrawParticles=drawParticles;
  drawParticles=function drawTopdownBurstLayerV264(){
    baseDrawParticles();drawBursts();
  };
  const baseDrawUnit=drawUnit;
  drawUnit=function drawTopdownFirePoseV263(u){
    baseDrawUnit(u);
    if(!twoD()||!u||u.dead||!['infantry','officer'].includes(u.type)||!isWorldVisible(u.x,u.y,30))return;
    const state=root.__COMBAT_ANIMATIONS_V1__?.animationFor(u);
    if(state?.kind!=='musket-fire')return;
    // Musket reload has three readable beats: fire, reach for cartridge,
    // ram down the barrel. Draw only hands/ramrod, never alter positions.
    const t=state.t;
    if(t<.18||t>.92)return;
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
    const reach=t<.5?(t-.18)/.32:1-(t-.5)/.42;
    const hand=6+Math.max(0,reach)*5;
    ctx.strokeStyle='#d0ae89';ctx.lineWidth=1.45;
    ctx.beginPath();ctx.moveTo(1,-3.2);ctx.lineTo(hand,3.5);ctx.stroke();
    if(t>.40&&t<.78){
      ctx.strokeStyle='#aaaca8';ctx.lineWidth=.85;
      ctx.beginPath();ctx.moveTo(3,6);ctx.lineTo(11+Math.sin(t*11)*2,6);ctx.stroke();
    }
    ctx.restore();
  };
  const oldReset=resetGame;
  resetGame=function resetTopdownEffectsV264(){
    bursts.length=0;return oldReset.apply(this,arguments);
  };
  const api=Object.freeze({
    version:'264.0',visualOnly:true,projection:'Canvas2D',
    features:['shot-bloom','muzzle-pressure-wave','ramrod-and-reload','impact-dirt','bounded-pool'],
    stats:()=>({...stats,active:bursts.length,cap:MAX_BURSTS})
  });
  root.__TOPDOWN_EFFECTS_V264__=api;
  root.NRTS.subsystems.register('topdown-effects-v264',api,{
    phase:'2d-only',legacyBridge:false,responsibility:'2D fire poses and pooled visual combat feedback, no gameplay effect'
  });
})(window);
