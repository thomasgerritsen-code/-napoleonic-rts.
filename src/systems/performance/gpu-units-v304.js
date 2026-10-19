'use strict';
// v304: optional WebGL2 instanced sprites for distant unselected soldiers.
// The CPU simulation, detailed close-up 2D artwork and touch/camera commands
// stay unchanged. Uses a separate transparent compositing layer above #game.
(function installGpuUnitsV304(root) {
  if (root.__GPU_UNITS_V304__) return;
  const game = document.getElementById('game');
  const mobile = !!root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
  const params = new URLSearchParams(location.search);
  const disabled = mobile || params.get('gpu') === 'off' || params.get('units') === 'cpu';
  const gpuCanvas = document.createElement('canvas');
  gpuCanvas.id = 'game-units-gpu';
  gpuCanvas.setAttribute('aria-hidden','true');
  Object.assign(gpuCanvas.style, {
    position:'fixed',inset:'0',zIndex:'2',width:'100%',height:'100%',
    pointerEvents:'none',touchAction:'none',display:'none'
  });
  game.insertAdjacentElement('afterend',gpuCanvas);

  const STRIDE=8, MAX=4096, data=new Float32Array(MAX*STRIDE);
  let gl=null,program=null,vao=null,instanceBuffer=null,count=0,frame=false;
  let viewportUniform=null,cameraUniform=null;
  let enabled=false,lost=false;
  const stats={frames:0,instances:0,batches:0,skipped:0,fallbacks:0,
    contextLosses:0,peakBatch:0};

  const vertexShader = `#version 300 es
precision highp float;
in vec2 aCorner;
in vec2 iWorld;
in vec2 iHeading;
in vec4 iStyle;
uniform vec2 uViewport;
uniform vec3 uCamera;
out vec2 vLocal;
flat out vec4 vStyle;
void main() {
  vec2 heading=iHeading;
  vec2 offset=vec2(aCorner.x*heading.x-aCorner.y*heading.y,
                   aCorner.x*heading.y+aCorner.y*heading.x);
  vec2 world=iWorld+offset*18.0;
  vec2 screen=(world-uCamera.xy)*uCamera.z+uViewport*.5;
  gl_Position=vec4(screen.x*2.0/uViewport.x-1.0,
     1.0-screen.y*2.0/uViewport.y,0.0,1.0);
  vLocal=aCorner;
  vStyle=iStyle;
}`;
  const fragmentShader = `#version 300 es
precision mediump float;
in vec2 vLocal;
flat in vec4 vStyle;
out vec4 outColor;
void main(){
  // Style: type (foot/officer/drummer/cavalry), French flag, routing, radius.
  float kind=vStyle.x;
  bool france=vStyle.y>.5;
  bool routed=vStyle.z>.5;
  vec3 coat=routed?vec3(.47,.47,.46):(france?vec3(.15,.30,.57):vec3(.65,.20,.19));
  vec3 accent=france?vec3(.66,.76,.94):vec3(.95,.67,.64);
  vec3 dark=vec3(.16,.15,.14);
  vec2 p=vLocal*18.0;
  float body=length(vec2(p.x/6.2,p.y/5.1));
  if(kind>2.5){ // mounted silhouette
    float horse=length(vec2((p.x+1.4)/12.0,p.y/5.8));
    float head=length(vec2((p.x-10.0)/4.0,p.y/3.4));
    if(horse>1.0 && head>1.0) discard;
    outColor=vec4(horse<.9?coat:dark,1.0);
    if(length(vec2(p.x/4.2,p.y/3.6))<1.0)outColor=vec4(coat,1.0);
    return;
  }
  float shako=length(vec2((p.x-3.0)/2.5,p.y/3.0));
  if(body>1.0 && shako>1.0 && !(p.x>3.0 && p.x<11.0 && abs(p.y)<1.2))discard;
  vec3 color=body<=1.0?coat:dark;
  if(body<=.80 && p.x<-.8)color=mix(coat,dark,.24);
  if(shako<1.0)color=dark;
  if(p.x>3.0 && p.x<11.0 && abs(p.y)<1.2)color=accent;
  if(kind>0.5 && kind<1.5 && length(vec2((p.x-4.)/2.5,(p.y+3.)/2.5))<1.)color=vec3(.93,.79,.36);
  if(kind>1.5 && kind<2.5 && length(vec2(p.x/4.,(p.y-5.)/2.3))<1.)color=vec3(.70,.45,.23);
  outColor=vec4(color,1.0);
}`;

  function shader(type,source){
    const sh=gl.createShader(type);
    gl.shaderSource(sh,source);
    gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      const message=gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(message||'GPU-unit shader failed');
    }
    return sh;
  }

  function init(){
    const vs=shader(gl.VERTEX_SHADER,vertexShader);
    const fs=shader(gl.FRAGMENT_SHADER,fragmentShader);
    program=gl.createProgram();
    gl.attachShader(program,vs);gl.attachShader(program,fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program)||'GPU-unit link failed');
    vao=gl.createVertexArray();
    gl.bindVertexArray(vao);
    const quad=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      -1,-1,1,-1,-1,1,-1,1,1,-1,1,1
    ]),gl.STATIC_DRAW);
    const corner=gl.getAttribLocation(program,'aCorner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);

    instanceBuffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,MAX*STRIDE*4,gl.DYNAMIC_DRAW);
    for(const [name,size,offset] of [['iWorld',2,0],['iHeading',2,2],['iStyle',4,4]]){
      const loc=gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,size,gl.FLOAT,false,STRIDE*4,offset*4);
      gl.vertexAttribDivisor(loc,1);
    }
    gl.bindVertexArray(null);
    viewportUniform=gl.getUniformLocation(program,'uViewport');
    cameraUniform=gl.getUniformLocation(program,'uCamera');
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  function fallback(){
    if(enabled)stats.fallbacks++;
    enabled=false;frame=false;count=0;
    gpuCanvas.style.display='none';
  }
  if(!disabled){
    try{
      gl=gpuCanvas.getContext('webgl2',{
        alpha:true,premultipliedAlpha:false,antialias:true,depth:false,stencil:false,
        preserveDrawingBuffer:false,powerPreference:'high-performance'
      });
      if(gl){init();enabled=true;gpuCanvas.style.display='block';}
    }catch(_e){fallback();}
  }

  gpuCanvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();lost=true;stats.contextLosses++;fallback();
  });
  gpuCanvas.addEventListener('webglcontextrestored',()=>{
    lost=false;
    if(!gl||disabled)return;
    try{init();enabled=true;gpuCanvas.style.display='block';}
    catch(_e){fallback();}
  });

  function begin(){
    frame=false;count=0;
    if(!enabled||lost||!gl)return;
    if(game.width!==gpuCanvas.width||game.height!==gpuCanvas.height){
      gpuCanvas.width=game.width;gpuCanvas.height=game.height;
    }
    gl.viewport(0,0,gpuCanvas.width,gpuCanvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    frame=true;
    stats.frames++;
  }
  function queue(unit){
    if(!frame||!enabled||lost||count>=MAX||!unit||unit.dead)return false;
    if(unit.type==='artillery'||unit.type==='worker')return false;
    const kind=unit.type==='cavalry'?3:unit.type==='officer'?1:unit.type==='drummer'?2:0;
    const at=count*STRIDE,angle=Number.isFinite(unit.facing)?unit.facing:0;
    data[at]=unit.x;data[at+1]=unit.y;
    data[at+2]=Math.cos(angle);data[at+3]=Math.sin(angle);
    data[at+4]=kind;data[at+5]=unit.side==='france'?1:0;
    data[at+6]=unit.routing?1:0;data[at+7]=1;
    count++;
    return true;
  }
  function flush(){
    if(!frame||!enabled||lost)return false;
    frame=false;
    if(!count)return true;
    try{
      const dpr=game.width/Math.max(1,innerWidth);
      gl.useProgram(program);gl.bindVertexArray(vao);
      gl.uniform2f(viewportUniform,gpuCanvas.width,gpuCanvas.height);
      gl.uniform3f(cameraUniform,camera.x,camera.y,camera.zoom*dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,data.subarray(0,count*STRIDE));
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
      gl.bindVertexArray(null);
      stats.batches++;stats.instances+=count;
      stats.peakBatch=Math.max(stats.peakBatch,count);
      return true;
    }catch(_e){fallback();return false;}
  }
  // Integrate with the existing frame: terrain begins before units; particles
  // finish after units. No new simulation tick or animation loop is added.
  const previousTerrain=drawTerrain;
  drawTerrain=function drawTerrainGpuUnitsV304(){
    const result=previousTerrain.apply(this,arguments);
    begin();
    return result;
  };
  const previousParticles=drawParticles;
  drawParticles=function drawParticlesGpuUnitsV304(){
    try{return previousParticles.apply(this,arguments);}
    finally{flush();}
  };
  root.NRTS?.events?.on?.('game:reset',()=>{count=0;frame=false;});
  const api=Object.freeze({
    version:'304.0',twoDOnly:true,instanced:true,desktopOnly:true,
    active:()=>enabled&&!lost,queue,begin,flush,
    metrics:()=>({...stats,active:enabled&&!lost,pending:count,
      supported:!!gl&&!lost,disabled,mobile,maximumBatch:MAX})
  });
  root.__GPU_UNITS_V304__=api;
  root.NRTS?.subsystems?.register?.('gpu-units-v304',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'instanced distant 2D unit silhouettes; no simulation or input authority'
  });
})(window);
