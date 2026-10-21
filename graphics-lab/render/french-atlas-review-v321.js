// Graphics Lab v321 draft review: NOT a production-approved infantry sprite.
// Keep selection logic renderer-independent so Pixi and Canvas show one pose.
const FR_REVIEW_URL='./assets/sprites/infantry/france/fr_line_infantry_atlas';
const FR_REVIEW_FRAME_W=96,FR_REVIEW_FRAME_H=96;
const FR_REVIEW_DISPLAY_SIZE=48;
const FR_REVIEW_PIVOT={x:48,y:78};
const expected={idle:2,march:6,aim:2,fire:3,reload:4};

function frameState(cycle){
  if(cycle.walking)return'march';
  if(cycle.phase>=4&&cycle.phase<6)return'aim';
  // One actual 3-frame volley (285 ms), not 2.5s of a frozen fire pose.
  if(cycle.phase>=6&&cycle.phase<6.285)return'fire';
  if(cycle.phase>=6.285&&cycle.phase<9)return'reload';
  return'idle';
}
function pickFrenchPose(cycle,time,phase=0){
  const state=frameState(cycle),count=expected[state];
  // Deterministic offset only while marching; volley must remain synchronized.
  const offset=state==='march'?phase*.08:0;
  const local=state==='march'?time+offset:
    state==='aim'?cycle.phase-4:
    state==='fire'?cycle.phase-6:
    state==='reload'?cycle.phase-6.285:cycle.phase>=16?cycle.phase-16:0;
  const ms={march:110,idle:500,aim:260,fire:95,reload:425}[state];
  const n=Math.floor(Math.max(0,local)*1000/ms);
  const index=state==='idle'||state==='march'?n%count:Math.min(count-1,n);
  return {state,index,key:'fr_line_'+state+'_'+String(index+1).padStart(2,'0')};
}
// v321 art correction: shako caps were floating above a dark/empty neck.
// Bake a small, coherent head and visible face into EACH raster frame ONCE.
// This is an image-level repair shared by Canvas and GPU, not a sprite-per-frame
// overlay, new gameplay object, shader filter, or production-art approval.
const FR_HEAD_ANCHORS=[
  [49,26],[48,26],[45,25],[44,25],[42,26],[43,24],
  [45,24],[45,27],[43,26],[47,27],[46,28],[46,27],
  [48,26],[44,26],[44,26],[44,26],[43,26]
];
function applyFrenchHeadCorrections(image,repair=true){
  const canvas=document.createElement('canvas');
  canvas.width=576;canvas.height=288;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(image,0,0);
  if(!repair)return canvas;
  context.imageSmoothingEnabled=false;
  for(let i=0;i<FR_HEAD_ANCHORS.length;i++){
    const [localX,localY]=FR_HEAD_ANCHORS[i];
    const x=(i%6)*96+localX,y=Math.floor(i/6)*96+localY;
    // Pixel-art shading, no invented anatomy outside the 96px cell.
    context.fillStyle='#4f3124';
    context.beginPath();context.ellipse(x,y+2.5,4.5,4,0,0,Math.PI*2);context.fill();
    context.fillStyle='#b98763';
    context.beginPath();context.ellipse(x,y+2.5,3.5,3,0,0,Math.PI*2);context.fill();
    context.fillStyle='#daaa7f';
    context.beginPath();
    context.moveTo(x-2,y);context.lineTo(x,y);
    context.lineTo(x-1,y+5);context.lineTo(x-3,y+4);context.closePath();context.fill();
    context.fillStyle='#e6ab82';context.fillRect(x-3,y+2,2,2);
    context.fillStyle='#302a26';context.fillRect(x-1,y+2,1,1);
    context.fillStyle='#322926';context.fillRect(x+2,y+2,1,1);
    context.fillStyle='#83523f';context.fillRect(x,y+3,1,2);
    context.fillStyle='#a67455';context.fillRect(x-1,y+6,3,2);
    context.fillStyle='#2a2622';context.fillRect(x-4,y+2,1,1);
    context.fillRect(x+4,y+2,1,1);
  }
  return canvas;
}
async function loadFrenchPreview(){
  const [image,meta]=await Promise.all([
    new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('French PNG atlas is missing'));
      im.src=FR_REVIEW_URL+'.png';
    }),
    fetch(FR_REVIEW_URL+'.json').then(r=>{
      if(!r.ok)throw new Error('French atlas metadata HTTP '+r.status);
      return r.json();
    })
  ]);
  if(image.naturalWidth!==576||image.naturalHeight!==288
    ||meta.meta?.size?.w!==576||meta.meta?.size?.h!==288)
    throw Error('French review atlas must be 576×288 PNG with matching JSON');
  for(const [state,expectedCount]of Object.entries(expected)){
    if(meta.animations?.[state]?.length!==expectedCount)
      throw Error('French review atlas missing '+state);
    for(const key of meta.animations[state]){
      const f=meta.frames?.[key];
      if(!f||f.frame?.w!==96||f.frame?.h!==96
        ||f.anchor?.x!==.5||f.anchor?.y!==.8125)
        throw Error('French frame format/anchor mismatch: '+key);
    }
  }
  const repair=new URLSearchParams(location.search).get('heads')!=='original';
  const paintedImage=applyFrenchHeadCorrections(image,repair);
  return {image:paintedImage,meta,poseCount:17,approved:false,
    headsRepaired:repair,repairedHeadCount:repair?17:0};
}
function canvasFrame(ctx,review,pose,worldX,worldY,flip=false,displaySize=FR_REVIEW_DISPLAY_SIZE){
  const data=review.meta.frames[pose.key].frame;
  const scale=displaySize/FR_REVIEW_FRAME_W;
  const left=worldX-FR_REVIEW_PIVOT.x*scale;
  const top=worldY-FR_REVIEW_PIVOT.y*scale;
  if(flip){
    ctx.save();ctx.translate(worldX,worldY);ctx.scale(-1,1);
    ctx.drawImage(review.image,data.x,data.y,data.w,data.h,
      -FR_REVIEW_PIVOT.x*scale,-FR_REVIEW_PIVOT.y*scale,
      displaySize,displaySize);
    ctx.restore();
  }else{
    ctx.drawImage(review.image,data.x,data.y,data.w,data.h,
      left,top,displaySize,displaySize);
  }
}

window.__FRENCH_ATLAS_REVIEW_V321__=Object.freeze({loadFrenchPreview,pickFrenchPose,canvasFrame,applyFrenchHeadCorrections,FR_HEAD_ANCHORS,FR_REVIEW_URL,FR_REVIEW_FRAME_W,FR_REVIEW_FRAME_H,FR_REVIEW_DISPLAY_SIZE});
