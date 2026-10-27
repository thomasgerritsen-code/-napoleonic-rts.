'use strict';
// Presentation only. Construction follows the authoritative progress; render
// time animates tools and dust but never advances a building or moves a worker.
(function buildingPresentation(root){
  if(root.__NRTS_SERVER__||!root.NRTS_CONFIG?.mining||root.__BUILDING_PRESENTATION_V1__)return;
  const clamp=n=>Math.max(0,Math.min(1,n)),lerp=(a,b,t)=>a+(b-a)*t;
  const seed=id=>(Math.imul((Number(id)||0)+37,2654435761)>>>0)/4294967296;
  const cache=new Map(),active=new Map(),byBuilding=new Map(),poses=new WeakMap(),progress=new WeakMap(),rowCache=new WeakMap();
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
    // Raise, hold, strike, recover. Workers have separate phases rather than
    // hammering in lockstep, using their existing four directional tool frames.
    p.frame=t<.14?0:t<.36?1:t<.47?2:t<.61?3:t<.77?2:0;
    p.contact=t>=.47&&t<.61;p.scaleX=1+Math.sin(t*Math.PI*2)*.012;
    p.scaleY=1-(p.contact?.025:0);p.dx=0;p.dy=p.contact?.7:0;p.phase=t;return p;
  }
  function drawWork(ctx,u,pose,X,Y,z){
    if(!pose?.contact||dustDraws>=24||z<.8)return;
    const b=active.get(u.id);if(!b)return;
    const side=Math.sign(b.x-u.x)||1,a=(pose.phase-.47)/.14;
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
    if(type==='mine'||type==='lumbercamp')result.constructionBottom=.87;
    cache.set(key,{source:prop.image,prop:result,bytes:cost});bytes+=cost;builds++;return result;
  }
  function rows(prop){
    if(prop.rows)return prop.rows;
    const old=rowCache.get(prop.image);if(old){prop.rows=[old[0],Math.min(old[1],prop.constructionBottom||1)];return prop.rows;}
    const c=document.createElement('canvas');c.width=48;c.height=64;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(prop.image,0,0,48,64);
    const data=g.getImageData(0,0,48,64).data,solid=y=>{for(let x=0;x<48;x++)if(data[(y*48+x)*4+3]>180)return true;return false;};
    let top=0,bottom=63;while(top<63&&!solid(top))top++;while(bottom>top&&!solid(bottom))bottom--;
    rowCache.set(prop.image,[top/64,(bottom+1)/64]);prop.rows=[top/64,Math.min((bottom+1)/64,prop.constructionBottom||1)];return prop.rows;
  }
  function construction(g,b,prop,k,X,Y,z){
    draws++;const actual=clamp(b.construction||0),now=performance.now()/1000;
    let shown=progress.get(b);
    if(!shown||actual<shown.p){shown={p:actual,at:now};progress.set(b,shown);}
    const dt=Math.max(0,Math.min(.1,now-shown.at));shown.p+=(actual-shown.p)*(1-Math.exp(-dt/.075));shown.at=now;
    const p=shown.p,bounds=rows(prop),fw=b.w*z*.62,fh=fw*.5;
    const left=X-prop.pivot.x*k,top=Y-prop.pivot.y*k,w=prop.w*k,h=prop.h*k;
    // Excavation and a stone plinth: no fully formed ghost building at 15%.
    poly(g,[[X-fw,Y],[X,Y-fh],[X+fw,Y],[X,Y+fh]],'#83734f','rgba(68,61,41,.65)');
    const rise=clamp((p-.08)/.16)*5*z;
    poly(g,[[X-fw,Y],[X,Y+fh],[X+fw,Y],[X+fw,Y-rise],[X,Y+fh-rise],[X-fw,Y-rise]],'#a19b80','#6c6d5a');
    for(let i=1;i<8;i++){const t=i/8;line(g,[X-fw+fw*t,Y+fh*t-rise],[X-fw+fw*t,Y+fh*t],'#666b5a',Math.max(.6,z*.65));line(g,[X+fw*t,Y+fh*(1-t)-rise],[X+fw*t,Y+fh*(1-t)],'#666b5a',Math.max(.6,z*.65));}
    for(const [x,y]of[[X-fw,Y],[X,Y-fh],[X+fw,Y],[X,Y+fh]]){line(g,[x,y],[x,y-7*z],'#725335',1.8*z);}
    // The shrinking stacks and their silhouettes are cheap vector work. They
    // never create canvases indexed by progress, zoom or building instance.
    if(p<.94){
      const remaining=1-p;
      for(let i=0;i<Math.ceil(5*remaining);i++)line(g,[X+fw*.65+i*2*z,Y+fh*.9-i*3*z],[X+fw*.65+24*z+i*2*z,Y+fh*.9-i*3*z-6*z],i%2?'#a4834f':'#715437',3*z);
      for(let i=0;i<Math.ceil(7*remaining);i++)poly(g,[[X-fw*.8+i%3*5*z,Y+fh*.72-Math.floor(i/3)*4*z],[X-fw*.8+i%3*5*z+5*z,Y+fh*.72-Math.floor(i/3)*4*z-2*z],[X-fw*.8+i%3*5*z+7*z,Y+fh*.72-Math.floor(i/3)*4*z+1*z]],i%2?'#aaa28a':'#8b8a77');
    }
    if(p<.18){g.save();g.setLineDash([5*z,4*z]);line(g,[X-fw,Y-5*z],[X,Y+fh-5*z],'#d0bd8a',.8*z);line(g,[X,Y+fh-5*z],[X+fw,Y-5*z],'#d0bd8a',.8*z);g.restore();return;}
    const fullHeight=h*(bounds[1]-bounds[0]),frameHeight=Math.min(fullHeight*.75,(p-.18)/.34*fullHeight*.75),frontY=Y+fh*.72;
    // A timber skeleton is visible before the walls and remains as scaffolding.
    g.save();g.globalAlpha*=1-clamp((p-.92)/.08);
    const x0=X-fw*.65,x1=X+fw*.94;
    for(let i=0;i<5;i++){
      const x=lerp(x0,x1,i/4),base=frontY-i/4*fh*.75;
      line(g,[x,base],[x,base-frameHeight],'#66482e',2.5*z);
      line(g,[x-z*.6,base],[x-z*.6,base-frameHeight],'#b2925b',.7*z);
      if(i<4){const nx=lerp(x0,x1,(i+1)/4),nb=frontY-(i+1)/4*fh*.75;line(g,[x,base-4*z],[nx,nb-frameHeight+6*z],'#8b6a3e',1.2*z);}
    }
    for(let level=1;level<=2;level++){
      const height=frameHeight*level/2;line(g,[x0-3*z,frontY-height],[x1+3*z,frontY-fh*.75-height],'#ae8d54',3*z);
    }
    if(p>.5&&p<.94){
      for(let i=0;i<4;i++){
        const x=lerp(x0,x1,i/3),base=frontY-i/3*fh*.75-frameHeight;
        line(g,[x,base],[x-fw*.25,base-fullHeight*.2],'#af8b51',1.5*z);
        line(g,[x-fw*.25,base-fullHeight*.2],[x-fw*.6,base-fh*.2],'#755734',1.5*z);
      }
    }
    // Ladder rungs and a little rope hoist give the site depth and scale.
    const ladderX=x0-7*z,ladderTop=frontY-frameHeight*.9;
    line(g,[ladderX,frontY+3*z],[ladderX+9*z,ladderTop],'#b18a50',1.3*z);line(g,[ladderX+6*z,frontY+3*z],[ladderX+15*z,ladderTop],'#b18a50',1.3*z);
    for(let i=1;i<7;i++){const t=i/7;line(g,[ladderX+9*z*t,lerp(frontY+3*z,ladderTop,t)],[ladderX+6*z+9*z*t,lerp(frontY+3*z,ladderTop,t)],'#80633d',1*z);}
    g.restore();
    // Reveal the actual walls and roof in staggered courses. Cropped source
    // draws avoid allocating a mask or resampling-cache entry every frame.
    for(let i=0;i<4;i++){
      const q=clamp((p-.26-i*.018)/(.74-i*.018)),cut=bounds[1]-(bounds[1]-bounds[0])*q;
      if(q<=0)continue;const iw=prop.image.width,ih=prop.image.height;
      g.drawImage(prop.image,iw*i/4,ih*cut,iw/4,ih*(bounds[1]-cut),left+w*i/4,top+h*cut,w/4,h*(bounds[1]-cut));
    }
    // The front scaffold is drawn over the rising wall, not buried behind it.
    if(p<.95){g.save();g.globalAlpha*=1-clamp((p-.88)/.07);const deck=frontY-frameHeight*.63;
      line(g,[x0-3*z,deck],[x1+3*z,deck-fh*.75],'#b39259',2.6*z);
      for(let i=0;i<3;i++){const x=lerp(x0,x1,i/2),base=frontY-i/2*fh*.75;line(g,[x,base],[x,base-frameHeight],'#715333',1.8*z);}
      g.restore();}
  }
  root.__BUILDING_PRESENTATION_V1__=Object.freeze({prepare,stage,worker,drawWork,decorate,construction,
    inspect:b=>({stage:stage(b),progress:clamp(b.construction||0),builders:byBuilding.get(b.id)||0}),
    stats:()=>({bytes,budget,entries:cache.size,builds,hits,evictions,draws,dustDraws,builders:active.size})});
})(window);
