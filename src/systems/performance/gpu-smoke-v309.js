'use strict';
// v311: translucent 2D WebGL2 overlay for pooled smoke AND the original
// musket/cannon projectile positions. No additional GPU context or simulation.
// Uses the actual combat event clock, seeded billows and integrated wind;
// game physics, flashes, hits, projectiles and mobile Canvas rendering stay put.
(function installGpuSmokeV309(root){
  if(root.__GPU_SMOKE_V309__)return;
  const game=document.getElementById('game');
  const mobile=!!root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
  const query=new URLSearchParams(location.search);
  const disabledByQuery=query.get('gpuSmoke')==='off'||query.get('gpu')==='off'||query.get('view')==='iso';
  const layer=document.createElement('canvas');
  layer.id='game-smoke-gpu';
  layer.setAttribute('aria-hidden','true');
  Object.assign(layer.style,{
    position:'fixed',inset:'0',zIndex:'2',
    pointerEvents:'none',touchAction:'none',display:'none',
    width:'100%',height:'100%'
  });
  game.insertAdjacentElement('afterend',layer);
  let gl=null,program=null,vao=null,vertexBuffer=null,instanceBuffer=null;
  let locCamera=null,locResolution=null,locDpr=null;
  let lost=false,failed=false;
  const STRIDE=9,MAX=2500;
  const instances=new Float32Array(MAX*STRIDE);
  const stats={frames:0,drawCalls:0,billows:0,lastBillows:0,
    clouds:0,shaderFailures:0,canvasFallbacks:0,clearFrames:0,
    projectileDraws:0,lastProjectiles:0,projectileFrames:0};
  function active(){return !!gl&&!mobile&&!disabledByQuery&&!lost&&!failed;}
  function updateVisibility(){layer.style.display=active()?'block':'none';}
  if(!mobile&&!disabledByQuery){
    try{
      gl=layer.getContext('webgl2',{
        alpha:true,premultipliedAlpha:false,antialias:false,
        depth:false,stencil:false,preserveDrawingBuffer:false,
        powerPreference:'high-performance'
      });
    }catch(_error){gl=null;}
  }
  updateVisibility();
  function compile(type,source){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const why=gl.getShaderInfoLog(shader)||'GPU smoke shader compilation failed';
      gl.deleteShader(shader);throw Error(why);
    }
    return shader;
  }
  function setup(){
    const v=compile(gl.VERTEX_SHADER,[
      '#version 300 es','precision highp float;',
      'layout(location=0) in vec2 corner;',
      'layout(location=1) in vec4 pose;', // world x,y + lobe half axes
      'layout(location=2) in vec4 shade;', // direction + RGB
      'layout(location=3) in float opacity;',
      'uniform vec3 cameraPose;','uniform vec2 resolution;',
      'uniform float dpr;',
      'out vec2 local;','out vec4 tint;',
      'void main(){',
      '  vec2 q=corner*2.0-1.0;',
      '  float c=cos(shade.x),s=sin(shade.x);',
      '  vec2 r=vec2(q.x*pose.z,q.y*pose.w);',
      '  vec2 spun=vec2(c*r.x-s*r.y,s*r.x+c*r.y);',
      '  vec2 pixel=resolution*.5+(pose.xy+spun-cameraPose.xy)*cameraPose.z*dpr;',
      '  gl_Position=vec4(pixel.x*2.0/resolution.x-1.0,',
      '    1.0-pixel.y*2.0/resolution.y,0.0,1.0);',
      '  local=q;','tint=vec4(shade.yzw,opacity);',
      '}'
    ].join('\n'));
    const f=compile(gl.FRAGMENT_SHADER,[
      '#version 300 es','precision highp float;',
      'in vec2 local;','in vec4 tint;',
      'out vec4 color;',
      'void main(){',
      '  float rr=length(local);',
      '  float feather=1.0-smoothstep(.64,1.0,rr);',
      '  // Opacity > 1 is a hard-centered projectile dot, not smoke.',
      '  float a=tint.a>1.5 ? 1.0-smoothstep(.76,1.0,rr) : feather*tint.a;',
      '  if(a<.001)discard;',
      '  color=vec4(tint.rgb,a);',
      '}'
    ].join('\n'));
    program=gl.createProgram();gl.attachShader(program,v);
    gl.attachShader(program,f);gl.linkProgram(program);
    gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program)||'GPU smoke link failed');
    vao=gl.createVertexArray();gl.bindVertexArray(vao);
    vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([
      0,0,1,0,0,1,0,1,1,0,1,1
    ]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    instanceBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,STRIDE*4,0);
    gl.vertexAttribDivisor(1,1);
    gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,STRIDE*4,4*4);
    gl.vertexAttribDivisor(2,1);
    gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,1,gl.FLOAT,false,STRIDE*4,8*4);
    gl.vertexAttribDivisor(3,1);
    gl.bindVertexArray(null);
    locCamera=gl.getUniformLocation(program,'cameraPose');
    locResolution=gl.getUniformLocation(program,'resolution');
    locDpr=gl.getUniformLocation(program,'dpr');
  }
  function hexToRGB(hex){
    return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  }
  function draw(events,time,helpers){
    if(!active()){stats.canvasFallbacks++;return false;}
    try{
      if(!program)setup();
      if(layer.width!==game.width||layer.height!==game.height){
        layer.width=game.width;layer.height=game.height;
      }
      layer.style.width=game.style.width||innerWidth+'px';
      layer.style.height=game.style.height||innerHeight+'px';
      gl.viewport(0,0,layer.width,layer.height);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      const zoom=Math.max(.1,camera.zoom);
      const left=camera.x-innerWidth/(2*zoom)-160;
      const right=camera.x+innerWidth/(2*zoom)+160;
      const top=camera.y-innerHeight/(2*zoom)-160;
      const bottom=camera.y+innerHeight/(2*zoom)+160;
      let count=0,clouds=0;
      function add(x,y,rx,ry,angle,hex,alpha,projectile=false){
        if(count>=MAX||alpha<=0||!Number.isFinite(x)||!Number.isFinite(y))return;
        const rgb=hexToRGB(hex);
        const i=count*STRIDE;
        instances[i]=x;instances[i+1]=y;
        instances[i+2]=rx;instances[i+3]=ry;
        instances[i+4]=angle;
        instances[i+5]=rgb[0];instances[i+6]=rgb[1];instances[i+7]=rgb[2];
        instances[i+8]=projectile?2.0:Math.min(1,Math.max(0,alpha));
        count++;
      }
      for(const e of events){
        const age=time-e.born;
        if(age<0||age>=e.life)continue;
        helpers.advanceSmoke(e);
        const p=helpers.smokeProfile(e,age),colors=helpers.smokePalette(age);
        const cannon=e.kind==='artillery',fx=Math.cos(e.facing),fy=Math.sin(e.facing);
        const px=-fy,py=fx,cx=e.x+(e.driftX||0),cy=e.y+(e.driftY||0);
        const extent=120+p.breadth+p.radius;
        if(cx+extent<left||cx-extent>right||cy+extent<top||cy-extent>bottom)continue;
        clouds++;
        add(cx+fx*p.forward,cy+fy*p.forward,
          p.breadth*1.22+p.radius*.34,p.breadth*.83+p.radius*.4,
          e.facing,colors.rim,p.opacity*(cannon?.078:.066));
        const lobes=zoom<.67?7:cannon?14:Math.min(15,9+Math.ceil((e.count||1)/7));
        const regFactor=1+Math.min(.75,Math.sqrt(e.count||1)*.1);
        for(let k=0;k<lobes;k++){
          const noise=helpers.seededOffset(e.seed^0xa511e9b3,k);
          const side=helpers.seededOffset(e.seed^0x9e3779b9,k);
          const curl=Math.sin(age*1.5+k*1.71+e.seed*.000009)*2.7;
          const along=p.forward+noise*p.breadth*.77+(k%4===0?-p.forward*.58:0);
          const lateral=side*p.breadth*.92+curl*Math.min(1,age);
          const x=cx+fx*along+px*lateral,y=cy+fy*along+py*lateral;
          const radius=p.radius*(.66+
            (helpers.seededOffset(e.seed^0x85ebca6b,k)+1)*.23)*regFactor;
          const shaded=k%4===0,edge=!shaded&&k%3===0;
          const color=shaded?colors.core:edge?colors.rim:colors.middle;
          const strength=shaded?1.06:edge?.72:.94;
          const alpha=p.opacity*(cannon?.27:.265)*strength*
            (1-Math.min(.46,k*.018));
          add(x,y,radius*(.94+.18*Math.sin(k)),radius*.8,
            e.facing+Math.sin(k*2.7+age*.32)*.35,color,alpha);
        }
        if(p.jetReach>1.1){
          const jetFade=Math.min(1,age/.045)*Math.exp(-Math.max(0,age-.13)*8);
          for(let j=0;j<4;j++){
            const fraction=(j+.45)/4,lobe=Math.max(2,(cannon?11:7)+fraction*8)*
              Math.max(.4,1-age*.65);
            add(cx+fx*p.jetReach*fraction,cy+fy*p.jetReach*fraction,
              lobe*1.8,lobe*.62,e.facing,colors.jet,(cannon?.35:.44)*jetFade);
          }
        }
        if(p.panIntensity>0&&zoom>.65){
          add(cx-fx*12+px*1.2,cy-fy*12+py*1.2,
            3.8+age*10,2.4+age*7,e.facing+.35,colors.pan,.24*p.panIntensity);
        }
      }
      // v311: the same instanced shader draws real, visible shot positions
      // after smoke billows. Canvas projectile drawing is skipped ONLY when
      // this existing transparent GPU overlay is active. Physics still owns
      // the canonical projectile array, collision and damage.
      const smokeBillows=count;
      let gpuProjectiles=0;
      if(typeof projectiles!=='undefined'){
        for(const p of projectiles){
          if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
          const r=p.artillery?3.2:1.8;
          if(p.x+r<left||p.x-r>right||p.y+r<top||p.y-r>bottom)continue;
          if(count>=MAX)break;
          add(p.x,p.y,r,r,0,p.artillery?'#202020':'#f0dfaa',1,true);
          gpuProjectiles++;
        }
      }
      stats.lastProjectiles=gpuProjectiles;
      stats.projectileDraws+=gpuProjectiles;
      if(gpuProjectiles)stats.projectileFrames++;
      if(count){
        gl.useProgram(program);gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,instances.subarray(0,count*STRIDE),gl.DYNAMIC_DRAW);
        gl.uniform3f(locCamera,camera.x,camera.y,camera.zoom);
        gl.uniform2f(locResolution,layer.width,layer.height);
        gl.uniform1f(locDpr,layer.width/Math.max(1,innerWidth));
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
        gl.disable(gl.BLEND);gl.bindVertexArray(null);
        stats.drawCalls++;stats.billows+=smokeBillows;
      }else stats.clearFrames++;
      stats.frames++;stats.clouds+=clouds;stats.lastBillows=smokeBillows;
      return true;
    }catch(_error){
      failed=true;stats.shaderFailures++;updateVisibility();
      return false;
    }finally{
      if(gl&&!lost)gl.disable(gl.BLEND);
    }
  }
  layer.addEventListener('webglcontextlost',event=>{
    event.preventDefault();lost=true;program=null;updateVisibility();
  });
  layer.addEventListener('webglcontextrestored',()=>{
    lost=false;failed=false;
    program=null;vao=null;vertexBuffer=null;instanceBuffer=null;
    updateVisibility();
  });
  // There is no second rasterized projectile layer when GPU smoke is visible.
  // On phone, WebGL errors, disabled GPU smoke or absent WebGL2, the original
  // Canvas projectile painter continues unchanged.
  const drawProjectileCanvasV311=drawProjectile;
  drawProjectile=function drawProjectileBatchedV311(p){
    if(active())return;
    return drawProjectileCanvasV311.apply(this,arguments);
  };
  root.NRTS?.events?.on?.('game:reset',()=>{
    if(active()){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
  });
  const api=Object.freeze({
    version:'311.0',twoDOnly:true,ownOverlayCanvas:true,
    projectileDotsOnSameGPUContext:true,ballisticsUnchanged:true,
    retainsWindIntegration:true,retainsCombatEvents:true,
    mobileCanvasFallback:true,active,draw,
    metrics:()=>({...stats,active:active(),mobile,disabledByQuery,
      overlays:document.querySelectorAll('#game-smoke-gpu').length,
      overlayVisible:layer.style.display!=='none'})
  });
  root.__GPU_SMOKE_V309__=api;
  root.NRTS?.subsystems?.register?.('gpu-smoke-v309',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'existing WebGL2 smoke layer batches live musket/cannon projectiles without another GL context or changing ballistics'
  });
})(window);
