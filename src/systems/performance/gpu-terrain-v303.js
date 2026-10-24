'use strict';
// v303: 2D-only WebGL2 terrain compositor. The 2D game still owns all
// simulation, camera, hit tests, river animation, UI and unit rendering.
// WebGL2 displays the same immutable terrain tiles with GPU texture reuse.
// Browsers without WebGL2 transparently retain the v301 Canvas2D renderer.
(function installGpuTerrainV303(root) {
  if (root.__GPU_TERRAIN_V303__) return;
  const staticCanvas = document.getElementById('game-static');
  const mainCanvas = document.getElementById('game');
  const mobile = !!root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile;
  const query = new URLSearchParams(location.search);
  const disabledByQuery = query.get('gpu') === 'off' || query.get('view') === 'iso';
  const canvas = document.createElement('canvas');
  canvas.id = 'game-terrain-gpu';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position:'fixed', inset:'0', zIndex:'0', pointerEvents:'none',
    touchAction:'none', display:'none', width:'100%', height:'100%'
  });
  (staticCanvas || mainCanvas).insertAdjacentElement('afterend', canvas);

  let gl = null, program = null, vao = null, vertexBuffer = null;
  let rectLoc = null, resolutionLoc = null, samplerLoc = null;
  let active = false, lost = false;
  const textures = new Map();
  const stats = { frames:0, draws:0, textureUploads:0, textureEvictions:0,
    textureBytes:0, contextLosses:0, fallbacks:0 };

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(shader) || 'WebGL2 shader compile failure';
      gl.deleteShader(shader);
      throw new Error(msg);
    }
    return shader;
  }

  function setup() {
    const vertex = [
      '#version 300 es',
      'in vec2 aPosition;',
      'uniform vec4 uRect;',
      'uniform vec2 uResolution;',
      'out vec2 vUv;',
      'void main() {',
      '  vec2 pixel = uRect.xy + aPosition * uRect.zw;',
      '  gl_Position = vec4(pixel.x * 2.0 / uResolution.x - 1.0,',
      '    1.0 - pixel.y * 2.0 / uResolution.y, 0.0, 1.0);',
      '  vUv = vec2(aPosition.x, 1.0 - aPosition.y);',
      '}'
    ].join('\n');
    const fragment = [
      '#version 300 es',
      'precision mediump float;',
      'in vec2 vUv;',
      'uniform sampler2D uTexture;',
      'out vec4 outColor;',
      'void main() { outColor = texture(uTexture, vUv); }'
    ].join('\n');
    const vs = compileShader(gl.VERTEX_SHADER, vertex);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragment);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'WebGL2 program link failure');
    }
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0,0, 1,0, 0,1, 0,1, 1,0, 1,1
    ]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    rectLoc = gl.getUniformLocation(program, 'uRect');
    resolutionLoc = gl.getUniformLocation(program, 'uResolution');
    samplerLoc = gl.getUniformLocation(program, 'uTexture');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  function clearTextures() {
    if (gl && !lost) for (const tile of textures.values()) gl.deleteTexture(tile.texture);
    textures.clear();
    stats.textureBytes = 0;
  }

  function updateLayers() {
    const showGpu = active && !lost && !!gl;
    canvas.style.display = showGpu ? 'block' : 'none';
    if (staticCanvas) staticCanvas.style.display = showGpu ? 'none' : 'block';
  }

  function disable() {
    if (active) stats.fallbacks++;
    active = false;
    updateLayers();
  }

  if (!mobile && !disabledByQuery) {
    try {
      gl = canvas.getContext('webgl2', {
        alpha:false, antialias:false, depth:false, stencil:false,
        premultipliedAlpha:false, preserveDrawingBuffer:false,
        powerPreference:'high-performance'
      });
      if (gl) {
        setup();
        active = true;
      }
    } catch (_error) {
      gl = null;
      active = false;
    }
  }
  updateLayers();
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    stats.contextLosses++;
    active = false;
    textures.clear();
    stats.textureBytes = 0;
    updateLayers();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (!gl) return;
    try {
      setup();
      active = !disabledByQuery && !mobile;
    } catch (_error) { active = false; }
    updateLayers();
  });

  function begin(width, height) {
    if (!active || !gl || lost) return false;
    try {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0,0,width,height);
      gl.clearColor(0.408,0.482,0.322,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(resolutionLoc, width, height);
      gl.uniform1i(samplerLoc, 0);
      stats.frames++;
      return true;
    } catch (_error) {
      disable();
      return false;
    }
  }

  function drawTile(key, source, sx, sy, sw, sh) {
    if (!active || !gl || lost) return;
    if (sw <= 0 || sh <= 0) return;
    try {
      let tile = textures.get(key);
      if (!tile) {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
          gl.UNSIGNED_BYTE, source);
        tile = { texture, bytes:source.width*source.height*4 };
        textures.set(key,tile);
        stats.textureUploads++;
        stats.textureBytes += tile.bytes;
      } else {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tile.texture);
      }
      gl.uniform4f(rectLoc, sx, sy, sw, sh);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      stats.draws++;
    } catch (_error) {
      disable();
    }
  }

  function finish() {
    if (active && gl && !lost) gl.bindVertexArray(null);
    return active && !lost;
  }

  function dropTile(key) {
    const tile = textures.get(key);
    if (!tile) return;
    if (gl && !lost) gl.deleteTexture(tile.texture);
    textures.delete(key);
    stats.textureBytes -= tile.bytes;
    stats.textureEvictions++;
  }

  function invalidate() {
    clearTextures();
  }

  const api = Object.freeze({
    version:'303.0', twoDOnly:true, noExternalDependencies:true,
    available:()=>!!gl&&!lost,
    active:()=>active&&!lost,
    begin,drawTile,finish,dropTile,invalidate,disable,
    metrics:()=>({ ...stats, active:active&&!lost, supported:!!gl&&!lost,
      textureCount:textures.size, fallbackCanvasVisible:staticCanvas?.style.display!=='none' })
  });
  root.__GPU_TERRAIN_V303__ = api;
  root.NRTS?.subsystems?.register?.('gpu-terrain-v303',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'2D-only WebGL2 texture compositor for cached terrain tiles; Canvas2D fallback'
  });
})(window);
