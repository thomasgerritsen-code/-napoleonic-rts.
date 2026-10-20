'use strict';
// v307: original 2D gameplay roofs as cached GPU sprites, with the entire
// interactive selection/HP/production overlay still drawn on Canvas2D.
// Villages, obstacles and all building simulation remain unchanged.
(function installGpuBuildingsV307(root){
  if(root.__GPU_BUILDINGS_V307__)return;
  const terrain=root.__GPU_TERRAIN_V303__;
  const props=root.__GPU_RESOURCES_V306__;
  const roof=root.__TOPDOWN_BUILDING_V307__;
  const canvas=document.getElementById('game-terrain-gpu');
  const mobile=!!root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
  const disabledByQuery=new URLSearchParams(location.search).get('gpuBuildings')==='off';
  const gl=!mobile&&terrain?.available?.()&&canvas?.getContext('webgl2');
  const TILE=256,ATLAS=2048,SLOTS=ATLAS/TILE,MAX_SLOTS=SLOTS*SLOTS,STRIDE=5;
  const cache=new Map();
  const surface=document.createElement('canvas');
  surface.width=surface.height=TILE;
  const brush=surface.getContext('2d');
  let program=null,vao=null,vertices=null,instances=null,texture=null;
  let uCamera=null,uResolution=null,uDpr=null,uAtlas=null;
  let lost=false,failed=false,queued=0,slots=0;
  let resourceFlushed=false;
  let batch=new Float32Array(STRIDE*32);
  const stats={drawCalls:0,roofs:0,textureUploads:0,spriteReuses:0,
    overlays:0,canvasFallbacks:0,overflows:0,failures:0,invalidations:0};

  function active(){
    return !mobile&&!disabledByQuery&&!lost&&!failed&&!!gl&&
      !!roof?.paintRoof&&!!roof?.drawIndicators&&
      !!terrain?.active?.()&&camera.zoom<=1.1;
  }
  function compile(type,source){
    const sh=gl.createShader(type);
    gl.shaderSource(sh,source);
    gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      const reason=gl.getShaderInfoLog(sh)||'2D building shader compilation failed';
      gl.deleteShader(sh);throw Error(reason);
    }
    return sh;
  }
  function initialize(){
    const vs=compile(gl.VERTEX_SHADER,[
      '#version 300 es','precision highp float;',
      'layout(location=0) in vec2 corner;',
      'layout(location=1) in vec4 sprite;',
      'layout(location=2) in float opacity;',
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;',
      'out vec2 uv;','out float alpha;',
      'void main(){',
      '  vec2 world=sprite.xy+(corner-0.5)*256.0;',
      '  vec2 p=resolution*0.5+(world-cameraPose.xy)*cameraPose.z*dpr;',
      '  gl_Position=vec4(p.x*2.0/resolution.x-1.0,',
      '    1.0-p.y*2.0/resolution.y,0.0,1.0);',
      '  uv=(sprite.zw*256.0+vec2(.5+255.0*corner.x,',
      '    .5+255.0*(1.0-corner.y)))/2048.0;',
      '  alpha=opacity;',
      '}'
    ].join('\n'));
    const fs=compile(gl.FRAGMENT_SHADER,[
      '#version 300 es','precision mediump float;',
      'uniform sampler2D atlasTexture;',
      'in vec2 uv;','in float alpha;',
      'out vec4 color;',
      'void main(){',
      '  color=texture(atlasTexture,uv);',
      '  color.a*=alpha;',
      '  if(color.a<0.005)discard;',
      '}'
    ].join('\n'));
    program=gl.createProgram();
    gl.attachShader(program,vs);gl.attachShader(program,fs);
    gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program)||'2D building shader link failed');
    vao=gl.createVertexArray();gl.bindVertexArray(vao);
    vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      0,0,1,0,0,1,0,1,1,0,1,1
    ]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    instances=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,instances);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,4,gl.FLOAT,false,STRIDE*4,0);
    gl.vertexAttribDivisor(1,1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2,1,gl.FLOAT,false,STRIDE*4,4*4);
    gl.vertexAttribDivisor(2,1);
    gl.bindVertexArray(null);
    uCamera=gl.getUniformLocation(program,'cameraPose');
    uResolution=gl.getUniformLocation(program,'resolution');
    uDpr=gl.getUniformLocation(program,'dpr');
    uAtlas=gl.getUniformLocation(program,'atlasTexture');
    texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,ATLAS,ATLAS,0,
      gl.RGBA,gl.UNSIGNED_BYTE,null);
  }
  function roofSlot(b){
    // Geometry is entirely deterministic for this type/side/size/phase.
    // Stroke widths depend weakly on zoom, so refresh at 0.1 zoom intervals.
    const key=[b.type,b.side,b.w,b.h,!!b.complete,
      Math.round(camera.zoom*10)].join(':');
    const existing=cache.get(key);
    if(existing!==undefined){stats.spriteReuses++;return existing;}
    if(slots>=MAX_SLOTS)return -1;
    const slot=slots++;
    brush.setTransform(1,0,0,1,0,0);brush.clearRect(0,0,TILE,TILE);
    brush.save();brush.translate(TILE/2,TILE/2);
    const painted=roof.paintRoof(b,brush);
    brush.restore();
    if(!painted)return -1;
    const x=(slot%SLOTS)*TILE,y=Math.floor(slot/SLOTS)*TILE;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,surface);
    cache.set(key,slot);stats.textureUploads++;
    return slot;
  }
  function cameraVisible(b){
    const zoom=Math.max(.05,camera.zoom),margin=Math.max(b.w,b.h)*.8+25;
    return Math.abs(b.x-camera.x)<=innerWidth/(2*zoom)+margin&&
      Math.abs(b.y-camera.y)<=innerHeight/(2*zoom)+margin;
  }
  function enqueue(b){
    if(!active()||!b||b.dead||!Number.isFinite(b.w)||!Number.isFinite(b.h)||
      b.w>TILE-24||b.h>TILE-24||b.w<=0||b.h<=0||
      !cameraVisible(b))return false;
    try{
      if(!program)initialize();
      const slot=roofSlot(b);
      if(slot<0){stats.overflows++;return false;}
      // Resources render BEFORE buildings, matching the existing 2D draw order.
      // Flush only once, before any building batch is queued this frame.
      if(!resourceFlushed){props?.flush?.();resourceFlushed=true;}
      if((queued+1)*STRIDE>batch.length){
        const expanded=new Float32Array(batch.length*2);
        expanded.set(batch);batch=expanded;
      }
      const i=queued*STRIDE;
      batch[i]=b.x;batch[i+1]=b.y;batch[i+2]=slot%SLOTS;
      batch[i+3]=Math.floor(slot/SLOTS);batch[i+4]=b.complete?1:.65;
      queued++;
      return true;
    }catch(_error){
      failed=true;stats.failures++;queued=0;
      return false;
    }
  }
  function flush(){
    resourceFlushed=false;
    if(!queued)return;
    if(!active()){queued=0;return;}
    try{
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,instances);
      gl.bufferData(gl.ARRAY_BUFFER,batch.subarray(0,queued*STRIDE),gl.DYNAMIC_DRAW);
      gl.uniform3f(uCamera,camera.x,camera.y,camera.zoom);
      gl.uniform2f(uResolution,canvas.width,canvas.height);
      gl.uniform1f(uDpr,canvas.width/Math.max(1,innerWidth));
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.uniform1i(uAtlas,0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,queued);
      gl.disable(gl.BLEND);gl.bindVertexArray(null);
      stats.drawCalls++;stats.roofs+=queued;
    }catch(_error){stats.failures++;failed=true;}
    finally{gl.disable(gl.BLEND);queued=0;}
  }
  const canvasBuilding=drawBuilding;
  drawBuilding=function drawGpuGameplayBuildingV307(b){
    if(b&&enqueue(b)){
      if(roof.hasIndicators(b)){
        roof.drawIndicators(b);stats.overlays++;
      }
      return;
    }
    stats.canvasFallbacks++;
    return canvasBuilding.apply(this,arguments);
  };
  // GPU resource batch is flushed by the first successful building.
  // GPU buildings must flush before the existing GPU-soldier marker hook.
  const previousMarkers=drawRegimentMarkers;
  drawRegimentMarkers=function drawBuildingBatchBeforeUnitMarkersV307(){
    flush();
    return previousMarkers.apply(this,arguments);
  };
  function invalidate(){
    queued=0;resourceFlushed=false;slots=0;cache.clear();
    stats.invalidations++;
  }
  canvas?.addEventListener('webglcontextlost',()=>{
    lost=true;queued=0;texture=null;program=null;cache.clear();slots=0;
  });
  canvas?.addEventListener('webglcontextrestored',()=>{
    lost=false;failed=false;queued=0;resourceFlushed=false;
    program=null;vao=null;vertices=null;instances=null;texture=null;
    cache.clear();slots=0;
  });
  root.NRTS?.events?.on?.('game:reset',invalidate);
  const api=Object.freeze({
    version:'307.0',twoDOnly:true,desktopOnly:true,
    originalRoofPainter:true,liveCanvasOverlays:true,
    roadAndCollisionUnchanged:true,villagesUnchanged:true,
    active,enqueue,flush,invalidate,
    metrics:()=>({...stats,active:active(),queued,
      cachedVariants:cache.size,atlasBytes:texture?ATLAS*ATLAS*4:0,
      canvasFallbackAvailable:true,disabledByQuery,mobile})
  });
  root.__GPU_BUILDINGS_V307__=api;
  root.NRTS?.subsystems?.register?.('gpu-buildings-v307',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'cached top-down 2D gameplay roofs in one WebGL2 batch, dynamic Canvas health/selection/progress overlays'
  });
})(window);
