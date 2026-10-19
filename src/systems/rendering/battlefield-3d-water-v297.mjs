import * as THREE from 'three';

// v297: low-draw-call 3D river with one shared nav/2D centerline, textured
// current, silted shoulders and half-submerged water. Visual-only.
const source=window.NRTS_3D_SOURCE;
const scene=window.__NRTS_THREE_SCENE__;
const api=window.__BATTLEFIELD_3D_V1__;
if(!source||!scene||!api?.groundHeightAt||!api?.onFrame)
  throw new Error('3D water requires the active base battlefield and frame hook');
const river=source.staticWorld().river;
if(!river?.samples||river.samples.length<30)
  throw new Error('3D water requires the shared v296 river geometry');
const points=river.samples;
const half=river.navHalfWidth;
const bankRoot=new THREE.Group();
bankRoot.name='natural-river-3d-v297';
scene.add(bankRoot);
const waterTones=[0x839e92,0x628986,0x396a76,0x628986,0x839e92];
const bankTones=[0x67694e,0x827c5a];
const seeded=(n)=>{let v=(Math.imul(n+31,2654435761)^0x1d9a33)>>>0;v^=v>>>15;v=Math.imul(v,2246822519);return((v^(v>>>13))>>>0)/4294967295;};
function normal(i){
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
  return {x:dy/d,y:-dx/d};
}
const normals=points.map((_,i)=>normal(i));
function buildStripMesh(name,offsets,palette,water=false){
  const railCount=offsets.length;
  const vertices=new Float32Array(points.length*railCount*3);
  const uv=new Float32Array(points.length*railCount*2);
  const colors=new Float32Array(points.length*railCount*3);
  const inds=new Uint32Array((points.length-1)*(railCount-1)*6);
  const cumulative=[0];
  for(let i=1;i<points.length;i++)cumulative[i]=cumulative[i-1]+
    Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  for(let i=0;i<points.length;i++){
    const p=points[i],n=normals[i],vary=2.4*Math.sin(p.y*.009)+1.8*Math.sin(p.y*.018+1.1);
    for(let j=0;j<railCount;j++){
      const w=offsets[j]+Math.sign(offsets[j])*vary;
      const x=p.x+n.x*w,y=p.y+n.y*w;
      const h=api.groundHeightAt(x,y);
      const k=i*railCount+j, base=k*3;
      vertices[base]=x;
      vertices[base+1]=h+(water?1.10:.65);
      vertices[base+2]=y;
      uv[k*2]=j/(railCount-1);
      uv[k*2+1]=cumulative[i]/104;
      const col=new THREE.Color(palette[Math.min(palette.length-1,j)]);
      colors[base]=col.r;colors[base+1]=col.g;colors[base+2]=col.b;
    }
  }
  let at=0;
  for(let i=0;i<points.length-1;i++)for(let j=0;j<railCount-1;j++){
    const a=i*railCount+j,b=a+railCount;
    inds[at++]=a;inds[at++]=b;inds[at++]=a+1;
    inds[at++]=a+1;inds[at++]=b;inds[at++]=b+1;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(inds,1));
  geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    vertexColors:true,roughness:water?.46:1,
    metalness:water?.055:0,side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;mesh.frustumCulled=false;
  bankRoot.add(mesh);
  return mesh;
}
const leftBank=buildStripMesh('left-silt-bank-v297',[-half-21,-half+2],bankTones);
const rightBank=buildStripMesh('right-silt-bank-v297',[half-2,half+21],bankTones.slice().reverse());
const waterMesh=buildStripMesh('flowing-water-v297',[-half+7,-half+17,0,half-17,half-7],waterTones,true);
const texCanvas=document.createElement('canvas');texCanvas.width=128;texCanvas.height=256;
const cx=texCanvas.getContext('2d');
cx.fillStyle='#ccd9d3';cx.fillRect(0,0,128,256);
for(let i=0;i<145;i++){
  const x=seeded(i*13+1)*128,y=seeded(i*11+3)*256;
  cx.strokeStyle=i%5===0?'rgba(248,252,242,.20)':'rgba(79,113,122,.12)';
  cx.lineWidth=0.7+(i%3)*.3;
  cx.beginPath();cx.moveTo(x,y);cx.lineTo(x+(seeded(i+7)-.5)*4,y+8+seeded(i+11)*38);cx.stroke();
}
const texture=new THREE.CanvasTexture(texCanvas);
texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
texture.colorSpace=THREE.SRGBColorSpace;
texture.anisotropy=2;
waterMesh.material.map=texture;
waterMesh.material.needsUpdate=true;
const initialOffset=texture.offset.y;
const stop=api.onFrame(time=>{texture.offset.y=(initialOffset+time*.034)%1;});
window.__BATTLEFIELD_3D_WATER_V297__=Object.freeze({
  version:'3d-flowing-water-v297',
  sharedSamples:points.length,
  bankMeshes:2,
  waterMeshes:1,
  waterMeshName:waterMesh.name,
  activeCurrent:true,
  visualOnly:true,
  navHalfWidth:half,
  flowUV:()=>texture.offset.y,
  diagnostics:()=>({
    vertices:waterMesh.geometry.attributes.position.count,
    waterMeshes:1,
    banks:2,
    flowOffset:texture.offset.y,
    scene:bankRoot.name
  })
});
