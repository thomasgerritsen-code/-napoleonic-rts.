'use strict';
// v305: physically sampled gait + recognizable Napoleonic silhouettes in the
// same single WebGL2 instanced 2D soldier batch on the v303 terrain
// context. Units and camera remain simulation-owned. Close-up, selected,
// artillery and mobile soldiers preserve their existing Canvas2D render path.
(function installGpuUnitsV304(root){
  if(root.__GPU_UNITS_V304__)return;
  const terrain=root.__GPU_TERRAIN_V303__;
  const canvas=document.getElementById('game-terrain-gpu');
  const disabledByQuery=new URLSearchParams(location.search).get('gpuUnits')==='off';
  const gl=terrain?.available?.()&&canvas?.getContext('webgl2');
  const STRIDE=8,MAX_UNITS=4096;
  const motion=new Map();
  const MAX_MOTION_SAMPLES=8192;
  let program=null,vao=null,buffer=null,vertex=null;
  let uCamera=null,uResolution=null,uDpr=null;
  let failed=false,count=0,instances=new Float32Array(512*STRIDE);
  const stats={drawCalls:0,soldiers:0,uploads:0,fallbacks:0,
    failures:0,discardedOnReset:0,walking:0,halted:0,
    motionSamples:0,ignoredTeleports:0};
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
      'layout(location=3) in vec2 phaseMoving;',
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;','out vec2 local;',
      'flat out vec3 soldier;',
      'out vec2 movement;',
      'void main(){',
      'local=(corner*2.0-1.0)*20.0;',
      'float c=cos(posAngle.z),s=sin(posAngle.z);',
      'vec2 turned=vec2(c*local.x-s*local.y,s*local.x+c*local.y);',
      'vec2 center=resolution*0.5;',
      'vec2 p=center+(posAngle.xy+turned-cameraPose.xy)*cameraPose.z*dpr;',
      'gl_Position=vec4(p.x*2.0/resolution.x-1.0,1.0-p.y*2.0/resolution.y,0.0,1.0);',
      'soldier=typeSideRouting;',
      'movement=phaseMoving;',
      '}'
    ].join('\n'));
    const f=compile(gl.FRAGMENT_SHADER,[
      '#version 300 es','precision highp float;',
      'in vec2 local;','flat in vec3 soldier;','in vec2 movement;',
      'out vec4 outputColor;',
      'float oval(vec2 p,vec2 xy,vec2 radius){',
      '  return length((p-xy)/radius);',
      '}',
      'void main(){',
      '  float kind=soldier.x,enemy=soldier.y,routing=soldier.z;',
      '  vec3 coat=enemy>.5?vec3(.663,.204,.188):vec3(.145,.298,.553);',
      '  vec3 turnback=enemy>.5?vec3(.91,.86,.77):vec3(.76,.24,.20);',
      '  vec3 trousers=enemy>.5?vec3(.70,.68,.62):vec3(.87,.85,.79);',
      '  vec3 plume=enemy>.5?vec3(.91,.82,.36):vec3(.83,.24,.22);',
      '  if(routing>.5){coat=vec3(.46);turnback=vec3(.54);plume=vec3(.53);}',
      '  vec3 ink=vec3(.13,.13,.13),skin=vec3(.78,.61,.47);',
      '  vec3 belt=vec3(.93,.90,.82),metal=vec3(.69,.67,.60);',
      '  vec3 color=coat;',
      '  float kick=sin(movement.x)*movement.y*1.7;',
      '  bool valid=false;',
      '  if(kind<.5||kind>=1.5){',
      '    float scale=kind>=3.5?.95:(kind>=1.5&&kind<2.5?1.08:1.0);',
      '    if(oval(local,vec2((-4.5+kick)*scale,-2.55*scale),vec2(2.2,1.35)*scale)<1.0',
      '       || oval(local,vec2((-4.5-kick)*scale,2.55*scale),vec2(2.2,1.35)*scale)<1.0){',
      '      valid=true;color=ink;',
      '    }',
      '    if(oval(local,vec2((-2.9+kick*.4)*scale,-2.4*scale),vec2(2.5,1.6)*scale)<1.0',
      '       || oval(local,vec2((-2.9-kick*.4)*scale,2.4*scale),vec2(2.5,1.6)*scale)<1.0){',
      '      valid=true;color=trousers;',
      '    }',
      '    if(oval(local,vec2(0),vec2(5.25,5.7)*scale)<1.0){',
      '      valid=true;color=coat;',
      '      if(local.x < -3.0*scale)color=turnback;',
      '      // Crossed white shoulder belts, like the close-up Canvas uniforms.',
      '      if(abs(local.x-local.y*.85)<.58*scale||abs(local.x+local.y*.85)<.58*scale)color=belt;',
      '    }',
      '    if(oval(local,vec2(1,-5)*scale,vec2(3,1.4)*scale)<1.0',
      '       || oval(local,vec2(1,5)*scale,vec2(3,1.4)*scale)<1.0){valid=true;color=coat;}',
      '    if(oval(local,vec2(2.15,0)*scale,vec2(2.85)*scale)<1.0){valid=true;color=skin;}',
      '    if(oval(local,vec2(3.05,0)*scale,vec2(2.6,3.35)*scale)<1.0){valid=true;color=ink;}',
      '    if(oval(local,vec2(4.75,-1.7)*scale,vec2(1.2)*scale)<1.0){valid=true;color=plume;}',
      '    if(kind<.5){',
      '      if(local.x>-4.5&&local.x<10.0&&abs(local.y-6.0)<.85){valid=true;color=ink;}',
      '      if(local.x>5.0&&local.x<10.0&&abs(local.y-6.0)<.45){valid=true;color=metal;}',
      '    }else if(kind<2.5){',
      '      if(local.x>-2.0&&local.x<8.0&&abs(local.y+5.8)<.60){valid=true;color=metal;}',
      '    }else if(kind<3.5){',
      '      if(oval(local,vec2(-.6,5.35),vec2(4.3,2.55))<1.0){',
      '        valid=true;color=vec3(.72,.47,.25);',
      '      }',
      '    }else{',
      '      if(local.x>2.0&&local.x<8.0&&abs(local.y+5.3)<.7){',
      '        valid=true;color=vec3(.36,.25,.17);',
      '      }',
      '    }',
      '  }else{',
      '    // Horse, hooves, saddle and mounted uniform stay distinct from infantry.',
      '    if(oval(local,vec2(-1,0),vec2(12.4,5.8))<1.0',
      '       || oval(local,vec2(8.8,0),vec2(6,3.6))<1.0){',
      '      valid=true;color=vec3(.34,.26,.20);',
      '    }',
      '    if(oval(local,vec2(-6.5+kick,-5),vec2(2.8,1.3))<1.0',
      '       || oval(local,vec2(-6.5-kick,5),vec2(2.8,1.3))<1.0',
      '       || oval(local,vec2(4.8-kick,-5),vec2(2.8,1.3))<1.0',
      '       || oval(local,vec2(4.8+kick,5),vec2(2.8,1.3))<1.0){',
      '      valid=true;color=ink;',
      '    }',
      '    if(oval(local,vec2(0,0),vec2(4.4,3.55))<1.0){valid=true;color=coat;}',
      '    if(oval(local,vec2(2,0),vec2(2.2))<1.0){valid=true;color=skin;}',
      '    if(oval(local,vec2(3,0),vec2(2,2.6))<1.0){valid=true;color=ink;}',
      '    if(oval(local,vec2(4.2,-1.0),vec2(.9))<1.0){valid=true;color=plume;}',
      '  }',
      '  if(!valid)discard;',
      '  outputColor=vec4(color,1.0);',
      '}'
    ].join('\\n'));
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
  // Only genuine displacement can start a gait. A column stopped at a bridge
  // is motionless even if its target is far away. Reset-safe and teleport-safe.
  function sampleGait(unit){
    const now=Number.isFinite(elapsed)?elapsed:0;
    let previous=motion.get(unit.id);
    if(!previous || now<previous.t || now-previous.t>1.5){
      previous={x:unit.x,y:unit.y,t:now,phase:((unit.id||0)%11)*.57,moving:0};
      motion.set(unit.id,previous);
      return previous;
    }
    const dt=now-previous.t;
    if(dt>=.015){
      const shift=Math.hypot(unit.x-previous.x,unit.y-previous.y);
      // Ignore teleports (spawn/reset/reposition), do not animate ghost marches.
      if(shift>40){previous.moving=0;stats.ignoredTeleports++;}
      else if(shift>.15){
        previous.phase+=Math.min(shift,20)*.5;
        previous.moving=1;
      }else previous.moving=0;
      previous.x=unit.x;previous.y=unit.y;previous.t=now;
      stats.motionSamples++;
    }
    return previous;
  }

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
    const gait=sampleGait(unit);
    instances[i+6]=gait.phase;
    instances[i+7]=gait.moving;
    if(gait.moving)stats.walking++;
    else stats.halted++;
    if(motion.size>MAX_MOTION_SAMPLES){
      // Oldest sampled soldiers leave the view when the camera pans away.
      const oldest=motion.keys().next().value;
      motion.delete(oldest);
    }
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
    stats.discardedOnReset+=count;count=0;motion.clear();
  });
  const api=Object.freeze({
    version:'305.0',desktopOnly:true,lowZoomOnly:true,
    actualDisplacementGait:true,uniformDetails:true,
    no3D:true,artilleryUnchanged:true,active,enqueue,flush,
    metrics:()=>({...stats,active:active(),queued:count,maxUnits:MAX_UNITS,
      disabledByQuery,motionTracked:motion.size})
  });
  root.__GPU_UNITS_V304__=api;
  root.NRTS?.subsystems?.register?.('gpu-units-v304',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'single WebGL2 instanced batch of distant 2D soldiers'
  });
})(window);
