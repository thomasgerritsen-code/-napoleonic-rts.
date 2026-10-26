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
  const STRIDE=8,MAX_UNITS=4096;
  let program=null,vao=null,buffer=null,vertex=null;
  let uCamera=null,uResolution=null,uDpr=null;
  let failed=false,count=0,instances=new Float32Array(512*STRIDE);
  const lastMotion=new Map();
  const stats={drawCalls:0,soldiers:0,uploads:0,fallbacks:0,
    failures:0,discardedOnReset:0,animatedSoldiers:0,motionSamples:0};
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
      'layout(location=3) in vec2 gait;',
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;','out vec2 local;',
      'flat out vec3 soldier;',
      'flat out vec2 animation;',
      'void main(){',
      'local=(corner*2.0-1.0)*20.0;',
      'float c=cos(posAngle.z),s=sin(posAngle.z);',
      'vec2 turned=vec2(c*local.x-s*local.y,s*local.x+c*local.y);',
      'vec2 center=resolution*0.5;',
      'vec2 p=center+(posAngle.xy+turned-cameraPose.xy)*cameraPose.z*dpr;',
      'gl_Position=vec4(p.x*2.0/resolution.x-1.0,1.0-p.y*2.0/resolution.y,0.0,1.0);',
      'soldier=typeSideRouting;',
      'animation=gait;',
      '}'
    ].join('\n'));
    const f=compile(gl.FRAGMENT_SHADER,[
      "#version 300 es",
      "precision highp float;",
      "in vec2 local;",
      "flat in vec3 soldier;",
      "flat in vec2 animation;",
      "out vec4 outputColor;",
      "bool oval(vec2 p,vec2 c,vec2 r){return length((p-c)/r)<1.0;}",
      "bool stroke(vec2 p,vec2 a,vec2 b,float thickness){",
      "  vec2 d=b-a;",
      "  float t=clamp(dot(p-a,d)/max(dot(d,d),0.001),0.0,1.0);",
      "  return length(p-a-t*d)<thickness;",
      "}",
      "void main(){",
      "  float kind=soldier.x,enemy=soldier.y,routing=soldier.z;",
      "  vec3 coat=enemy>.5?vec3(.67,.2,.19):vec3(.145,.298,.553);",
      "  vec3 white=vec3(.91,.88,.78),ink=vec3(.13,.14,.15),skin=vec3(.79,.61,.46);",
      "  vec3 pants=enemy>.5?vec3(.7,.69,.65):vec3(.87,.85,.79);",
      "  vec3 accent=enemy>.5?vec3(.89,.79,.32):vec3(.86,.25,.23);",
      "  if(routing>.5){coat=vec3(.46);pants=vec3(.51);accent=vec3(.52);}",
      "  vec3 color=coat;",
      "  bool filled=false;",
      "  float gait=sin(animation.x)*animation.y;",
      "  if(kind>.5&&kind<1.5){",
      "    // Horse, four moving hooves, saddle, rider and sabre.",
      "    if(stroke(local,vec2(-12.,0.),vec2(-18.,-2.),1.1)){filled=true;color=ink;}",
      "    if(oval(local,vec2(-6.+gait*2.,-5.7),vec2(3.,1.4))||",
      "       oval(local,vec2(-6.-gait*2.,5.7),vec2(3.,1.4))||",
      "       oval(local,vec2(5.-gait*2.,-5.5),vec2(3.,1.4))||",
      "       oval(local,vec2(5.+gait*2.,5.5),vec2(3.,1.4))){filled=true;color=ink;}",
      "    if(oval(local,vec2(-1.,0.),vec2(12.,5.5))||",
      "       oval(local,vec2(9.,0.),vec2(6.,3.5))){filled=true;color=vec3(.34,.25,.2);}",
      "    if(oval(local,vec2(-1.,0.),vec2(5.3,4.2))){filled=true;color=vec3(.44,.24,.19);}",
      "    if(oval(local,vec2(0.,0.),vec2(4.3,3.7))){filled=true;color=coat;}",
      "    if(stroke(local,vec2(-3.,-3.),vec2(3.,3.),.6)){filled=true;color=white;}",
      "    if(oval(local,vec2(2.,0.),vec2(2.5,2.7))){filled=true;color=skin;}",
      "    if(oval(local,vec2(3.,0.),vec2(2.,2.4))){filled=true;color=ink;}",
      "    if(oval(local,vec2(4.3,-1.6),vec2(1.1,1.1))){filled=true;color=accent;}",
      "    if(stroke(local,vec2(-1.5,-5.8),vec2(9.,-6.),.65)){filled=true;color=white;}",
      "  }else{",
      "    bool officer=kind>1.5&&kind<2.5;",
      "    bool drummer=kind>2.5&&kind<3.5;",
      "    bool worker=kind>3.5;",
      "    if(worker){coat=vec3(.47,.40,.3);pants=vec3(.61,.56,.48);accent=vec3(.43,.35,.28);}",
      "    if(oval(local,vec2(-5.4+gait*1.6,-3.),vec2(2.6,1.4))||",
      "       oval(local,vec2(-5.4-gait*1.6,3.),vec2(2.6,1.4))){filled=true;color=ink;}",
      "    if(oval(local,vec2(-3.+gait*.6,-2.5),vec2(2.8,1.65))||",
      "       oval(local,vec2(-3.-gait*.6,2.5),vec2(2.8,1.65))){filled=true;color=pants;}",
      "    if(oval(local,vec2(0.),vec2(5.25,5.65))){filled=true;color=coat;}",
      "    if(oval(local,vec2(-4.,0.),vec2(1.7,3.1))){filled=true;color=accent;}",
      "    if(oval(local,vec2(.2,-5.),vec2(3.15,1.5))||",
      "       oval(local,vec2(.2,5.),vec2(3.15,1.5))){filled=true;color=coat;}",
      "    if(stroke(local,vec2(-3.4,-3.7),vec2(3.4,3.7),.52)||",
      "       stroke(local,vec2(-3.4,3.7),vec2(3.4,-3.7),.52)){filled=true;color=white;}",
      "    if(oval(local,vec2(2.1,0.),vec2(2.9,3.))){filled=true;color=skin;}",
      "    if(oval(local,vec2(3.05,0.),vec2(2.55,3.3))){filled=true;color=ink;}",
      "    if(oval(local,vec2(4.7,-1.8),vec2(1.1))){filled=true;color=officer?white:accent;}",
      "    if(!officer&&!drummer&&!worker){",
      "      if(stroke(local,vec2(-4.5,5.8),vec2(10.5,5.8),.85)){filled=true;color=vec3(.30,.21,.13);}",
      "      if(stroke(local,vec2(5.,5.8),vec2(12.,5.8),.38)){filled=true;color=white;}",
      "    }",
      "    if(officer&&stroke(local,vec2(-1.5,-6.),vec2(10.,-6.),.65)){filled=true;color=white;}",
      "    if(drummer&&oval(local,vec2(-1.,5.5),vec2(4.3,2.6))){filled=true;color=vec3(.78,.61,.29);}",
      "    if(worker&&stroke(local,vec2(-1.,-6.),vec2(8.,-7.),.85)){filled=true;color=ink;}",
      "  }",
      "  if(!filled)discard;",
      "  outputColor=vec4(color,1.);",
      "}"
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
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3,2,gl.FLOAT,false,STRIDE*4,6*4);
    gl.vertexAttribDivisor(3,1);
    gl.bindVertexArray(null);
    uCamera=gl.getUniformLocation(program,'cameraPose');
    uResolution=gl.getUniformLocation(program,'resolution');
    uDpr=gl.getUniformLocation(program,'dpr');
  }
  function active(){return !disabledByQuery&&!failed&&!!gl&&!!terrain?.active?.();}
  function enqueue(unit){
    // Existing large-army code owns density LOD, culling, selection and
    // marching simulation. This function only replaces its distant draw.
    if(!active()||!unit||unit.dead||unit.type==='artillery'||root.__CHARGE_STUMBLE_V1__?.down(unit)||root.__MELEE_REALISM_V1__?.reacting(unit)||
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
    // Only real physical displacement advances the leg movement. A regiment
    // blocked before a bridge must stand, not march on the spot.
    // Read physical visual displacement over real rendered-frame time.
    // At 120 Hz multiple draws can share one simulation tick, so elapsed
    // would produce zero dt and make gait snap between moving and standing.
    const clock=root.__NRTS_RENDER_CLOCK_V312__;
    const now=clock ? clock.wallTime : (Number(elapsed)||0);
    const prev=lastMotion.get(unit.id);
    let gait=0;
    if(prev && now>prev.time && now-prev.time<.8){
      const dt=now-prev.time;
      const displacement=Math.hypot(unit.x-prev.x,unit.y-prev.y);
      const speed=displacement/dt;
      const target=speed>1.5 && speed<250 && displacement<30
        ? Math.min(1,speed/75) : 0;
      // Smooth gait intensity across irregular browser frames; stopping
      // soldiers ease to standing without feet flickering on/off.
      gait=(prev.gait||0)+(target-(prev.gait||0))*Math.min(1,dt*16);
      stats.motionSamples++;
    }
    lastMotion.set(unit.id,{x:unit.x,y:unit.y,time:now,gait});
    const phaseTime=clock ? clock.simulationTime : (Number(elapsed)||0);
    instances[i+6]=(phaseTime*1.85+(unit.id%11)*.37)*6.2831853;
    instances[i+7]=gait;
    if(gait>0.05)stats.animatedSoldiers++;
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
    stats.discardedOnReset+=count;count=0;lastMotion.clear();
  });
  const api=Object.freeze({
    version:'305.0',desktopOnly:true,lowZoomOnly:true,
    enhancedUniforms:true,actualMovementGait:true,
    no3D:true,artilleryUnchanged:true,active,enqueue,flush,
    metrics:()=>({...stats,active:active(),queued:count,maxUnits:MAX_UNITS,
      disabledByQuery})
  });
  root.__GPU_UNITS_V304__=api;
  root.NRTS?.subsystems?.register?.('gpu-units-v304',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'single WebGL2 instanced batch of detailed distant 2D soldiers with displacement-driven gait'
  });
})(window);
