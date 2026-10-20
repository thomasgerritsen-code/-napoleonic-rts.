'use strict';
// v308: render the EXISTING v299 river-flow samples as instanced translucent
// 2D WebGL2 ripples on the same GPU terrain layer. Water geometry, shore
// erosion, bridge placement and collision remain owned by their older systems.
(function installGpuRiverFlowV308(root){
  if(root.__GPU_RIVER_FLOW_V308__)return;
  const terrain=root.__GPU_TERRAIN_V303__;
  const river=root.__RIVER_FLOW_2D_V299__;
  const canvas=document.getElementById('game-terrain-gpu');
  const mobile=!!root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
  const disabledByQuery=new URLSearchParams(location.search).get('gpuWater')==='off';
  const gl=!mobile&&terrain?.available?.()&&canvas?.getContext('webgl2');
  const STRIDE=8,MAX_RIPPLES=196,BASE_RIPPLES=168,SHALLOW_RIPPLES=28;
  let program=null,vao=null,vertices=null,instances=null;
  let uCamera=null,uResolution=null,uDpr=null;
  let failed=false,lost=false;
  const data=new Float32Array(MAX_RIPPLES*STRIDE);
  const stats={drawCalls:0,visible:0,lastVisible:0,wakesOnCanvas:0,
    samples:0,shaderFailures:0,canvasFallbacks:0,frames:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function active(){
    return !!gl&&!failed&&!lost&&!mobile&&!disabledByQuery&&
      !!terrain?.active?.()&&!!river?.sample;
  }
  function compile(type,source){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const error=gl.getShaderInfoLog(shader)||'GPU river shader failed';
      gl.deleteShader(shader);throw Error(error);
    }
    return shader;
  }
  function setup(){
    const vs=compile(gl.VERTEX_SHADER,[
      '#version 300 es','precision highp float;',
      'layout(location=0) in vec2 corner;',
      'layout(location=1) in vec4 pose;', // x,y,tangent x,y
      'layout(location=2) in vec4 detail;', // length,width,alpha,style
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;','out vec2 local;',
      'out float opacity;','flat out float style;',
      'void main(){',
      '  // A thin, tangent-aligned ribbon in strictly top-down space.',
      '  vec2 n=vec2(-pose.w,pose.z);',
      '  vec2 offset=pose.zw*(corner.x-.5)*detail.x+',
      '    n*(corner.y-.5)*max(1.0,detail.y*3.0);',
      '  vec2 pixel=resolution*.5+',
      '    (pose.xy+offset-cameraPose.xy)*cameraPose.z*dpr;',
      '  gl_Position=vec4(pixel.x*2.0/resolution.x-1.0,',
      '    1.0-pixel.y*2.0/resolution.y,0.0,1.0);',
      '  local=corner*2.0-1.0;',
      '  opacity=detail.z;style=detail.w;',
      '}'
    ].join('\n'));
    const fs=compile(gl.FRAGMENT_SHADER,[
      '#version 300 es','precision highp float;',
      'in vec2 local;','in float opacity;','flat in float style;',
      'out vec4 color;',
      'void main(){',
      '  // Anti-aliased, tapering centre-strands. No horizontal screen stripes.',
      '  float taper=1.0-smoothstep(.56,1.0,abs(local.x));',
      '  float slightBend=sin(local.x*2.1)*.14;',
      '  float cross=abs(local.y-slightBend);',
      '  float filament=1.0-smoothstep(.22,.82,cross);',
      '  float a=taper*filament*opacity;',
      '  if(a<.002)discard;',
      '  vec3 pale=style>.5?vec3(.77,.83,.73):vec3(.76,.89,.83);',
      '  color=vec4(pale,a);',
      '}'
    ].join('\n'));
    program=gl.createProgram();
    gl.attachShader(program,vs);gl.attachShader(program,fs);
    gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program)||'GPU river link failed');
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
    gl.vertexAttribPointer(2,4,gl.FLOAT,false,STRIDE*4,4*4);
    gl.vertexAttribDivisor(2,1);
    gl.bindVertexArray(null);
    uCamera=gl.getUniformLocation(program,'cameraPose');
    uResolution=gl.getUniformLocation(program,'resolution');
    uDpr=gl.getUniformLocation(program,'dpr');
  }
  function draw(time){
    if(!active()){stats.canvasFallbacks++;return false;}
    try{
      if(!program)setup();
      const zoom=Math.max(.05,camera.zoom);
      const bounds={top:camera.y-innerHeight/(2*zoom)-70,
        bottom:camera.y+innerHeight/(2*zoom)+70,
        left:camera.x-innerWidth/(2*zoom)-90,
        right:camera.x+innerWidth/(2*zoom)+90};
      let count=0;
      function add(w,style){
        if(w.y<bounds.top||w.y>bounds.bottom||
           w.x<bounds.left||w.x>bounds.right||count>=MAX_RIPPLES)return;
        const i=count*STRIDE;
        data[i]=w.x;data[i+1]=w.y;
        data[i+2]=w.tx;data[i+3]=w.ty;
        data[i+4]=style>0?5.8:w.length;
        data[i+5]=style>0?.9:w.width;
        data[i+6]=style>0?.11:clamp(w.alpha,0,.35);
        data[i+7]=style;
        count++;
      }
      for(let i=0;i<BASE_RIPPLES;i++)add(river.sample(i,time),0);
      for(let i=0;i<SHALLOW_RIPPLES;i++){
        const w=river.sample(i+1000,time*.78);
        if(Math.abs(w.lane)<.58)continue;
        add(w,1);
      }
      if(count){
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(program);gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER,instances);
        gl.bufferData(gl.ARRAY_BUFFER,data.subarray(0,count*STRIDE),gl.DYNAMIC_DRAW);
        gl.uniform3f(uCamera,camera.x,camera.y,camera.zoom);
        gl.uniform2f(uResolution,canvas.width,canvas.height);
        gl.uniform1f(uDpr,canvas.width/Math.max(1,innerWidth));
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
        stats.drawCalls++;
      }
      stats.frames++;
      stats.visible+=count;
      stats.lastVisible=count;
      stats.samples+=BASE_RIPPLES+SHALLOW_RIPPLES;
      return {visible:count};
    }catch(_error){
      stats.shaderFailures++;failed=true;stats.canvasFallbacks++;
      return false;
    }finally{
      if(gl&&!lost)gl.disable(gl.BLEND);
    }
  }
  canvas?.addEventListener('webglcontextlost',()=>{
    lost=true;program=null;
  });
  canvas?.addEventListener('webglcontextrestored',()=>{
    lost=false;failed=false;program=null;vao=null;vertices=null;instances=null;
  });
  const api=Object.freeze({
    version:'308.0',twoDOnly:true,flowFromExistingV299:true,
    shoreDragPreserved:true,bridgeWakesRemainCanvas:true,
    noGameplayChange:true,active,draw,
    recordWakes:n=>{stats.wakesOnCanvas+=n;},
    metrics:()=>({...stats,active:active(),
      disabledByQuery,mobile,textureBytes:0})
  });
  root.__GPU_RIVER_FLOW_V308__=api;
  root.NRTS?.subsystems?.register?.('gpu-river-flow-v308',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'instanced 2D GPU ripple strands from the existing v299 current, keeping 2D bridge eddies'
  });
})(window);
