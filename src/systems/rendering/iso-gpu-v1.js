'use strict';
// GPU sprite runs share the existing painter's order. Procedural drawing and
// clipped trench/construction sprites retain Canvas2D, with an explicit barrier.
(function installIsoGpu(root) {
  const params = new URLSearchParams(location.search);
  if (params.get('view') !== 'iso') return;
  const surface = document.createElement('canvas');
  const mobile = matchMedia('(pointer:coarse)').matches;
  const budget = (mobile ? 48 : 96) * 2 ** 20;
  const TILE = 512, STORAGE = TILE + 2, LAYER_BYTES = STORAGE * STORAGE * 4;
  const layerCount = Math.floor(budget / LAYER_BYTES);
  const textures = new Map(), sourceIds = new WeakMap();
  const stats = { frames: 0, draws: 0, sprites: 0, composites: 0, uploads: 0, evictions: 0,
    bytes: 0, contextLosses: 0, fallbacks: 0, lastError: null, software: false };
  let gl, program, buffer, vao, resolution, sampler, target, arrayTexture = null;
  let freeLayers = [];
  let nextSourceId = 1, lost = false, failed = false, enabled = params.get('gpu') !== 'off';
  let width = 0, height = 0, dpr = 1, frame = 0, uploaded = 0, uploadBytes = 0;
  let pending = [], bounds = null, running = false;
  const vertices = new Float32Array(6 * 6 * 2048);

  function shader(type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const why = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw Error(why);
    }
    return sh;
  }
  function setup() {
    const vs = shader(gl.VERTEX_SHADER, `#version 300 es
      in vec2 position; in vec3 uv; in float opacity;
      uniform vec2 resolution; out vec3 vUv; out float vOpacity;
      void main(){gl_Position=vec4(position.x*2.0/resolution.x-1.0,
        1.0-position.y*2.0/resolution.y,0.0,1.0);vUv=uv;vOpacity=opacity;}`);
    const fs = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision mediump float; in vec3 vUv; in float vOpacity;
      uniform highp sampler2DArray image; out vec4 color;
      void main(){color=texture(image,vUv)*vOpacity;}`);
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of [['position', 2, 0], ['uv', 3, 8], ['opacity', 1, 20]]) {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 24, offset);
    }
    resolution = gl.getUniformLocation(program, 'resolution'); sampler = gl.getUniformLocation(program, 'image');
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }
  if (enabled) try {
    gl = surface.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
      stats.software = /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer/i.test(renderer);
      // WebGL can itself run on the CPU when hardware acceleration is disabled.
      // Do not make those computers slower; explicit gpu=on is for diagnostics.
      if (stats.software && params.get('gpu') !== 'on') enabled = false;
      if (enabled) setup();
    }
  } catch (error) { failed = true; stats.lastError = error.message; }
  const active = () => enabled && !!gl && !lost && !failed;
  function drop(key, entry) {
    freeLayers.push(entry.layer);
    textures.delete(key); stats.bytes -= entry.bytes; stats.evictions++;
  }
  function clear() {
    if (arrayTexture && !lost) gl.deleteTexture(arrayTexture);
    arrayTexture = null; freeLayers = []; textures.clear(); stats.bytes = 0;
    pending = []; bounds = null; running = false;
  }
  surface.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true; stats.contextLosses++; clear();
  });
  surface.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (!enabled) return;
    try { setup(); failed = false; } catch (_) { failed = true; }
  });

  function beginFrame(w, h, scale, now) {
    frame++; stats.frames++; uploaded = uploadBytes = 0;
    width = w; height = h; dpr = scale;
    if (!active()) return;
    const pw = Math.round(w * scale), ph = Math.round(h * scale);
    if (surface.width !== pw || surface.height !== ph) { surface.width = pw; surface.height = ph; }
    gl.viewport(0, 0, pw, ph);
    for (const [key, entry] of textures) if (now - entry.usedAt > 20000) drop(key, entry);
  }
  function begin(ctx) { target = ctx; running = active(); return running; }

  // Large ground images and HD sheets are tiled, so the entire image never
  // needs to fit a GPU texture. Only visible regions enter the bounded LRU.
  const tileCanvas = document.createElement('canvas');
  const tileCtx = tileCanvas.getContext('2d');
  function allocateArray() {
    if (arrayTexture) return;
    arrayTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTexture);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, STORAGE, STORAGE, layerCount);
    freeLayers = Array.from({length:layerCount}, (_, i) => layerCount - i - 1);
  }
  function textureOf(image, x, y, w, h) {
    let id = sourceIds.get(image); if (!id) { id = nextSourceId++; sourceIds.set(image, id); }
    const key = `${id}:${x}:${y}:${w}:${h}`;
    let entry = textures.get(key);
    if (entry) { textures.delete(key); textures.set(key, entry); entry.usedAt = performance.now(); entry.frame = frame; return entry; }
    const bytes = LAYER_BYTES;
    if (uploaded >= 4 || uploadBytes + bytes > 8 * 2 ** 20) return null;
    for (const [oldKey, old] of textures) {
      if (stats.bytes + bytes <= budget) break;
      if (old.frame !== frame) drop(oldKey, old);
    }
    if (stats.bytes + bytes > budget) return null;
    allocateArray();
    const layer = freeLayers.pop();
    if (layer === undefined) return null;
    // One pixel of neighbouring source data prevents seams at terrain/atlas
    // tile boundaries under linear filtering. Every layer shares one binding.
    tileCanvas.width = tileCanvas.height = STORAGE;
    const px = Math.max(0,x-1), py = Math.max(0,y-1);
    const pw = Math.min(image.width,x+w+1)-px, ph = Math.min(image.height,y+h+1)-py;
    tileCtx.drawImage(image, px,py,pw,ph,px-x+1,py-y+1,pw,ph);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTexture);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0,0,layer, STORAGE,STORAGE,1, gl.RGBA,gl.UNSIGNED_BYTE,tileCanvas);
    const uploadError = gl.getError();
    if (uploadError !== gl.NO_ERROR) { freeLayers.push(layer); throw Error(`GPU texture upload ${uploadError}: ${w}x${h} from ${image.width}x${image.height} at ${x},${y}`); }
    entry = { layer, bytes, frame, usedAt: performance.now() }; textures.set(key, entry);
    uploaded++; uploadBytes += bytes; stats.uploads++; stats.bytes += bytes;
    return entry;
  }
  function draw(ctx, image, ...args) {
    if (!running || !active()) return false;
    let sx = 0, sy = 0, sw = image.width, sh = image.height, dx, dy, dw, dh;
    if (args.length === 4) [dx, dy, dw, dh] = args;
    else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    else { flush(); return false; }
    if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0 || sx < 0 || sy < 0 || sx + sw > image.width + .01 || sy + sh > image.height + .01) { flush(); return false; }
    // Crop to the viewport before preparing textures, including giant ground sheets.
    const left = Math.max(dx, 0), top = Math.max(dy, 0), right = Math.min(dx + dw, width), bottom = Math.min(dy + dh, height);
    if (left >= right || top >= bottom) return true;
    sx += (left - dx) * sw / dw; sy += (top - dy) * sh / dh;
    sw *= (right - left) / dw; sh *= (bottom - top) / dh;
    dx = left; dy = top; dw = right - left; dh = bottom - top;
    const size = TILE;
    const endX = Math.min(image.width, sx + sw), endY = Math.min(image.height, sy + sh);
    const pieces = [];
    try {
      for (let ty = Math.floor(sy / size) * size; ty < endY; ty += size) for (let tx = Math.floor(sx / size) * size; tx < endX; tx += size) {
        const tw = Math.min(size, image.width - tx), th = Math.min(size, image.height - ty);
        const entry = textureOf(image, tx, ty, tw, th);
        if (!entry) { flush(); stats.fallbacks++; return false; }
        const x0 = Math.max(sx, tx), y0 = Math.max(sy, ty), x1 = Math.min(endX, tx + tw), y1 = Math.min(endY, ty + th);
        pieces.push({ entry, source: image, sourceRect: [x0,y0,x1-x0,y1-y0], x: dx + (x0 - sx) / sw * dw, y: dy + (y0 - sy) / sh * dh,
          w: (x1 - x0) / sw * dw, h: (y1 - y0) / sh * dh,
          u0: (x0 - tx + 1) / STORAGE, v0: (y0 - ty + 1) / STORAGE, u1: (x1 - tx + 1) / STORAGE, v1: (y1 - ty + 1) / STORAGE, a: ctx.globalAlpha });
      }
      pending.push(...pieces); stats.sprites++;
      bounds = bounds ? [Math.min(bounds[0], left), Math.min(bounds[1], top), Math.max(bounds[2], right), Math.max(bounds[3], bottom)] : [left, top, right, bottom];
      return true;
    } catch (error) { flush(); failed = true; stats.lastError = error.message; stats.fallbacks++; clear(); return false; }
  }
  function flush() {
    if (!pending.length) return;
    // All sprites stay in CPU memory until the run succeeds; a GPU failure can
    // replay the exact run on Canvas2D without missing a unit or an occluder.
    try {
      if (!active()) throw Error('GPU unavailable');
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.uniform2f(resolution, width, height); gl.uniform1i(sampler, 0); gl.activeTexture(gl.TEXTURE0);
      let cursor = 0;
      while (cursor < pending.length) {
        let count = 0;
        while (cursor < pending.length && count < 2048) {
          const p = pending[cursor++], offset = count * 36;
          vertex(offset,p.x,p.y,p.u0,p.v0,p); vertex(offset+6,p.x+p.w,p.y,p.u1,p.v0,p);
          vertex(offset+12,p.x,p.y+p.h,p.u0,p.v1,p); vertex(offset+18,p.x,p.y+p.h,p.u0,p.v1,p);
          vertex(offset+24,p.x+p.w,p.y,p.u1,p.v0,p); vertex(offset+30,p.x+p.w,p.y+p.h,p.u1,p.v1,p);
          count++;
        }
        const floats = count * 36;
        gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, floats), gl.STREAM_DRAW);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTexture); gl.drawArrays(gl.TRIANGLES, 0, floats / 6); stats.draws++;
      }
      if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw Error('GPU draw failed');
      const [x0,y0,x1,y1] = bounds.map((v,i) => (i < 2 ? Math.floor(v*dpr) : Math.ceil(v*dpr)));
      target.save(); target.setTransform(1,0,0,1,0,0); target.globalAlpha = 1;
      target.drawImage(surface, x0,y0,x1-x0,y1-y0,x0,y0,x1-x0,y1-y0); target.restore(); stats.composites++;
    } catch (error) {
      failed = true; stats.lastError = error.message; stats.fallbacks++;
      // Each entry retains its source region solely within the current run.
      for (const p of pending) {
        target.save(); target.globalAlpha = p.a;
        target.drawImage(p.source, ...p.sourceRect, p.x,p.y,p.w,p.h); target.restore();
      }
    } finally { pending = []; bounds = null; if (failed) clear(); }
  }
  function vertex(offset,x,y,u,v,p) {
    vertices[offset]=x; vertices[offset+1]=y; vertices[offset+2]=u;
    vertices[offset+3]=v; vertices[offset+4]=p.entry.layer; vertices[offset+5]=p.a;
  }
  function end() { flush(); running = false; }
  root.__ISO_GPU_V1__ = Object.freeze({ beginFrame, begin, draw, end, clear, active,
    stats: () => ({ ...stats, active: active(), supported: !!gl, lost, textureCount: textures.size, budget,
      allocatedBytes:arrayTexture ? layerCount * LAYER_BYTES : 0, backend: active() ? 'webgl2' : 'canvas2d' }) });
  root.NRTS?.events?.on?.('game:reset', clear);
})(window);
