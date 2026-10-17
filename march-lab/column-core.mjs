/**
 * Deterministic four-file formation geometry.
 * Input waypoints can come from YUKA.Path (MIT, https://github.com/Mugen87/yuka).
 * Soldiers follow ONE arc-length route, not individual routes.
 */
export const DEMO_WAYPOINTS = Object.freeze([
  {x:270,y:444},{x:385,y:444},{x:486,y:350},{x:565,y:350},
  {x:650,y:350},{x:780,y:350},{x:890,y:277},{x:1000,y:226}
]);
export function interpolateRoute(waypoints,detail=14){
  if(!Array.isArray(waypoints)||waypoints.length<2)throw Error('At least two waypoints required');
  const points=[],steps=Math.max(1,Math.round(detail));
  for(let i=0;i<waypoints.length-1;i++){
    const p0=waypoints[Math.max(0,i-1)],p1=waypoints[i],p2=waypoints[i+1],p3=waypoints[Math.min(waypoints.length-1,i+2)];
    for(let j=0;j<steps;j++){
      const t=j/steps,t2=t*t,t3=t2*t;
      const f=k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3);
      points.push({x:f('x'),y:f('y')});
    }
  }
  points.push({...waypoints[waypoints.length-1]});
  return points;
}
export class ColumnModel{
  constructor(waypoints=DEMO_WAYPOINTS,options={}){
    this.files=4;this.count=options.count??36;this.fileGap=options.fileGap??16;this.rankGap=options.rankGap??22;
    this.route=interpolateRoute(waypoints,options.curveDetail??14);this.lengths=[0];
    for(let i=1;i<this.route.length;i++){
      const a=this.route[i-1],b=this.route[i];
      this.lengths.push(this.lengths[i-1]+Math.hypot(b.x-a.x,b.y-a.y));
    }
    this.length=this.lengths[this.lengths.length-1];this.distance=0;
  }
  reset(){this.distance=0;}
  advance(d){
    if(!Number.isFinite(d)||d<0)throw Error('Invalid distance');
    this.distance=Math.min(this.length,this.distance+d);return this.distance;
  }
  positionAt(distance){
    const path=this.route;
    if(distance<0){
      const a=path[0],b=path[1],heading=Math.atan2(b.y-a.y,b.x-a.x);
      return{x:a.x+Math.cos(heading)*distance,y:a.y+Math.sin(heading)*distance,angle:heading};
    }
    const s=Math.min(this.length,distance);let lo=0,hi=this.lengths.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>>1;if(this.lengths[mid]<s)lo=mid;else hi=mid;}
    const k=Math.max(1,hi),a=path[k-1],b=path[k],seg=this.lengths[k]-this.lengths[k-1];
    const t=seg>0?Math.min(1,Math.max(0,(s-this.lengths[k-1])/seg)):0;
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle};
  }
  soldiers(){
    const units=[];
    for(let i=0;i<this.count;i++){
      const rank=Math.floor(i/4),file=i%4,center=this.positionAt(this.distance-rank*this.rankGap);
      const lateral=(file-1.5)*this.fileGap;
      units.push({id:i,rank,file,
        x:center.x-Math.sin(center.angle)*lateral,
        y:center.y+Math.cos(center.angle)*lateral,angle:center.angle});
    }
    return units;
  }
}
