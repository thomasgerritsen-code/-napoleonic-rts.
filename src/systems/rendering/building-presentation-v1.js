'use strict';
// Presentation only. Construction follows the authoritative progress; render
// time animates tools and dust but never advances a building or moves a worker.
(function buildingPresentation(root){
  if(root.__NRTS_SERVER__||!root.NRTS_CONFIG?.mining||root.__BUILDING_PRESENTATION_V1__)return;
  const clamp=n=>Math.max(0,Math.min(1,n)),lerp=(a,b,t)=>a+(b-a)*t;
  const seed=id=>(Math.imul((Number(id)||0)+37,2654435761)>>>0)/4294967296;
  const cache=new Map(),active=new Map(),byBuilding=new Map(),poses=new WeakMap(),progress=new WeakMap();
  const budget=6*2**20;let bytes=0,builds=0,hits=0,evictions=0,draws=0,dustDraws=0,created=0,previous=new Set(),current=new Set();
  function stage(b){const p=clamp(b.construction||0);return b.complete?'complete':p<.18?'foundation':p<.52?'frame':p<.82?'walls':'roof';}
  function prepare(allUnits,allBuildings){
    active.clear();byBuilding.clear();draws=dustDraws=0;
    previous=current;current=new Set();created=0;
    const sites=new Map();for(const b of allBuildings)if(!b.dead&&!b.complete)sites.set(`${b.x}:${b.y}:${b.type}`,b);
    for(const u of allUnits){
      if(u.dead||u.routing||u.type!=='worker'||u.task!=='build'||!u.buildingTarget)continue;
      const t=u.buildingTarget,b=sites.get(`${t.x}:${t.y}:${t.type}`);if(!b||b.side!==u.side)continue;
      const edge=Math.hypot(Math.max(0,Math.abs(u.x-b.x)-b.w/2),Math.max(0,Math.abs(u.y-b.y)-b.h/2));
      const working=b.type==='mine'||b.type==='lumbercamp'?edge<=64:Math.hypot(u.x-b.x,u.y-b.y)<=Math.max(b.w,b.h)*.75+2;if(!working)continue;
      active.set(u.id,b);byBuilding.set(b.id,(byBuilding.get(b.id)||0)+1);
    }
  }
  function worker(u,now){
    if(!active.has(u.id))return null;
    let p=poses.get(u);if(!p){p={};poses.set(u,p);}
    const t=(now/(.92+seed(u.id)*.17)+seed(u.id)*5)%1;
    // The tool frames are 0 raised, 2 halfway, 1 the blow and 3 its rebound. A
    // stroke holds the hammer up, swings it through, strikes and comes back up;
    // workers keep their own phase rather than hammering in lockstep.
    p.frame=t<.34?0:t<.43?2:t<.52?1:t<.6?3:t<.72?2:0;
    p.contact=t>=.43&&t<.6;p.scaleX=1+Math.sin(t*Math.PI*2)*.012;
    p.scaleY=1-(p.contact?.025:0);p.dx=0;p.dy=p.contact?.7:0;p.phase=t;return p;
  }
  function drawWork(ctx,u,pose,X,Y,z){
    if(!pose?.contact||dustDraws>=24||z<.8)return;
    const b=active.get(u.id);if(!b)return;
    const side=Math.sign(b.x-u.x)||1,a=(pose.phase-.43)/.17;
    ctx.save();ctx.fillStyle=`rgba(185,166,127,${(1-a)*.38})`;
    for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(X+side*(7+i*3)*z,Y-(3+a*7+i*2)*z,(1.5+a*3)*z,(1+a*1.8)*z,0,0,7);ctx.fill();dustDraws++;}
    ctx.restore();
  }
  const poly=(g,points,fill,stroke)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=.7;g.stroke();}};
  const line=(g,a,b,color,width=1)=>{g.beginPath();g.moveTo(...a);g.lineTo(...b);g.strokeStyle=color;g.lineWidth=width;g.stroke();};
  function crate(g,x,y,s=12){
    poly(g,[[x,y],[x+s,y-3],[x+s,y+s-3],[x,y+s]],'#88683e','#493e2b');
    poly(g,[[x,y],[x-5,y-4],[x+s-5,y-7],[x+s,y-3]],'#b39864','#665136');
    line(g,[x+2,y+2],[x+s-2,y+s-5],'#c0a16a',1.5);line(g,[x+s-2,y-1],[x+2,y+s-2],'#5d482f');
  }
  function barrel(g,x,y,s=8){
    g.fillStyle='#8c693e';g.beginPath();g.ellipse(x,y,s*.65,s,0,0,7);g.fill();
    g.fillStyle='#b39662';g.beginPath();g.ellipse(x,y-s*.7,s*.62,s*.3,0,0,7);g.fill();
    for(const d of[-.25,.5]){g.strokeStyle='#494a3f';g.lineWidth=1.4;g.beginPath();g.ellipse(x,y+d*s,s*.65,s*.24,0,0,Math.PI);g.stroke();}
    line(g,[x-2,y-s*.5],[x-2,y+s*.7],'rgba(55,40,20,.4)',.6);
  }
  function details(g,type,side){
    // The coordinates below use a common 256 x 224 image space, independent of
    // source resolution. Existing Blender walls, lighting and silhouettes stay.
    const thatch=type==='house'?[[66,131],[194,87],[164,0],[46,39]]:['stable','foundry'].includes(type)?[[67,130],[204,87],[176,2],[36,47]]:null;
    if(thatch){
      if(type==='foundry'){
        const slate=g.createLinearGradient(85,15,150,130);slate.addColorStop(0,'#555f61');slate.addColorStop(1,'#7c8381');poly(g,thatch,slate,'#454e50');
        for(let row=1;row<15;row++){
          const t=row/15,previous=(row-1)/15,a=[lerp(thatch[3][0],thatch[0][0],t),lerp(thatch[3][1],thatch[0][1],t)],b=[lerp(thatch[2][0],thatch[1][0],t),lerp(thatch[2][1],thatch[1][1],t)];
          line(g,a,b,'rgba(211,215,200,.33)',.6);
          for(let j=1;j<16;j++){const u=(j+(row%2)*.5)/16,aa=[lerp(thatch[3][0],thatch[0][0],previous),lerp(thatch[3][1],thatch[0][1],previous)],bb=[lerp(thatch[2][0],thatch[1][0],previous),lerp(thatch[2][1],thatch[1][1],previous)];line(g,[lerp(aa[0],bb[0],u),lerp(aa[1],bb[1],u)],[lerp(a[0],b[0],u),lerp(a[1],b[1],u)],'rgba(30,39,39,.32)',.5);}
        }
      }
      for(let i=1;i<27;i++){
        const t=i/28,a=[lerp(thatch[0][0],thatch[1][0],t),lerp(thatch[0][1],thatch[1][1],t)],b=[lerp(thatch[3][0],thatch[2][0],t),lerp(thatch[3][1],thatch[2][1],t)];
        if(type!=='foundry')line(g,a,b,i%3?'rgba(214,197,139,.19)':'rgba(66,53,25,.14)',.55);
      }
    }
    if(type==='house'){
      for(let i=0;i<5;i++)line(g,[181+i*4,184-i],[197+i*4,180-i],'#78532e',3);
      for(let i=0;i<3;i++)poly(g,[[133-i*3,177+i*3],[167+i*2,167+i*3],[172+i*2,171+i*3],[137-i*3,181+i*3]],i%2?'#9b9987':'#b3ae96','#777565');
      g.fillStyle='rgba(44,43,38,.16)';g.beginPath();g.ellipse(65,25,5,11,-.2,0,7);g.fill();
    }else if(type==='stable'){
      // Hitching rail, water trough, loose straw and feed sacks.
      for(const [x,y]of[[198,174],[240,163]])line(g,[x,y+13],[x,y-10],'#6d4d2e',3);
      line(g,[197,169],[241,158],'#9c7d4a',3);
      poly(g,[[186,186],[215,178],[228,183],[199,192]],'#b3a288','#5e6054');
      poly(g,[[186,186],[199,192],[199,201],[186,195]],'#827c68','#52574c');
      poly(g,[[199,192],[228,183],[228,192],[199,201]],'#686d60','#4a5149');
      poly(g,[[191,186],[215,180],[223,183],[199,189]],'#627a78');
      for(let i=0;i<23;i++)line(g,[165+i*17%67,192+i*11%13],[171+i*17%67,190+i*11%13],i%2?'#bd9f4f':'#88733c',.65);
      barrel(g,177,179,8);
      poly(g,[[144,179],[160,174],[169,179],[152,184]],'#baa04f','#755d32');
      for(let i=0;i<6;i++)line(g,[145+i*3,179-i*.8],[147+i*3,190-i*.8],'#8a693d',1);
      line(g,[145,191],[164,185],'#695336',2);
    }else if(type==='foundry'){
      // Brick chimney, coal, anvil and an iron-rimmed gun-carriage wheel.
      poly(g,[[192,151],[202,148],[202,75],[192,78]],'#8b5f46','#59483a');
      poly(g,[[202,148],[209,144],[209,71],[202,75]],'#654a3c','#42392f');
      for(let y=84;y<148;y+=7){line(g,[192,y],[202,y-3],'#bb9871',.65);line(g,[202,y-3],[209,y-6],'#96826b',.65);}
      poly(g,[[189,78],[201,74],[212,69],[200,66],[188,71]],'#ada18a','#4d493d');
      poly(g,[[193,72],[201,69],[207,71],[200,74]],'#292e2a');
      g.fillStyle='#383d37';g.beginPath();g.ellipse(221,187,17,8,-.2,0,7);g.fill();
      for(let i=0;i<15;i++)poly(g,[[208+i*7%28,185+i*5%8],[211+i*7%28,180+i*5%8],[215+i*7%28,184+i*5%8]],i%2?'#53584b':'#282e29');
      poly(g,[[164,188],[179,185],[179,195],[165,198]],'#696c60','#343d38');
      poly(g,[[159,182],[181,178],[184,182],[176,186],[163,189]],'#a2a69a','#4b5550');
      g.strokeStyle='#474d47';g.lineWidth=2.5;g.beginPath();g.ellipse(237,174,10,13,-.2,0,7);g.stroke();
      for(let i=0;i<6;i++){const a=i*Math.PI/3;line(g,[237,174],[237+Math.cos(a)*9,174+Math.sin(a)*12],'#8c794e',1.2);}
      crate(g,149,197,12);
    }else if(type==='towncenter'){
      poly(g,[[120,174],[142,169],[148,174],[125,180]],'#b3b0a1','#807f70');
      g.fillStyle='#be9c53';g.beginPath();g.arc(130,128,4.5,0,7);g.fill();g.strokeStyle='#594c34';g.lineWidth=.7;g.stroke();line(g,[130,128],[130,125],'#514c3e');line(g,[130,128],[133,129],'#514c3e');
      crate(g,189,170,10);barrel(g,211,165,7);
    }else if(type==='barracks'){
      crate(g,179,178,13);crate(g,195,174,10);barrel(g,215,169,7);
      for(let i=0;i<3;i++){line(g,[72+i*4,191],[75+i*4,169],'#6c5439',2);line(g,[75+i*4,169],[77+i*4,162],'#b5bbb0',.7);}
    }else if(type==='hospital'){
      crate(g,206,181,13);g.fillStyle='#e0d7be';g.fillRect(209,182,7,8);g.fillStyle='#a24f42';g.fillRect(212,183,2,6);g.fillRect(210,185,6,2);barrel(g,230,177,7);
    }else if(type==='mine'){
      // Rings and iron straps, timber grain, rope and exposed stone seams.
      for(let i=0;i<8;i++)line(g,[85+i%3,102+i*5],[91+i%2,105+i*5],'rgba(225,193,123,.45)',.6);
      for(const [x,y]of[[89,113],[89,140],[159,120],[159,145]]){line(g,[x-6,y],[x+5,y+1],'#3f443e',2);g.fillStyle='#b9b5a1';g.fillRect(x-3,y-.5,1,1);}
      g.strokeStyle='#b99b65';g.lineWidth=1;g.beginPath();g.arc(178,136,7,0,7);g.stroke();g.beginPath();g.arc(178,136,4,0,7);g.stroke();
      for(let i=0;i<8;i++)line(g,[65+i*15,77+i%3*13],[72+i*15,72+i%3*13],'rgba(198,186,147,.35)',.7);
      line(g,[123,164],[147,167],'#a0a397',1.4);crate(g,48,172,12);
    }else if(type==='lumbercamp'){
      for(let i=0;i<14;i++)line(g,[78+i*5,91+i],[78+i*5,126+i],'rgba(47,34,19,.27)',.6);
      for(let row=0;row<11;row++){const t=row/12;line(g,[lerp(48,99,t),lerp(72,38,t)],[lerp(165,217,t),lerp(108,72,t)],row%2?'rgba(45,36,24,.2)':'rgba(222,196,128,.34)',.7);}
      for(const [x,y]of[[63,90],[147,113],[197,96]]){line(g,[x-4,y],[x+4,y+2],'#41473f',2);g.fillStyle='#c4b795';g.fillRect(x-1,y,1,1);}
      for(let i=0;i<25;i++)line(g,[31+i*7%56,172+i*11%16],[35+i*7%56,171+i*11%16],'#d0b36d',.6);
      barrel(g,211,137,7);crate(g,34,142,12);
    }else if(type==='tower'){crate(g,177,184,12);barrel(g,194,180,7);}
    if(type==='stable'||type==='foundry'){
      poly(g,[[138,130],[152,126],[152,140],[138,144]],side==='britain'?'#9d4b3e':'#466686','#d0b974');
      line(g,[141,134],[149,132],'#ded2a8',1.2);
    }
  }
  function decorate(type,side,prop){
    if(!prop?.image)return prop;
    const key=type+':'+side;current.add(key);let old=cache.get(key);
    if(old&&old.source===prop.image){cache.delete(key);cache.set(key,old);hits++;return old.prop;}
    if(old){bytes-=old.bytes;cache.delete(key);}
    const width=Math.min(512,Math.max(320,prop.w)),height=Math.round(width*prop.h/prop.w),cost=width*height*4;
    if(created>=2)return prop;
    // Never evict artwork being used in this or the previous frame. A crowded
    // view may use its original art, rather than churn textures every frame.
    if(bytes+cost>budget){
      let available=budget-bytes;for(const [key,entry]of cache)if(!current.has(key)&&!previous.has(key))available+=entry.bytes;
      if(available<cost)return prop;
      for(const [key,entry]of cache){if(bytes+cost<=budget)break;if(!current.has(key)&&!previous.has(key)){cache.delete(key);bytes-=entry.bytes;evictions++;}}
    }
    created++;
    const c=document.createElement('canvas');c.width=width;c.height=height;
    const g=c.getContext('2d');g.drawImage(prop.image,0,0,c.width,c.height);
    // Fine material wear is baked once and clipped to the existing opaque art.
    g.save();g.globalCompositeOperation='source-atop';
    for(let i=0;i<420;i++){g.fillStyle=i%2?'rgba(236,225,188,.08)':'rgba(45,43,30,.08)';g.fillRect((i*97%c.width),(i*59%c.height),1+(i%3),.7);}
    g.restore();g.save();g.scale(c.width/256,c.height/224);details(g,type,side);g.restore();
    const result={...prop,image:c};delete result.rows;
    cache.set(key,{source:prop.image,prop:result,bytes:cost});bytes+=cost;builds++;return result;
  }
  // Where each picture stands: its wall footing (left, front and right corner),
  // the height of its eaves and its ridge, in source pixels from the pivot,
  // measured on the artwork. The site is laid out on those walls, so pegs,
  // timber frame, scaffold and rafters stand where the building will stand.
  const BUILT={
    house:{walls:[[-174,8],[-41,80],[174,0]],eave:104,ridge:[[-121,-192],[124,-287]]},
    barracks:{walls:[[-342,-2],[-187,143],[343,-47]],eave:215,ridge:[[-242,-272],[288,-432]]},
    stable:{walls:[[-255,-31],[-103,116],[252,-16]],eave:130,ridge:[[-198,-256],[197,-366]]},
    tower:{walls:[[-132,-52],[-57,63],[133,13]],eave:175,ridge:[[3,-367],[3,-367]]},
    lumbercamp:{walls:[[-66,-16],[21,8],[69,-12]],eave:48,ridge:[[-31,-106],[89,-72]],pad:[[-117,6],[31,49],[114,13]],scaffold:false},
    // A mine is dug, not built: the adit's timber portal goes in first.
    mine:{kind:'portal',pad:[[-115,3],[52,39],[117,3]],posts:[[-43,6,-55],[35,6,-55]]},
    // Field hospital tents: poles (x, top, foot) and the ridge poles between them.
    hospital_france:{kind:'tent',poles:[[-102,-79,38],[101,-125,-8],[-104,-137,-79],[31,-167,-110]],ridges:[[0,1],[2,3]]},
    hospital_britain:{kind:'tent',poles:[[-101,-126,-1],[99,-81,21],[17,-159,-81],[149,-129,-51]],ridges:[[0,1],[2,3]]}
  };
  BUILT.towncenter=BUILT.barracks;BUILT.foundry=BUILT.stable;
  const shapeOf=b=>BUILT[b.type+'_'+(b.nativeSide||b.side)]||BUILT[b.type]||null;
  const mix=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)],up=(q,d)=>[q[0],q[1]-d];
  const grow=(quad,c,f)=>quad.map(q=>[c[0]+(q[0]-c[0])*f,c[1]+(q[1]-c[1])*f]);
  function construction(g,b,prop,k,X,Y,z){
    draws++;const actual=clamp(b.construction||0),now=performance.now()/1000;
    let shown=progress.get(b);
    if(!shown||actual<shown.p){shown={p:actual,at:now};progress.set(b,shown);}
    const dt=Math.max(0,Math.min(.1,now-shown.at));shown.p+=(actual-shown.p)*(1-Math.exp(-dt/.075));shown.at=now;
    const p=shown.p,shape=shapeOf(b),kind=shape?.kind||'frame',S=q=>[X+q[0]*k,Y+q[1]*k],u=k;
    const left=X-prop.pivot.x*k,top=Y-prop.pivot.y*k,w=prop.w*k,h=prop.h*k;
    // The footing: measured, or a plot centred on the pivot for unknown art.
    let L,F,R;
    if(shape?.walls)[L,F,R]=shape.walls.map(S);
    else{const fw=b.w*z*.62;L=[X-fw,Y];F=[X,Y+fw*.5];R=[X+fw,Y];}
    if(kind==='tent'){const feet=shape.poles.map(q=>S([q[0],q[2]])),xs=feet.map(q=>q[0]),ys=feet.map(q=>q[1]);
      L=[Math.min(...xs)-14*u,Math.max(...ys)-10*u];R=[Math.max(...xs)+14*u,Math.min(...ys)+10*u];F=[lerp(L[0],R[0],.4),Math.max(...ys)+34*u];}
    const B=[L[0]+R[0]-F[0],L[1]+R[1]-F[1]],C=mix(L,R,.5),foot=[L,F,R,B];
    const pad=shape?.pad?(()=>{const [a,f,r]=shape.pad.map(S);return[a,f,r,[a[0]+r[0]-f[0],a[1]+r[1]-f[1]]];})():grow(foot,C,1.14);
    const eave=(shape?.eave??Math.min(140,prop.h*.3))*k;
    const out=(a,b2,d)=>{const m=mix(a,b2,.5),dx=m[0]-C[0],dy=m[1]-C[1],l=Math.hypot(dx,dy)||1;return[dx/l*d,dy/l*d];};
    // 1. The plot: bared earth, a stone plinth rising on the footing, pegs and lines.
    if(kind==='tent'){g.fillStyle='rgba(122,111,75,.5)';g.beginPath();g.ellipse(C[0],lerp(C[1],F[1],.35),Math.abs(R[0]-L[0])*.62,Math.abs(R[0]-L[0])*.3,0,0,7);g.fill();}
    else poly(g,pad,'#83734f','rgba(68,61,41,.6)');
    if(kind==='frame'&&!shape?.pad){
      const base=grow(foot,C,1.03),rise=clamp((p-.06)/.12)*9*u,[a,f,r,bk]=base;
      if(rise>0){
        poly(g,[a,f,up(f,rise),up(a,rise)],'#8f8a72','#5f604f');poly(g,[f,r,up(r,rise),up(f,rise)],'#a19b80','#5f604f');
        poly(g,base.map(q=>up(q,rise)),'#b4ad91','#6c6d5a');
        for(let i=1;i<6;i++){const t=i/6;line(g,up(mix(a,f,t),rise),mix(a,f,t),'#666b5a',Math.max(.5,u*1.2));line(g,up(mix(f,r,t),rise),mix(f,r,t),'#666b5a',Math.max(.5,u*1.2));}
      }
    }
    if(p<.18&&kind==='tent')for(const q of shape.poles)line(g,S([q[0],q[2]]),S([q[0],q[2]-12]),'#725335',Math.max(1,3*u));
    else if(p<.18){
      for(const q of foot)line(g,q,up(q,12*u),'#725335',Math.max(1,3*u));
      g.save();g.setLineDash([5*z,4*z]);for(let i=0;i<4;i++)line(g,up(foot[i],8*u),up(foot[(i+1)%4],8*u),'#d0bd8a',Math.max(.6,.8*z));g.restore();
    }
    // Materials stacked beside the site, used up as it rises.
    if(p<.94){
      const remaining=1-p,o1=out(F,R,30*u),o2=out(L,F,30*u),tp=mix(F,R,.55),sp=mix(L,F,.4);
      const tx=tp[0]+o1[0],ty=tp[1]+o1[1],sx2=sp[0]+o2[0],sy2=sp[1]+o2[1],dir=[(R[0]-F[0]),(R[1]-F[1])],dl=Math.hypot(...dir)||1;
      for(let i=0;i<Math.ceil(5*remaining);i++)line(g,[tx+i*3*u,ty-i*5*u],[tx+dir[0]/dl*48*u+i*3*u,ty+dir[1]/dl*48*u-i*5*u],i%2?'#a4834f':'#715437',6*u);
      if(kind!=='tent')for(let i=0;i<Math.ceil(7*remaining);i++){const x=sx2+(i%3)*10*u,y=sy2-Math.floor(i/3)*8*u;poly(g,[[x,y],[x+10*u,y-4*u],[x+14*u,y+2*u],[x+4*u,y+5*u]],i%2?'#aaa28a':'#8b8a77','#6a6858');}
      else{g.fillStyle='#d9cfb4';g.beginPath();g.ellipse(sx2,sy2,16*u,7*u,-.3,0,7);g.fill();}
    }
    if(p<.18)return;
    const raise=(i,n)=>clamp((p-.18-i/n*.06)/.14);
    // 2. Timber behind the art: tent poles, a portal, or a frame on the footing
    // with its rafters. Walls and roof are revealed over it from the artwork.
    if(kind==='tent'){
      const poles=shape.poles.map(q=>({top:S([q[0],q[1]]),foot:S([q[0],q[2]])}));
      poles.forEach((q,i)=>{const r=raise(i,poles.length);if(r>0)line(g,q.foot,mix(q.foot,q.top,r),'#5e4129',Math.max(1,5*u));});
      const rp=clamp((p-.34)/.08);if(rp>0)for(const [a,b2]of shape.ridges)line(g,poles[a].top,mix(poles[a].top,poles[b2].top,rp),'#6d4c2f',Math.max(1,4.5*u));
      if(p>.3)for(const q of poles){const peg=[q.foot[0]+(q.foot[0]-C[0])*.35,q.foot[1]+20*u];line(g,q.top,peg,'rgba(214,201,160,.7)',Math.max(.5,u*1.2));}
    }else if(kind==='portal'){
      const posts=shape.posts.map(q=>({foot:S([q[0],q[1]]),top:S([q[0],q[2]])}));
      posts.forEach((q,i)=>{const r=raise(i,2);if(r>0)line(g,q.foot,mix(q.foot,q.top,r),'#6d4b2b',Math.max(1,9*u));});
      const lp=clamp((p-.36)/.06);if(lp>0)line(g,up(posts[0].top,3*u),up(mix(posts[0].top,posts[1].top,lp),3*u),'#8a6236',Math.max(1,10*u));
    }else{
      const faces=[[L,F],[F,R],[R,B],[B,L]],plate=q=>up(q,eave);
      faces.forEach(([a,b2],fi)=>{
        const n=Math.max(2,Math.round(Math.hypot(b2[0]-a[0],b2[1]-a[1])/(70*u)));
        for(let i=0;i<n;i++){const q=mix(a,b2,i/n),r=raise(fi*n+i,4*n);if(r>0)line(g,q,up(q,eave*r),'#66482e',Math.max(1,5*u));}
        const gp=clamp((p-.32)/.08),tp=clamp((p-.38)/.08);
        if(gp>0)line(g,up(a,eave*.5),up(mix(a,b2,gp),eave*.5),'#8b6a3e',Math.max(1,3.5*u));
        if(tp>0){line(g,plate(a),plate(mix(a,b2,tp)),'#ae8d54',Math.max(1,5*u));line(g,mix(a,b2,.02),up(mix(a,b2,.4*tp),eave*.92),'#8b6a3e',Math.max(.8,3*u));}
      });
      if(shape?.ridge){
        const [A,Z]=shape.ridge.map(S),rp=t=>clamp((p-.72-t*.06)/.08);
        // Long sides run under the ridge; the gable ends meet at its ends.
        const sides=[[F,R,A,Z],[L,B,A,Z]];
        for(const [a,b2,ra,rz]of sides)for(let i=0;i<=4;i++){const t=i/4,q=plate(mix(a,b2,t)),top2=mix(ra,rz,t),r=rp(t);if(r>0)line(g,q,mix(q,top2,r),'#9a7445',Math.max(.8,3.5*u));}
        for(const [a,end]of[[L,A],[F,A],[R,Z],[B,Z]]){const r=rp(.5);if(r>0)line(g,plate(a),mix(plate(a),end,r),'#9a7445',Math.max(.8,3.5*u));}
        const ridgeP=clamp((p-.8)/.04);if(ridgeP>0&&Math.hypot(Z[0]-A[0],Z[1]-A[1])>1)line(g,A,mix(A,Z,ridgeP),'#7a5a35',Math.max(1,5*u));
      }
    }
    // 3. The artwork itself, revealed over its own footing: walls course by
    // course up to the eaves, then the roof; a tent's canvas is drawn over its
    // poles. One clip path, no mask canvas.
    const N=24,baseAt=x=>{const pts=kind==='frame'&&shape?.walls?[L,F,R]:[pad[0],pad[1],pad[2]];
      if(x<=pts[1][0]){const t=clamp((x-pts[0][0])/((pts[1][0]-pts[0][0])||1));return lerp(pts[0][1],pts[1][1],t);}
      const t=clamp((x-pts[1][0])/((pts[2][0]-pts[1][0])||1));return lerp(pts[1][1],pts[2][1],t);};
    const below=kind==='frame'&&shape?.walls&&!shape.pad?4*u:12*u;
    g.save();g.beginPath();
    if(kind==='tent'){
      // Canvas goes over the ridge poles whole, not in courses.
      const q=clamp((p-.45)/.45);g.restore();if(q<=0)return;
      g.save();g.globalAlpha*=q;g.drawImage(prop.image,left,top+(1-q)*14*u,w,h);g.restore();return;
    }else{
      const wallsUp=clamp((p-.5)/.32),roofUp=clamp((p-.84)/.15),allUp=clamp((p-.45)/.53);
      const walls=kind==='frame';if(walls?wallsUp<=0:allUp<=0){g.restore();return scaffold();}
      const cutAt=x=>{const base=baseAt(x);if(!walls)return base-(base-top)*allUp;
        const eaveY=base-eave;return wallsUp<1?base-eave*wallsUp:eaveY-(eaveY-top)*roofUp;};
      // Until the roof goes on only the walls rise, not the eaves or the shadow beside them.
      const x0=walls&&roofUp<=0?Math.max(left,L[0]):left,x1=walls&&roofUp<=0?Math.min(left+w,R[0]):left+w;
      g.moveTo(x0,cutAt(x0));
      for(let i=1;i<=N;i++){const x=lerp(x0,x1,i/N);g.lineTo(x,cutAt(x));}
      for(let i=N;i>=0;i--){const x=lerp(x0,x1,i/N);g.lineTo(x,baseAt(x)+below);}
      g.closePath();
    }
    g.clip();g.drawImage(prop.image,left,top,w,h);g.restore();
    scaffold();
    // 4. Scaffold in front of the walls going up: standards, ledgers, the
    // working deck at the course being laid, braces and a ladder up to it.
    function scaffold(){
    if(kind!=='frame'||!shape?.walls||p>=.98)return;
    g.save();g.globalAlpha*=1-clamp((p-.9)/.08);
    const wallH=eave*clamp((p-.5)/.32),poleH=eave*1.1*clamp((p-.2)/.16),deckH=Math.max(eave*.18,Math.min(eave*.9,wallH-eave*.12));
    let ladderAt=null;
    if(shape.scaffold!==false)for(const [a,b2]of[[L,F],[F,R]]){
      const o=out(a,b2,14*u),A2=[a[0]+o[0],a[1]+o[1]],B2=[b2[0]+o[0],b2[1]+o[1]];
      const n=Math.max(2,Math.round(Math.hypot(b2[0]-a[0],b2[1]-a[1])/(80*u)));
      for(let i=0;i<=n;i++){const q=mix(A2,B2,i/n);line(g,q,up(q,poleH),'#715333',Math.max(.8,3.5*u));}
      for(let lift=eave*.33;lift<=poleH;lift+=eave*.33)line(g,up(A2,lift),up(B2,lift),'#8e7046',Math.max(.6,2.5*u));
      if(p>.5)line(g,up(A2,deckH),up(B2,deckH),'#b39259',Math.max(1,6*u));
      if(poleH>eave*.6)line(g,A2,up(mix(A2,B2,.5),Math.min(poleH,eave)),'#7d5d36',Math.max(.6,2*u));
      if(!ladderAt){const q=mix(A2,B2,.12),lean=out(a,b2,26*u);ladderAt={foot:[q[0]+lean[0],q[1]+lean[1]],top:up(q,p>.5?deckH:Math.min(poleH,eave*.33))};}
    }
    if(!ladderAt){const q=mix(L,F,.5),o=out(L,F,30*u);ladderAt={foot:[q[0]+o[0],q[1]+o[1]],top:up(q,Math.min(eave*.9,Math.max(eave*.4,wallH)))};}
    if(p>.22){const {foot:a,top:t}=ladderAt,sp=6*u;
      line(g,a,t,'#b18a50',Math.max(.7,2.5*u));line(g,[a[0]+sp,a[1]],[t[0]+sp,t[1]],'#b18a50',Math.max(.7,2.5*u));
      for(let i=1;i<7;i++){const q=mix(a,t,i/7);line(g,q,[q[0]+sp,q[1]],'#80633d',Math.max(.5,1.6*u));}}
    g.restore();
    }
  }
  root.__BUILDING_PRESENTATION_V1__=Object.freeze({prepare,stage,worker,drawWork,decorate,construction,
    inspect:b=>({stage:stage(b),progress:clamp(b.construction||0),builders:byBuilding.get(b.id)||0}),
    stats:()=>({bytes,budget,entries:cache.size,builds,hits,evictions,draws,dustDraws,builders:active.size})});
})(window);
