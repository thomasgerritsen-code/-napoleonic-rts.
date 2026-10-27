'use strict';
// Small, shared canvases: uploaded once by the isometric GPU renderer, with the
// same cached art used by its Canvas fallback. No new downloads or frame timers.
(function miningArt(root){
  if(!root.NRTS_CONFIG?.mining||root.__NRTS_SERVER__||root.__MINING_ART_V1__)return;
  const cache=new Map();
  function sprite(kind,side='france'){
    const key=kind+':'+(kind==='mine'?side:'neutral');if(cache.has(key))return cache.get(key);
    const c=document.createElement('canvas');c.width=256;c.height=224;
    const g=c.getContext('2d'),mine=kind==='mine',empty=kind==='empty';
    const polygon=(points,fill,stroke)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.stroke();}};
    const line=(points,color,width)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=width;g.stroke();};
    g.fillStyle='rgba(35,30,20,.2)';g.beginPath();g.ellipse(128,151,118,43,0,0,Math.PI*2);g.fill();
    polygon([[12,145],[70,110],[175,110],[244,147],[181,184],[66,180]],empty?'#8b8570':'#80765c','#65634f');
    for(let i=0;i<24;i++){
      const x=30+(i*59%195),y=129+(i*17%43),s=7+(i*11%15);
      polygon([[x-s,y],[x-s*.6,y-s*.7],[x+s*.3,y-s],[x+s,y-s*.2],[x+s*.6,y+s*.3]],i%3===0?'#6b6960':'#8e8c7d','#5f6058');
      polygon([[x-s*.6,y-s*.7],[x+s*.3,y-s],[x+s*.4,y-s*.4],[x-s*.3,y-s*.1]],'#aaa795');
      if(!empty&&i%4===0)line([[x-s*.3,y-s*.3],[x+s*.4,y]],'#9c704b',2);
    }
    if(mine){
      polygon([[65,137],[64,79],[114,40],[175,62],[201,125],[166,157]],'#6b6c61','#4c5149');
      polygon([[64,79],[114,40],[175,62],[137,75],[90,101]],'#a3a08d');
      polygon([[91,148],[91,98],[108,81],[145,87],[159,105],[159,153]],'#232724','#343a32');
      polygon([[109,140],[109,104],[122,95],[147,103],[147,145]],'#101a19');
      line([[89,151],[89,94],[157,100],[160,155]],'#5a3e28',11);
      line([[86,93],[161,99]],'#b08b50',8);line([[87,94],[87,149]],'#9a7846',4);line([[157,101],[159,150]],'#957344',4);
      line([[94,119],[110,101]],'#6d5031',5);line([[143,105],[156,122]],'#6d5031',5);
      for(let i=0;i<5;i++)line([[104-i*3,148+i*7],[150+i*4,151+i*7]],'#6b5338',4);
      line([[117,141],[98,185]],'#a0a4a0',3);line([[139,143],[160,187]],'#a0a4a0',3);
      polygon([[121,158],[149,160],[146,175],[124,172]],'#68563b','#322e26');
      polygon([[121,158],[132,151],[159,154],[149,160]],'#939185','#4f5147');
      for(const x of[127,144]){g.fillStyle='#2e302a';g.beginPath();g.arc(x,175,4,0,7);g.fill();}
      line([[188,145],[188,63]],'#6b5535',3);
      polygon([[190,65],[218,70],[216,87],[190,82]],side==='britain'?'#a8483b':'#426995');
      polygon([[190,65],[199,67],[199,84],[190,82]],'#e4dcc2');
    }
    // Readable labels are baked into the texture, never redrawn each frame.
    g.font='bold 12px Georgia';g.textAlign='center';g.lineWidth=3;g.strokeStyle='rgba(25,29,20,.85)';g.fillStyle='#f0e5c9';
    const label=mine?'IJzermijn':empty?'Uitgeputte afzetting':'Steenrijk gebied';g.strokeText(label,128,205);g.fillText(label,128,205);
    cache.set(key,c);return c;
  }
  root.__MINING_ART_V1__=Object.freeze({sprite,stats:()=>({textures:cache.size,bytes:cache.size*256*224*4})});
  const baseResource=drawResource;
  drawResource=function drawDeposit(r){if(!r.deposit)return baseResource(r);if(r.dead)return;const image=sprite(r.amount>0?'deposit':'empty'),w=r.radius*2;ctx.drawImage(image,r.x-w/2,r.y-w*.6,w,w*.875);};
  const baseBuilding=drawBuilding;
  drawBuilding=function drawMine(b){if(b.type!=='mine')return baseBuilding(b);if(b.dead)return;const image=sprite('mine',b.nativeSide||b.side),w=b.w*1.5;ctx.save();ctx.globalAlpha=b.complete?1:.3+.5*b.construction;ctx.drawImage(image,b.x-w/2,b.y-w*.6,w,w*.875);ctx.restore();};
})(window);
