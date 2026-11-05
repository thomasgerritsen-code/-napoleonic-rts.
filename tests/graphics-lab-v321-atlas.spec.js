const {test,expect}=require('@playwright/test');
const zlib=require('zlib');
// Synthetic in-test RGBA atlas (never a production asset): one distinct
// coloured block per cell so the route proves the real Canvas atlas path.
function crc32(buf){let c,crc=~0;for(const b of buf){c=(crc^b)&255;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return ~crc>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function fixturePng(w=576,h=288){
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const cell=Math.floor(y/96)*6+Math.floor(x/96),lx=x%96,ly=y%96,o=y*(w*4+1)+1+x*4;
    if(cell<17&&lx>=36&&lx<60&&ly>=30&&ly<79){raw[o]=40+cell*10;raw[o+1]=60;raw[o+2]=120;raw[o+3]=255;}
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function fixtureSheet(prefix){
  const states={idle:2,march:6,aim:2,fire:3,reload:4},frames={},animations={};let i=0;
  for(const[s,n]of Object.entries(states)){animations[s]=[];for(let k=1;k<=n;k++){
    const name=`${prefix}_line_${s}_${String(k).padStart(2,'0')}`;animations[s].push(name);
    frames[name]={frame:{x:(i%6)*96,y:Math.floor(i/6)*96,w:96,h:96},rotated:false,trimmed:false};i++;}}
  return{frames,animations,meta:{image:`${prefix}_line_infantry_atlas.png`,size:{w:576,h:288},scale:'1'}};
}
async function open(page,url){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats()?.loaded===10);
  return errors;
}
test('v321 ?sprites=atlas without approved atlases keeps legacy SVG soldiers',async({page})=>{
  const errors=await open(page,'/graphics-lab/?sprites=atlas');
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__.getStats().engine.includes('SVG-terugval'));
  const s=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(s.atlasRequested).toBe(true);
  expect(s.spriteSet).toBe('legacy');
  expect(s.atlasError).toBeTruthy();
  expect(s.animation).toBeNull();
  expect(errors).toEqual([]);
});
test('v321 default lab is unchanged and does not request atlases',async({page})=>{
  const requested=[];
  page.on('request',r=>{if(r.url().includes('/sprites/infantry/'))requested.push(r.url());});
  const errors=await open(page,'/graphics-lab/?pixi=off');
  const s=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(s.spriteSet).toBe('legacy');
  expect(s.atlasRequested).toBe(false);
  expect(requested).toEqual([]);
  expect(errors).toEqual([]);
});
test('v321 atlas mode drives Canvas frames from one deterministic controller',async({page})=>{
  const png=fixturePng();
  await page.route('**/assets/sprites/infantry/**',route=>{
    const url=route.request().url(),prefix=url.includes('/france/')?'fr':'br';
    if(url.endsWith('.png'))return route.fulfill({status:200,contentType:'image/png',body:png});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixtureSheet(prefix))});
  });
  const errors=await open(page,'/graphics-lab/?sprites=atlas');
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__.getStats().spriteSet==='atlas');
  const r=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_V319__;
    const frame=()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
    api.state.paused=true;
    const sample=async t=>{api.state.time=t;await frame();
      const c=document.getElementById('detail-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let h=0;for(let i=0;i<d.length;i+=97)h=(h*31+d[i])>>>0;return h;};
    const a=await sample(2.0),b=await sample(2.0);
    for(let t=4.2;t<=9.6;t+=.05){api.state.time=t;await frame();}
    return{a,b,stats:api.getStats()};
  });
  expect(r.stats.engine).toContain('atlas');
  expect(r.a).toBe(r.b);
  expect(r.stats.animation.units).toBe(32);
  expect(r.stats.animation.muzzleEvents).toBeGreaterThanOrEqual(32);
  expect(errors).toEqual([]);
});
