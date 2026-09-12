'use strict';
// ---------- v1.3.2: moving formation cohesion + friendly regiment passing ----------
(function installFormationTrafficV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS runtime must load before formation traffic.');

  const stats={passingPairs:0,bridgePriorityYields:0,cohesionSlowdowns:0,overlapCorrections:0};
  const PASS_TTL=.72;

  function regFor(u){return u?.regimentId?getRegiment(u.regimentId):null;}
  function bridgeInfo(reg){
    const info=reg?.crossingTrafficV068;
    return info?.forcedColumn?info:null;
  }
  function bridgeRank(info){
    if(!info)return 0;
    if(info.state==='crossing')return 5;
    if(info.state==='clearing')return 4;
    if(info.state==='approach')return 3;
    if(info.state==='waiting')return 2;
    if(info.state==='queued')return 1;
    return 0;
  }
  function regDirection(reg){
    const march=reg?.marchV063;
    if(march&&Number.isFinite(march.marchFacing))return{x:Math.cos(march.marchFacing),y:Math.sin(march.marchFacing)};
    const members=reg?regimentMembers(reg):[];
    if(!members.length)return null;
    const moving=members.find(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&Math.hypot(u.targetX-u.x,u.targetY-u.y)>3);
    if(!moving)return null;
    const dx=moving.targetX-moving.x,dy=moving.targetY-moving.y,d=Math.hypot(dx,dy)||1;
    return{x:dx/d,y:dy/d};
  }
  function setPassBias(reg,dir){
    if(!reg||!dir||bridgeInfo(reg))return;
    const amount=58;
    reg.formationTrafficV132={x:-dir.y*amount,y:dir.x*amount,until:elapsed+PASS_TTL,reason:'right-hand-pass'};
  }
  function clearExpiredBias(reg){
    if(reg?.formationTrafficV132&&reg.formationTrafficV132.until<=elapsed)reg.formationTrafficV132=null;
  }

  const previousApplyFormationTargets=applyFormationTargetsV063;
  applyFormationTargetsV063=function applyFormationTargetsTrafficV132(reg,centerX,centerY,offsets,facing,phase){
    clearExpiredBias(reg);
    const bias=reg?.formationTrafficV132;
    const info=bridgeInfo(reg);
    const bridgeYield=Boolean(bias?.reason==='bridge-yield'&&info&&['queued','waiting','approach'].includes(info.state));
    if(bias&&(!info||bridgeYield)){
      centerX+=bias.x;
      centerY+=bias.y;
    }
    return previousApplyFormationTargets(reg,centerX,centerY,offsets,facing,phase);
  };

  function cohesion(reg){
    const members=regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);
    if(!members.length)return{readiness:1,mean:0,p90:0};
    const errors=[];
    let ready=0,sum=0;
    for(const u of members){
      const d=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
      errors.push(d);sum+=d;if(d<=24)ready++;
    }
    errors.sort((a,b)=>a-b);
    const p90=errors[Math.min(errors.length-1,Math.floor((errors.length-1)*.9))]||0;
    return{readiness:ready/members.length,mean:sum/members.length,p90};
  }

  const previousDesiredGroupSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function desiredGroupSpeedFormationCohesionV132(reg,march,roadMarch){
    const base=previousDesiredGroupSpeed(reg,march,roadMarch);
    if(!(base>0)||!reg||reg.destroyed||!march?.v064||groupKindV06(reg)==='artillery')return base;
    const info=bridgeInfo(reg);
    if(info?.state==='waiting'||info?.state==='queued')return base;

    const c=cohesion(reg);
    const orderAge=Math.max(0,elapsed-(reg.formationTrafficOrderedAtV132??march.phaseStartedAt??elapsed));
    let factor=1;

    // Immediately after a new order the anchor briefly gives the line time to close up.
    // Once the march is established, never let one lagging file stop a whole battalion.
    if(orderAge<2.0&&c.readiness<.76)factor=Math.min(factor,Math.max(.62,.72+c.readiness*.30));
    if(c.mean>42)factor=Math.min(factor,Math.max(.78,1-(c.mean-42)/220));
    if(c.p90>88)factor=Math.min(factor,.84);
    if((info?.state==='approach'||info?.state==='crossing')&&c.readiness<.58)factor=Math.min(factor,.78);

    const minimumFactor=(info?.state==='approach'||info?.state==='crossing') ? .62 : .74;
    factor=Math.max(minimumFactor,factor);
    if(factor<.985)stats.cohesionSlowdowns++;
    return base*factor;
  };

  function sameCrossing(a,b){return a&&b&&a.crossingId===b.crossingId;}
  function installBridgeYield(regLow,regHigh){
    const low=bridgeInfo(regLow),high=bridgeInfo(regHigh);
    if(!low||!high||!sameCrossing(low,high)||bridgeRank(low)>=bridgeRank(high))return false;
    const dir=regDirection(regLow);
    if(!dir)return false;
    regLow.formationTrafficV132={x:-dir.x*34,y:-dir.y*34,until:elapsed+.5,reason:'bridge-yield'};
    stats.bridgePriorityYields++;
    return true;
  }

  resolveUnitOverlaps=function resolveUnitOverlapsFormationTrafficV132(){
    const visited=new Set();
    for(const u of units){
      if(!u||u.dead)continue;
      for(const other of nearbyNavUnits(u)){
        if(!other||other.dead||other===u)continue;
        const pair=u.id<other.id?`${u.id}:${other.id}`:`${other.id}:${u.id}`;
        if(visited.has(pair))continue;
        visited.add(pair);
        let dx=other.x-u.x,dy=other.y-u.y;
        let d=Math.hypot(dx,dy);
        const minD=(Number(TYPES[u.type]?.radius)||7)+(Number(TYPES[other.type]?.radius)||7)+1.5;
        if(d>=minD)continue;
        if(d<.001){const angle=((u.id*37+other.id*53)%360)*Math.PI/180;dx=Math.cos(angle);dy=Math.sin(angle);d=1;}
        const sameGroup=!!(u.regimentId&&u.regimentId===other.regimentId);
        const sameReg=sameGroup?getRegiment(u.regimentId):null;
        if(sameReg&&!sameReg.destroyed&&!u.routing&&!other.routing)continue;
        const regA=regFor(u),regB=regFor(other);
        const friendly=u.side===other.side;
        const nx=dx/d,ny=dy/d,overlap=minD-d;

        if(friendly&&regA&&regB&&regA.id!==regB.id){
          const infoA=bridgeInfo(regA),infoB=bridgeInfo(regB);
          if(infoA&&infoB&&sameCrossing(infoA,infoB)){
            const rankA=bridgeRank(infoA),rankB=bridgeRank(infoB);
            if(rankA!==rankB){
              const priority=rankA>rankB?regA:regB;
              const yielding=priority===regA?regB:regA;
              installBridgeYield(yielding,priority);
              if(priority===regA){other.x+=nx*overlap*.18;other.y+=ny*overlap*.18;}
              else{u.x-=nx*overlap*.18;u.y-=ny*overlap*.18;}
              stats.overlapCorrections++;
              continue;
            }
          }
          const dirA=regDirection(regA),dirB=regDirection(regB);
          if(dirA&&dirB){
            const dot=dirA.x*dirB.x+dirA.y*dirB.y;
            const cross=Math.abs(dirA.x*dirB.y-dirA.y*dirB.x);
            if(dot<.55||cross>.42){
              setPassBias(regA,dirA);setPassBias(regB,dirB);stats.passingPairs++;
              u.x-=nx*overlap*.08;u.y-=ny*overlap*.08;
              other.x+=nx*overlap*.08;other.y+=ny*overlap*.08;
              stats.overlapCorrections++;
              continue;
            }
          }
        }

        const softCombat=u.side!==other.side&&!!(regA?.engagementV069||regB?.engagementV069);
        const bothSettled=u.arrivedAtTarget&&other.arrivedAtTarget;
        const correction=overlap*(softCombat ? 0.10 : bothSettled ? 0.12 : 0.24);
        u.x-=nx*correction;u.y-=ny*correction;
        other.x+=nx*correction;other.y+=ny*correction;
        if(typeof navStats!=='undefined')navStats.overlapCorrections++;
        stats.overlapCorrections++;
      }
    }
    if(typeof syncAllBatteryCrewV061==='function')syncAllBatteryCrewV061(0);
  };

  const previousOrderGroupPath=orderGroupPathV06;
  orderGroupPathV06=function orderGroupPathFormationTrafficV132(reg,x,y,formation=reg?.formation,finalFacing=null){
    if(reg){reg.formationTrafficV132=null;reg.formationTrafficOrderedAtV132=elapsed;}
    return previousOrderGroupPath(reg,x,y,formation,finalFacing);
  };

  const api=Object.freeze({version:'formation-traffic-v1',movingCohesion:true,rightHandPassing:true,bridgePriority:true,stats:()=>({...stats})});
  global.__FORMATION_TRAFFIC_V1__=api;
  nrts.subsystems.register('formation-traffic',api,{phase:'v1.3.2',legacyBridge:false,responsibility:'keep moving battalions in their selected field formation, allow friendly formations to pass, and protect active bridge traffic from queued formations'});
})(window);
