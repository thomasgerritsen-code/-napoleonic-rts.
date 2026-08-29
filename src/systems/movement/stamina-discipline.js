'use strict';
(function installStaminaDisciplineV1(global){
  const nrts=global.NRTS;if(!nrts)throw new Error('NRTS required');let tightenClock=0;
  function stamina(u){if(!Number.isFinite(u.staminaV1))u.staminaV1=100;return u.staminaV1;}
  function moving(u){return Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y)>5;}
  const oldUpdate=update;update=function(dt){for(const u of units){if(u.dead||u.type==='worker')continue;const s=stamina(u);const drain=u.chargeTimer>0?10:moving(u)?(u.type==='cavalry'?4.5:2.8):-7.5;u.staminaV1=Math.max(0,Math.min(100,s-drain*dt));}oldUpdate(dt);tightenClock+=dt;if(tightenClock>=2){tightenClock=0;for(const reg of regiments){if(reg.destroyed)continue;const m=regimentMembers(reg);if(!m.length)continue;const avg=m.reduce((a,u)=>a+stamina(u),0)/m.length;const hit=m.filter(u=>u.recentHit>0).length/m.length;reg.disciplineV1=Math.max(.35,Math.min(1,.55+avg/220-hit*.25));const settled=m.every(u=>!moving(u));if(settled&&reg.disciplineV1<.82)arrangeRegiment(reg,reg.targetX,reg.targetY,reg.formation);}}};
  const oldDesired=desiredGroupSpeedV064;desiredGroupSpeedV064=function(reg,...args){const base=oldDesired(reg,...args);const m=regimentMembers(reg);if(!m.length)return base;const avg=m.reduce((a,u)=>a+stamina(u),0)/m.length;return base*(.68+.32*avg/100);};
  const api=Object.freeze({stamina,discipline:reg=>reg.disciplineV1??1,speedFactor:u=>.68+.32*stamina(u)/100});nrts.subsystems.register('stamina-discipline',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'march fatigue, charge exhaustion, recovery and formation re-dressing'});global.__STAMINA_DISCIPLINE_V1__=api;
})(window);
