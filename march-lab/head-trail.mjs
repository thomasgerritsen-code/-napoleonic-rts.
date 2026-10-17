// Arc-length history of the actual regiment leader, newest point first.
// A follower samples the same physical track as every other rank. Unlike an
// interpolated future plan, this cannot round a bend across a river or village.
export class HeadTrail {
  constructor({limit=720,spacing=2.5,jump=125}={}) {
    this.limit=limit;
    this.spacing=spacing;
    this.jump=jump;
    this.points=[];
    this.heading=0;
    this.length=0;
  }
  reset(x,y,heading=0) {
    this.points=[{x,y}];
    this.length=0;
    this.heading=Number.isFinite(heading)?heading:0;
  }
  record(x,y,heading=this.heading) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    if(!this.points.length) {this.reset(x,y,heading);return;}
    const previous=this.points[0];
    const delta=Math.hypot(x-previous.x,y-previous.y);
    if(delta>this.jump){this.reset(x,y,heading);return;}
    if(delta>=this.spacing) {
      // Keep the prior head point when enough distance has been travelled;
      // short per-frame movements still update the present end of the track.
      this.points.unshift({x,y});
    }else {
      this.points[0]={x,y};
    }
    if(delta>.01) this.heading=Math.atan2(y-previous.y,x-previous.x);
    else if(Number.isFinite(heading)&&this.points.length===1)this.heading=heading;
    let length=0,keep=this.points.length;
    for(let i=1;i<this.points.length;i++){
      length+=Math.hypot(this.points[i-1].x-this.points[i].x,
                         this.points[i-1].y-this.points[i].y);
      if(length>=this.limit){keep=i+1;break;}
    }
    if(keep<this.points.length)this.points.length=keep;
    this.length=length;
  }
  sample(back=0) {
    const front=this.points[0];
    if(!front)return null;
    const first=this.points[1];
    const initialAngle=first?Math.atan2(front.y-first.y,front.x-first.x):this.heading;
    if(back<=0)return{x:front.x-Math.cos(initialAngle)*back,
                       y:front.y-Math.sin(initialAngle)*back,angle:initialAngle};
    let remaining=back;
    for(let i=1;i<this.points.length;i++) {
      const a=this.points[i-1],b=this.points[i];
      const seg=Math.hypot(a.x-b.x,a.y-b.y);
      if(seg<.0001)continue;
      const angle=Math.atan2(a.y-b.y,a.x-b.x);
      if(remaining<=seg){
        const t=remaining/seg;
        return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle};
      }
      remaining-=seg;
    }
    const last=this.points[this.points.length-1];
    const prev=this.points[this.points.length-2];
    const angle=prev?Math.atan2(prev.y-last.y,prev.x-last.x):initialAngle;
    return{x:last.x-Math.cos(angle)*remaining,
           y:last.y-Math.sin(angle)*remaining,angle};
  }
}
