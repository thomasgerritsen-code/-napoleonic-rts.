'use strict';
(function lumberArt(root){
  if(!root.NRTS_CONFIG?.logging||root.__NRTS_SERVER__||root.__LUMBER_ART_V1__)return;
  const cache=new Map();
  function sprite(kind,side='france'){
    if(cache.has(side))return cache.get(side);
    const c=document.createElement('canvas');c.width=256;c.height=224;const g=c.getContext('2d');
    const poly=(points,color,stroke)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=color;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();}};
    const line=(a,b,color,width)=>{g.beginPath();g.moveTo(...a);g.lineTo(...b);g.strokeStyle=color;g.lineWidth=width;g.stroke();};
    g.fillStyle='rgba(25,30,15,.25)';g.beginPath();g.ellipse(128,159,117,35,0,0,7);g.fill();
    poly([[9,151],[98,110],[242,153],[160,195]],'#82734d','#655a3b');
    // Open timber shelter: the wood stacks and sawbench remain visible.
    poly([[70,129],[70,76],[155,93],[155,151]],'#8d7046','#4c412b');
    poly([[155,93],[194,73],[194,132],[155,151]],'#665238','#483b28');
    for(let i=0;i<8;i++)line([73+i*10,79+i*2],[73+i*10,129+i*2],'#695431',1);
    for(const [x,y]of[[63,129],[147,151],[197,133]]){line([x,y],[x,y-64],'#4d3825',6);line([x-1,y-2],[x-1,y-61],'#b08b51',2);}
    poly([[48,72],[99,38],[217,72],[165,108]],'#635b42','#443f2e');
    poly([[48,72],[99,38],[167,59],[116,94]],'#9a8b59','#5e583a');
    for(let i=0;i<9;i++){const x=57+i*11;line([x,76+(x-57)*.28],[x+46,45+(x-57)*.28],'#b3a16a',1);}
    line([48,74],[165,110],'#5c4229',5);line([165,110],[217,74],'#4b3826',4);
    function log(x,y,length){
      line([x-length,y-8],[x,y],'#59402a',12);line([x-length,y-11],[x,y-3],'#9b7746',6);
      g.fillStyle='#c7a46a';g.beginPath();g.ellipse(x,y,6,5,.18,0,7);g.fill();g.strokeStyle='#745334';g.lineWidth=1;g.stroke();
      g.beginPath();g.ellipse(x,y,3,2.5,.18,0,7);g.stroke();
    }
    for(let row=0;row<3;row++)for(let col=0;col<4-row;col++)log(106+col*13+row*7,151-row*10,39);
    // A trestle and long hand saw, appropriate to a field logging yard.
    for(const x of[165,203]){line([x,157],[x-7,178],'#59412b',4);line([x,157],[x+7,177],'#785a37',4);}
    poly([[152,154],[194,143],[221,155],[179,166]],'#ad8a4c','#5c492d');
    line([165,151],[200,164],'#b9bcb0',3);line([160,148],[167,154],'#4e3929',5);
    for(let i=0;i<8;i++)line([169+i*4,153+i*1.4],[168+i*4,157+i*1.4],'#686e68',1);
    for(let i=0;i<3;i++)poly([[28+i*6,158+i*5],[66+i*6,169+i*5],[74+i*6,164+i*5],[36+i*6,153+i*5]],'#b7975f','#79603d');
    line([223,141],[223,65],'#665033',3);
    poly([[225,67],[248,73],[246,88],[225,83]],side==='britain'?'#a54a38':'#406695');
    poly([[225,67],[232,69],[232,85],[225,83]],'#ece0bb');
    if(side==='france')poly([[240,71],[248,73],[246,88],[240,87]],'#a94d3b');
    g.font='bold 12px Georgia';g.textAlign='center';g.lineWidth=3;g.strokeStyle='rgba(25,29,20,.85)';g.fillStyle='#f0e5c9';g.strokeText('Houthakkerskamp',128,212);g.fillText('Houthakkerskamp',128,212);
    cache.set(side,c);return c;
  }
  root.__LUMBER_ART_V1__=Object.freeze({sprite,stats:()=>({textures:cache.size,bytes:cache.size*256*224*4})});
  const base=drawBuilding;
  drawBuilding=function drawLumberCamp(b){if(b.type!=='lumbercamp')return base(b);if(b.dead)return;const image=sprite(b.type,b.nativeSide||b.side),w=b.w*1.5;ctx.save();ctx.globalAlpha=b.complete?1:.3+.5*b.construction;ctx.drawImage(image,b.x-w/2,b.y-w*.6,w,w*.875);ctx.restore();};
})(window);
