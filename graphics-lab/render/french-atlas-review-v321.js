// Graphics Lab v321 draft review: NOT a production-approved infantry sprite.
// Keep selection logic renderer-independent so Pixi and Canvas show one pose.
export const FR_REVIEW_URL='./assets/sprites/infantry/france/fr_line_infantry_atlas';
export const FR_REVIEW_FRAME_W=96,FR_REVIEW_FRAME_H=96;
export const FR_REVIEW_DISPLAY_SIZE=48;
export const FR_REVIEW_PIVOT={x:48,y:78};
const expected={idle:2,march:6,aim:2,fire:3,reload:4};

export function frameState(cycle){
  if(cycle.walking)return'march';
  if(cycle.phase>=4&&cycle.phase<6)return'aim';
  if(cycle.phase>=6&&cycle.phase<8.5)return'fire';
  if(cycle.phase>=8.5&&cycle.phase<11)return'reload';
  return'idle';
}
export function pickFrenchPose(cycle,time,phase=0){
  const state=frameState(cycle),count=expected[state];
  // Deterministic offset only while marching; volley must remain synchronized.
  const offset=state==='march'?phase*.08:0;
  const local=state==='march'?time+offset:
    state==='aim'?cycle.phase-4:
    state==='fire'?cycle.phase-6:
    state==='reload'?cycle.phase-8.5:cycle.phase>=16?cycle.phase-16:0;
  const ms={march:110,idle:500,aim:260,fire:95,reload:425}[state];
  const n=Math.floor(Math.max(0,local)*1000/ms);
  const index=state==='idle'||state==='march'?n%count:Math.min(count-1,n);
  return {state,index,key:'fr_line_'+state+'_'+String(index+1).padStart(2,'0')};
}
export async function loadFrenchPreview(){
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
  return {image,meta,poseCount:17,approved:false};
}
export function canvasFrame(ctx,review,pose,worldX,worldY,flip=false){
  const data=review.meta.frames[pose.key].frame;
  const scale=FR_REVIEW_DISPLAY_SIZE/FR_REVIEW_FRAME_W;
  const left=worldX-FR_REVIEW_PIVOT.x*scale;
  const top=worldY-FR_REVIEW_PIVOT.y*scale;
  if(flip){
    ctx.save();ctx.translate(worldX,worldY);ctx.scale(-1,1);
    ctx.drawImage(review.image,data.x,data.y,data.w,data.h,
      -FR_REVIEW_PIVOT.x*scale,-FR_REVIEW_PIVOT.y*scale,
      FR_REVIEW_DISPLAY_SIZE,FR_REVIEW_DISPLAY_SIZE);
    ctx.restore();
  }else{
    ctx.drawImage(review.image,data.x,data.y,data.w,data.h,
      left,top,FR_REVIEW_DISPLAY_SIZE,FR_REVIEW_DISPLAY_SIZE);
  }
}
