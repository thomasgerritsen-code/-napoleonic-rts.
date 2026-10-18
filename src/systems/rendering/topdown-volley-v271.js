'use strict';
// v271: real, event-driven infantry volley presentation for Canvas2D.
// Fire timing remains owned by combat-ai.js (3.1-second volley gate).
(function installTopdownVolleyV271(root){
  if(!root.NRTS||typeof fire!=='function')return;
  const groups=new Map(),stats={shots:0,grouped:0,aimedFrames:0,drawn:0};
  const MAX_MUZZLES=32,MAX_DRAW_PUFFS=240;
  const enabled=()=>!root.__BATTLEFIELD_3D_V1__?.enabled?.();
  function preFirePose(u){
    if(!enabled()||!u||u.dead||u.routing||u.type!=='infantry'||u.attackMode==='bayonet')return null;
    const reg=u.regimentId?getRegiment(u.regimentId):null;
    if(!reg||reg.destroyed||reg.formation!=='line'||reg.engagementV069?.mode!=='fire')return null;
    if(reg.crossingTrafficV068?.forcedColumn||reg.marchV063?.locomotionV064==='road-march')return null;
    if(!(u.reload<.42&&volleyClock>2.55))return null;
    const untilVolley=Math.max(0,3.1-volleyClock);
    const shoulder=Math.max(0,Math.min(1,(.42-untilVolley)/.31));
    stats.aimedFrames++;
    return {phase:'aim',shoulder:.35+.65*shoulder,recoil:0,ramrod:0};
  }
  const originalFire=fire;
  fire=function fireTopdownVolleyV271(unit,enemy){
    const before=unit?.reload;
    const result=originalFire.apply(this,arguments);
    if(!enabled()||!unit||unit.dead||unit.type!=='infantry'||!(unit.reload>before)||!unit.regimentId)return result;
    const reg=getRegiment(unit.regimentId);
    if(!reg||reg.destroyed)return result;
    let event=groups.get(reg.id);
    if(!event||elapsed-event.last>.23||elapsed-event.born>.65){
      event={id:reg.id,born:elapsed,last:elapsed,count:0,x:unit.x,y:unit.y,side:unit.side,muzzles:[]};
      groups.set(reg.id,event);
    }
    event.count++;
    event.x+=(unit.x-event.x)/event.count;
    event.y+=(unit.y-event.y)/event.count;
    event.last=elapsed;
    // Record the actual muzzle after combat-ai has oriented the shooter.
    // Keep a bounded sample of the firing line, not a synthetic circle at its centre.
    const facing=unit.facing||0;
    const sample={x:unit.x+Math.cos(facing)*20,y:unit.y+Math.sin(facing)*20,
      dx:Math.cos(facing),dy:Math.sin(facing),at:elapsed};
    if(event.muzzles.length<MAX_MUZZLES)event.muzzles.push(sample);
    else event.muzzles[1+(event.count-MAX_MUZZLES-1)%(MAX_MUZZLES-1)]=sample;
    stats.shots++;
    if(event.count>1)stats.grouped++;
    if(groups.size>50)groups.delete(groups.keys().next().value);
    return result;
  };
  const oldDraw=drawParticles;
  drawParticles=function drawTopdownVolleyFrontV276(){
    oldDraw.apply(this,arguments);
    if(!enabled())return;
    // Short individual muzzle wisps merge into the longer-lived smoke bank
    // already managed by combat-animations.js. No arcade ring or SALVO text.
    const wind=root.__MAP_AMBIENT_MOTION_V1__?.currentWind?.(elapsed)||
      {x:.72,y:-.28,strength:1};
    const strength=Math.max(0,Math.min(2,wind.strength||0));
    const wx=Number.isFinite(wind.x)?wind.x:0;
    const wy=Number.isFinite(wind.y)?wind.y:0;
    let drawnPuffs=0;
    ctx.save();
    for(const [id,v] of groups){
      const age=elapsed-v.born;
      if(age<0||age>1.3){groups.delete(id);continue;}
      if(v.count<3||!isWorldVisible(v.x,v.y,175))continue;
      for(const m of v.muzzles){
        if(drawnPuffs>=MAX_DRAW_PUFFS)break;
        const shotAge=Math.max(0,elapsed-m.at);
        if(shotAge>1.3)continue;
        const fade=Math.max(0,1-shotAge/1.3);
        const drift=shotAge*18*strength;
        const forward=4+shotAge*9;
        const x=m.x+m.dx*forward+wx*drift;
        const y=m.y+m.dy*forward+wy*drift;
        ctx.fillStyle=shotAge<.24?'#eeeae1':'#d5d7d5';
        ctx.globalAlpha=.25*fade;
        ctx.beginPath();
        ctx.ellipse(x,y,2.3+shotAge*8,1.4+shotAge*4,
          Math.atan2(m.dy,m.dx),0,Math.PI*2);
        ctx.fill();
        drawnPuffs++;
      }
      if(drawnPuffs>=MAX_DRAW_PUFFS)break;
      stats.drawn++;
    }
    ctx.restore();
  };
  const oldReset=resetGame;
  resetGame=function resetTopdownVolleyV271(){groups.clear();return oldReset.apply(this,arguments);};
  const api=Object.freeze({
    version:'271.1-276',projection:'Canvas2D',physicalFireAuthority:'combat-ai',preFirePose,
    groups:()=>[...groups.values()].map(v=>({...v,muzzles:v.muzzles.map(m=>({...m}))})),
    stats:()=>({...stats,groups:groups.size,maxMuzzles:MAX_MUZZLES,maxDrawPuffs:MAX_DRAW_PUFFS})
  });
  root.__TOPDOWN_VOLLEY_V271__=api;
  root.NRTS.subsystems.register('topdown-volley-v271',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'2D aim and individual muzzle wisps following real synchronized regiment shots'
  });
})(window);
