import {ColumnModel,DEMO_WAYPOINTS} from './column-core.mjs';
const $=id=>document.getElementById(id);
const canvas=$('scene'),ctx=canvas.getContext('2d');
const toggle=$('toggle'),reset=$('reset'),size=$('size'),speed=$('speed'),routeToggle=$('routeToggle');
let model=new ColumnModel(DEMO_WAYPOINTS,{count:Number(size.value)});
let running=false,lastTime=null,elapsed=0,manager=null,driver=null;
const W=1130,H=655,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const route=model.route;
// The third-party YUKA Path and FollowPathBehavior run as an actual steering
// scout on exactly the same common route. Soldiers use fixed arc-length
// offsets to that shared route, avoiding independent paths and scattered blobs.
import('https://cdn.jsdelivr.net/npm/yuka@0.7.8/build/yuka.module.js').then(YUKA=>{
  const path=new YUKA.Path();
  for(const point of DEMO_WAYPOINTS)path.add(new YUKA.Vector3(point.x,0,point.y));
  driver=new YUKA.Vehicle();
  driver.position.copy(path.current());driver.maxSpeed=90;driver.maxForce=140;
  driver.steering.add(new YUKA.FollowPathBehavior(path,20));
  manager=new YUKA.EntityManager();manager.add(driver);
  $('engineStatus').textContent='YUKA 0.7.8 actief · één route voor de colonne';
}).catch(()=>{
  $('engineStatus').textContent='Offline: eigen deterministische route werkt; YUKA niet bereikbaar';
});
function resize(){
  const dpr=Math.min(2,devicePixelRatio||1),w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  }
  return{w,h,dpr};
}
function line(points,color,width,first=-Infinity,last=Infinity){
  ctx.beginPath();let pen=false;
  for(const p of points){
    if(p.x<first||p.x>last){pen=false;continue;}
    if(!pen){ctx.moveTo(p.x,p.y);pen=true;}else ctx.lineTo(p.x,p.y);
  }
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function scenery(){
  ctx.fillStyle='#819564';ctx.fillRect(0,0,W,H);
  for(let i=0;i<60;i++){
    const x=25+(i*317)%1070,y=14+(i*149)%617;
    if(Math.abs(x-700)<83||Math.abs(y-350)<80)continue;
    ctx.fillStyle=i%3?'#52764e':'#63854d';
    ctx.beginPath();ctx.arc(x,y,4+i%8,0,Math.PI*2);ctx.fill();
  }
  const bank=[];for(let y=-10;y<=H+20;y+=10)bank.push({x:698+9*Math.sin(y/64)+5*Math.sin(y/23),y});
  line(bank,'#52767f',112);line(bank,'#83a7a4',83);
  for(const [a,b] of [[-Infinity,645],[755,Infinity]]){
    line(route,'#6d654c',94,a,b);line(route,'#c5b486',78,a,b);
  }
  ctx.fillStyle='#574f45';ctx.fillRect(639,311,124,79);
  ctx.fillStyle='#c3ad86';ctx.fillRect(645,317,112,67);
  ctx.strokeStyle='#665a48';ctx.lineWidth=2;ctx.strokeRect(645,317,112,67);
  for(let x=651;x<756;x+=13){ctx.strokeStyle='#9c8967';ctx.beginPath();ctx.moveTo(x,319);ctx.lineTo(x,383);ctx.stroke();}
  if(routeToggle.checked){
    ctx.setLineDash([11,13]);line(route,'#f5e9ac',2);ctx.setLineDash([]);
  }
  ctx.font='bold 17px system-ui';ctx.fillStyle='#efe9d0';ctx.textAlign='center';
  ctx.fillText('Pont de la Chaussée',702,287);
  ctx.font='13px system-ui';ctx.fillStyle='#243922';ctx.fillText('Wegmars vanaf de westkant',373,266);
}
function drawSoldiers(){
  const moving=running&&model.distance<model.length;
  for(const u of model.soldiers()){
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.angle);
    const step=moving?Math.sin(elapsed*11+u.rank*.75+u.file*.4)*2:0;
    ctx.strokeStyle='#253e57';ctx.lineWidth=2.4;ctx.beginPath();
    ctx.moveTo(-4,-4);ctx.lineTo(-8+step,-6);ctx.moveTo(-4,4);ctx.lineTo(-8-step,6);ctx.stroke();
    ctx.fillStyle='#386ba5';ctx.strokeStyle='#f4dea8';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(1,0,5.8,6.9,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e8c995';ctx.beginPath();ctx.arc(-1,0,3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}
function paint(){
  const{w,h,dpr}=resize();
  const viewW=w<690?550:1130,scale=w/viewW,viewH=h/scale;
  const head=model.positionAt(model.distance);
  const cameraX=w<690?clamp(head.x-viewW*.56,0,W-viewW):0;
  const cameraY=w<690?clamp(head.y-viewH*.48,0,Math.max(0,H-viewH)):0;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,-cameraX*dpr*scale,-cameraY*dpr*scale);
  scenery();drawSoldiers();
  const tail=model.soldiers().at(-1);
  const across=head.x>=645&&tail.x<=760;
  $('phase').textContent=model.distance>=model.length?'✓ Regiment aangekomen':
    across?'Brug · 4 breed':running?'Wegmars · 4 breed':'Wacht op marsbevel';
  $('count').textContent=model.count+' soldaten';
}
function labelButton(){toggle.textContent=running?'Ⅱ Pauzeren':model.distance>=model.length?'▶ Opnieuw marcheren':'▶ Start mars';}
function tick(now){
  const dt=lastTime===null?0:Math.min(.05,(now-lastTime)/1000);lastTime=now;
  if(running&&dt>0){
    elapsed+=dt;
    if(manager)manager.update(dt);
    model.advance(dt*Number(speed.value));
    if(model.distance>=model.length){running=false;labelButton();}
  }
  paint();requestAnimationFrame(tick);
}
toggle.onclick=()=>{
  if(model.distance>=model.length){model.reset();elapsed=0;}
  running=!running;labelButton();
};
reset.onclick=()=>{running=false;model.reset();elapsed=0;labelButton();paint();};
size.onchange=()=>{
  model=new ColumnModel(DEMO_WAYPOINTS,{count:Number(size.value)});
  running=false;elapsed=0;labelButton();paint();
};
speed.oninput=()=>{$('speedOut').textContent=speed.value;};
routeToggle.onchange=paint;
window.addEventListener('resize',paint);
window.marchLab={get model(){return model;},get running(){return running;},
  start(){running=true;labelButton();},pause(){running=false;labelButton();},
  reset(){model.reset();running=false;labelButton();}};
requestAnimationFrame(tick);
