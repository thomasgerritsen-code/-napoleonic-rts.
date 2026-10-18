'use strict';
// v271: real, event-driven infantry volley presentation for Canvas2D.
// Fire timing remains owned by combat-ai.js (3.1-second volley gate).
(function installTopdownVolleyV271(root){
  if(!root.NRTS||typeof fire!=='function')return;
  const groups=new Map(),stats={shots:0,grouped:0,aimedFrames:0,drawn:0};
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
    if(!unit||unit.dead||unit.type!=='infantry'||!(unit.reload>before)||!unit.regimentId)return result;
    const reg=getRegiment(unit.regimentId);
    if(!reg||reg.destroyed)return result;
    let event=groups.get(reg.id);
    if(!event||elapsed-event.last>.23||elapsed-event.born>.65){
      event={id:reg.id,born:elapsed,last:elapsed,count:0,x:unit.x,y:unit.y,side:unit.side};
      groups.set(reg.id,event);
    }
    event.count++;
    event.x+=(unit.x-event.x)/event.count;
    event.y+=(unit.y-event.y)/event.count;
    event.last=elapsed;
    stats.shots++;
    if(event.count>1)stats.grouped++;
    if(groups.size>50)groups.delete(groups.keys().next().value);
    return result;
  };
  const oldDraw=drawParticles;
  drawParticles=function drawTopdownVolleyV271(){
    oldDraw();
    if(!enabled())return;
    ctx.save();ctx.textAlign='center';ctx.font='bold 10px sans-serif';
    for(const [id,v] of groups){
      const age=elapsed-v.born;
      if(age>1.3||age<0){groups.delete(id);continue;}
      if(v.count<3||!isWorldVisible(v.x,v.y,120))continue;
      const fade=Math.min(1,(1.3-age)*1.4);
      const scale=Math.min(1.65,1+v.count/32);
      ctx.strokeStyle=`rgba(235,213,160,${Math.max(0,.42*fade)})`;
      ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(v.x,v.y,18*scale+age*13,9*scale+age*9,0,0,Math.PI*2);ctx.stroke();
      if(age<.7){
        ctx.fillStyle=`rgba(246,233,198,${.86*(1-age/.7)})`;
        ctx.fillText(`SALVO ×${v.count}`,v.x,v.y-31);
      }
      stats.drawn++;
    }
    ctx.restore();
  };
  const oldReset=resetGame;
  resetGame=function resetTopdownVolleyV271(){groups.clear();return oldReset.apply(this,arguments);};
  const api=Object.freeze({
    version:'271.0',projection:'Canvas2D',physicalFireAuthority:'combat-ai',preFirePose,
    groups:()=>[...groups.values()].map(v=>({...v})),
    stats:()=>({...stats,groups:groups.size})
  });
  root.__TOPDOWN_VOLLEY_V271__=api;
  root.NRTS.subsystems.register('topdown-volley-v271',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'shouldered pre-volley aim and synchronized firing-line readout built only from actual shots'
  });
})(window);
