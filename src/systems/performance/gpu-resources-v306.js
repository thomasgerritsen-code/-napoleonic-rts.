'use strict';
// v306: batch ordinary 2D trees, berry bushes and mossy iron stones into one
// WebGL2 draw while retaining the exact existing Canvas resource silhouettes.
// Mobile, gameplay, river/road exclusion, and guaranteed village berries stay 2D.
(function installGpuResourcesV306(root){
  if(root.__GPU_RESOURCES_V306__)return;
  const terrain=root.__GPU_TERRAIN_V303__;
  const natural=root.__NATURAL_RESOURCES_V1__;
  const canvas=document.getElementById('game-terrain-gpu');
  const disabledByQuery=new URLSearchParams(location.search).get('gpuProps')==='off';
  const mobile=!!root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
  const gl=!mobile&&terrain?.available?.()&&canvas?.getContext('webgl2');
  const TILE=96,ATLAS=2016,SLOTS=ATLAS/TILE,MAX_SPRITES=SLOTS*SLOTS;
  const STRIDE=4,MAX_DRAW=2048;
  const cache=new Map();
  const surface=document.createElement('canvas');
  surface.width=surface.height=TILE;
  const surfaceCtx=surface.getContext('2d',{willReadFrequently:false});
  let atlas=null,program=null,vao=null,vertex=null,instance=null;
  let locCamera=null,locResolution=null,locDpr=null;
  let failed=false,lost=false,count=0,nextSlot=0;
  let data=new Float32Array(STRIDE*256);
  const stats={drawCalls:0,instances:0,uploads:0,repaints:0,
    skippedEcology:0,fallbacks:0,overflows:0,failures:0,resets:0};
  function active(){
    return !disabledByQuery&&!mobile&&!failed&&!lost&&!!gl&&
      !!natural?.canPaint&&!!natural?.paintToContext&&
      !!terrain?.active?.()&&camera.zoom<=1.1;
  }
  function compile(type,source){
    const sh=gl.createShader(type);
    gl.shaderSource(sh,source);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      const info=gl.getShaderInfoLog(sh)||'WebGL2 sprite compilation failed';
      gl.deleteShader(sh);throw Error(info);
    }
    return sh;
  }
  function setup(){
    const vs=compile(gl.VERTEX_SHADER,[
      '#version 300 es','precision highp float;',
      'layout(location=0) in vec2 corner;',
      'layout(location=1) in vec4 sprite;',
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;','out vec2 vUv;',
      'void main(){',
      '  vec2 relative=(corner-.5)*96.0;',
      '  vec2 pixel=resolution*.5+(sprite.xy+relative-cameraPose.xy)*cameraPose.z*dpr;',
      '  gl_Position=vec4(pixel.x*2.0/resolution.x-1.0,',
      '    1.0-pixel.y*2.0/resolution.y,0.0,1.0);',
      '  vUv=(sprite.zw*96.0+vec2(.5+95.0*corner.x,',
      '    .5+95.0*(1.0-corner.y)))/2016.0;',
      '}'
    ].join('\n'));
    const fs=compile(gl.FRAGMENT_SHADER,[
      '#version 300 es','precision mediump float;',
      'in vec2 vUv;','uniform sampler2D atlasTexture;',
      'out vec4 color;',
      'void main(){',
      '  color=texture(atlasTexture,vUv);',
      '  if(color.a<.005)discard;',
      '}'
    ].join('\n'));
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);
    gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program)||'WebGL2 sprite link failed');
    vao=gl.createVertexArray();gl.bindVertexArray(vao);
    vertex=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertex);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      0,0,1,0,0,1,0,1,1,0,1,1
    ]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    instance=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,instance);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,4,gl.FLOAT,false,STRIDE*4,0);
    gl.vertexAttribDivisor(1,1);
    gl.bindVertexArray(null);
    locCamera=gl.getUniformLocation(program,'cameraPose');
    locResolution=gl.getUniformLocation(program,'resolution');
    locDpr=gl.getUniformLocation(program,'dpr');
    atlas=gl.createTexture();gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,atlas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,ATLAS,ATLAS,0,
      gl.RGBA,gl.UNSIGNED_BYTE,null);
  }
  function slotFor(r){
    // Preserve each tree's original seeded crown and each bush's individual
    // berries; quantize harvest-driven visual shrinkage to 5% of full amount.
    const key=[r.type,r.id,r.x,r.y].join(':');
    const ratio=Math.max(0,Math.min(1,r.amount/Math.max(1,r.maxAmount)));
    const amountBucket=Math.floor(ratio*20);
    let found=cache.get(key);
    if(found&&found.amountBucket===amountBucket)return found.slot;
    if(!found){
      if(nextSlot>=MAX_SPRITES)return -1;
      found={slot:nextSlot++,amountBucket:-1};
      cache.set(key,found);
    }
    const col=found.slot%SLOTS,row=Math.floor(found.slot/SLOTS);
    surfaceCtx.setTransform(1,0,0,1,0,0);
    surfaceCtx.clearRect(0,0,TILE,TILE);
    surfaceCtx.save();surfaceCtx.translate(TILE/2-r.x,TILE/2-r.y);
    const painted=natural.paintToContext(r,surfaceCtx);
    surfaceCtx.restore();
    if(!painted)return -1;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texSubImage2D(gl.TEXTURE_2D,0,col*TILE,row*TILE,
      gl.RGBA,gl.UNSIGNED_BYTE,surface);
    if(found.amountBucket>=0)stats.repaints++;
    found.amountBucket=amountBucket;
    stats.uploads++;
    return found.slot;
  }
  function enqueue(r){
    if(!active())return false;
    if(!natural.canPaint(r)){stats.skippedEcology++;return false;}
    if(count>=MAX_DRAW){stats.overflows++;return false;}
    try{
      if(!program)setup();
      const slot=slotFor(r);
      if(slot<0){stats.overflows++;return false;}
      if((count+1)*STRIDE>data.length){
        const expanded=new Float32Array(data.length*2);
        expanded.set(data);data=expanded;
      }
      const i=count*STRIDE;
      data[i]=r.x;data[i+1]=r.y;
      data[i+2]=slot%SLOTS;data[i+3]=Math.floor(slot/SLOTS);
      count++;return true;
    }catch(_error){
      stats.failures++;failed=true;
      count=0;return false;
    }
  }
  function flush(){
    if(!count)return;
    if(!active()){count=0;return;}
    try{
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,instance);
      gl.bufferData(gl.ARRAY_BUFFER,data.subarray(0,count*STRIDE),gl.DYNAMIC_DRAW);
      gl.uniform3f(locCamera,camera.x,camera.y,camera.zoom);
      gl.uniform2f(locResolution,canvas.width,canvas.height);
      gl.uniform1f(locDpr,canvas.width/Math.max(1,innerWidth));
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlas);
      gl.uniform1i(gl.getUniformLocation(program,'atlasTexture'),0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
      stats.drawCalls++;stats.instances+=count;
    }catch(_error){
      stats.failures++;failed=true;
      // Next frame reverts to the existing Canvas natural-resource renderer.
    }finally{
      gl.disable(gl.BLEND);
      count=0;
    }
  }
  const previousResource=drawResource;
  drawResource=function drawResourceGpuV306(r){
    if(!enqueue(r)){
      stats.fallbacks++;
      return previousResource.apply(this,arguments);
    }
  };
  // The game calls drawRegimentMarkers after the resource and building passes;
  // this executes the resource batch BEFORE the existing GPU soldier batch.
  const previousMarkers=drawRegimentMarkers;
  drawRegimentMarkers=function flushResourcesBeforeSoldiersV306(){
    flush();
    return previousMarkers.apply(this,arguments);
  };
  function invalidate(){
    cache.clear();nextSlot=0;count=0;stats.resets++;
    // Safe to reuse the existing atlas allocation on game restart.
  }
  canvas?.addEventListener('webglcontextlost',()=>{
    lost=true;count=0;atlas=null;program=null;
    cache.clear();nextSlot=0;
  });
  canvas?.addEventListener('webglcontextrestored',()=>{
    lost=false;failed=false;atlas=null;program=null;vao=null;vertex=null;instance=null;
    cache.clear();nextSlot=0;count=0;
  });
  root.NRTS?.events?.on?.('game:reset',invalidate);
  const api=Object.freeze({
    version:'306.0',twoDOnly:true,desktopOnly:true,
    existingNaturalSpriteShapes:true,roadAndRiverGuards:true,
    retainsLocalVillageBerries:true,
    active,enqueue,flush,invalidate,
    metrics:()=>({...stats,active:active(),queued:count,spriteCount:cache.size,
      maxSprites:MAX_SPRITES,atlasBytes:atlas?ATLAS*ATLAS*4:0,
      disabledByQuery,mobile})
  });
  root.__GPU_RESOURCES_V306__=api;
  root.NRTS?.subsystems?.register?.('gpu-resources-v306',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'one WebGL2 draw for real 2D natural resources, exact seeded art and Canvas fallback'
  });
})(window);
