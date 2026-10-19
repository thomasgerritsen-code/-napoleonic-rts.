'use strict';
// v304: distant 2D soldiers in one WebGL2 instanced draw on the v303 terrain
// context. Units and camera remain simulation-owned. Close-up, selected,
// artillery and mobile soldiers preserve their existing Canvas2D render path.
(function installGpuUnitsV304(root){
  if(root.__GPU_UNITS_V304__)return;
  const terrain=root.__GPU_TERRAIN_V303__;
  const canvas=document.getElementById('game-terrain-gpu');
  const disabledByQuery=new URLSearchParams(location.search).get('gpuUnits')==='off';
  const gl=terrain?.available?.()&&canvas?.getContext('webgl2');
  const STRIDE=6,MAX_UNITS=4096;
  let program=null,vao=null,buffer=null,vertex=null;
  let uCamera=null,uResolution=null,uDpr=null;
  let failed=false,count=0,instances=new Float32Array(512*STRIDE);
  const stats={drawCalls:0,soldiers:0,uploads:0,fallbacks:0,
    failures:0,discardedOnReset:0};
  const kindByType={infantry:0,cavalry:1,officer:2,drummer:3,worker:4};

  function compile(type,source){
    const sh=gl.createShader(type);
    gl.shaderSource(sh,source);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      const why=gl.getShaderInfoLog(sh);gl.deleteShader(sh);
      throw Error(why||'GPU unit shader failed');
    }
    return sh;
  }
  function setup(){
    const v=compile(gl.VERTEX_SHADER,[
      '#version 300 es','precision highp float;',
      'layout(location=0) in vec2 corner;',
      'layout(location=1) in vec3 posAngle;',
      'layout(location=2) in vec3 typeSideRouting;',
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;','out vec2 local;',
      'flat out vec3 soldier;',
      'void main(){',
      'local=(corner*2.0-1.0)*20.0;',
      'float c=cos(posAngle.z),s=sin(posAngle.z);',
      'vec2 turned=vec2(c*local.x-s*local.y,s*local.x+c*local.y);',
      'vec2 center=resolution*0.5;',
      'vec2 p=center+(posAngle.xy+turned-cameraPose.xy)*cameraPose.z*dpr;',
      'gl_Position=vec4(p.x*2.0/resolution.x-1.0,1.0-p.y*2.0/resolution.y,0.0,1.0);',
      'soldier=typeSideRouting;',
      '}'
    ].join('\n'));
    const f=compile(gl.FRAGMENT_SHADER,[
      '#version 300 es','precision highp float;',
      'in vec2 local;','flat in vec3 soldier;',
      'out vec4 outputColor;',
      'void main(){',
      'float kind=soldier.x,enemy=soldier.y,routing=soldier.z;',
      'vec3 coat=enemy>0.5?vec3(.663,.204,.188):vec3(.145,.298,.553);',
      'if(routing>0.5)coat=vec3(.47);',
      'vec3 pale=vec3(.91,.86,.75),ink=vec3(.12,.11,.10),color=coat;',
      'float r=length(local);',
      'if(kind<.5){',
      'bool musket=local.x>2.0&&local.x<10.0&&abs(local.y)<.70;',
      'if(r>5.7&&!musket)discard;',
      'color=musket?pale:(r>4.8?ink:coat);',
      '}else if(kind<1.5){',
      'float horse=length(vec2((local.x+2.0)/10.0,local.y/4.6));',
      'float rider=length(vec2((local.x-.7)/3.2,local.y/3.2));',
      'if(horse>1.0&&rider>1.0)discard;',
      'color=rider<1.0?coat:vec3(.33,.26,.20);',
      '}else if(kind<2.5){',
      'if(r>6.2)discard;',
      'color=r<2.2?pale:(r>5.3?ink:coat);',
      '}else if(kind<3.5){',
      'bool drum=local.x>-3.0&&local.x<5.5&&local.y>3.0&&local.y<7.0;',
      'if(r>5.4&&!drum)discard;',
      'color=drum?vec3(.80,.64,.29):coat;',
      '}else{if(r>5.2)discard;color=vec3(.48,.40,.29);}',
      'outputColor=vec4(color,1.0);',
      '}'
    ].join('\n'));
    program=gl.createProgram();
    gl.attachShader(program,v);gl.attachShader(program,f);
    gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program)||'GPU unit program failed');
    vao=gl.createVertexArray();gl.bindVertexArray(vao);
    vertex=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertex);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      0,0,1,0,0,1,0,1,1,0,1,1
    ]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1,3,gl.FLOAT,false,STRIDE*4,0);
    gl.vertexAttribDivisor(1,1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2,3,gl.FLOAT,false,STRIDE*4,3*4);
    gl.vertexAttribDivisor(2,1);
    gl.bindVertexArray(null);
    uCamera=gl.getUniformLocation(program,'cameraPose');
    uResolution=gl.getUniformLocation(program,'resolution');
    uDpr=gl.getUniformLocation(program,'dpr');
  }
  function active(){return !disabledByQuery&&!failed&&!!gl&&!!terrain?.active?.();}
  function enqueue(unit){
    // Existing large-army code owns density LOD, culling, selection and
    // marching simulation. This function only replaces its distant draw.
    if(!active()||!unit||unit.dead||unit.type==='artillery'||
       selectedUnits.has(unit)||count>=MAX_UNITS){
      stats.fallbacks++;return false;
    }
    const kind=kindByType[unit.type];
    if(kind===undefined){stats.fallbacks++;return false;}
    if((count+1)*STRIDE>instances.length){
      const next=new Float32Array(instances.length*2);
      next.set(instances);instances=next;
    }
    const i=count*STRIDE;
    instances[i]=unit.x;instances[i+1]=unit.y;
    instances[i+2]=Number.isFinite(unit.facing)?unit.facing:0;
    instances[i+3]=kind;
    instances[i+4]=unit.side==='britain'?1:0;
    instances[i+5]=unit.routing?1:0;
    count++;return true;
  }
  function flush(){
    if(!count)return;
    if(!active()){count=0;return;}
    try{
      if(!program)setup();
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,instances.subarray(0,count*STRIDE),gl.DYNAMIC_DRAW);
      gl.uniform3f(uCamera,camera.x,camera.y,camera.zoom);
      gl.uniform2f(uResolution,canvas.width,canvas.height);
      gl.uniform1f(uDpr,canvas.width/Math.max(1,innerWidth));
      gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
      gl.bindVertexArray(null);
      stats.soldiers+=count;stats.uploads+=count;stats.drawCalls++;
    }catch(_){
      failed=true;stats.failures++;
      // Canvas2D automatically takes over on the next frame.
    }finally{count=0;}
  }

  // At this stage of the draw chain the terrain's WebGL framebuffer exists
  // and all distant units have been queued, but the Canvas HUD is not drawn.
  const previousMarkers=drawRegimentMarkers;
  drawRegimentMarkers=function gpuSoldiersBeforeMarkersV304(){
    flush();
    return previousMarkers.apply(this,arguments);
  };
  canvas?.addEventListener('webglcontextlost',()=>{
    count=0;program=null;
  });
  canvas?.addEventListener('webglcontextrestored',()=>{
    program=null;vao=null;buffer=null;vertex=null;failed=false;
  });
  root.NRTS?.events?.on?.('game:reset',()=>{
    stats.discardedOnReset+=count;count=0;
  });
  const api=Object.freeze({
    version:'304.0',desktopOnly:true,lowZoomOnly:true,
    no3D:true,artilleryUnchanged:true,active,enqueue,flush,
    metrics:()=>({...stats,active:active(),queued:count,maxUnits:MAX_UNITS,
      disabledByQuery})
  });
  root.__GPU_UNITS_V304__=api;
  root.NRTS?.subsystems?.register?.('gpu-units-v304',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'single WebGL2 instanced batch of distant 2D soldiers'
  });
})(window);
