'use strict';
// WebGL scene layer for the iso view. The depth-sorted scene - men, horses,
// guns, trees, houses, buildings - is drawn by the graphics chip into a canvas
// of its own, a page layer between the game canvas (the ground and what lies
// on it) and the layer of shots and smoke above it. Nothing is ever copied
// back into a 2D canvas (that stall is why the older GPU sprite path stays off
// on phones): the browser lays the layers over each other.
// Sprites are cut into 512 px tiles in one array texture (a bounded LRU, as
// iso-gpu-v1). Whatever the scene still draws by hand (a blood pool, a bridge,
// a man clipped by his trench) the iso view draws into a 2D scratch canvas,
// and that region is laid in as a texture at its place in the painter's order.
// Opt in with ?gl=1 while it is brought to parity; ?gl=0 keeps it off.
(function installIsoGlScene(root) {
  const params = new URLSearchParams(location.search);
  const game = document.getElementById('game');
  if (!game || root.__ISO_GL_SCENE_V1__) return;
  const mobile = root.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile ??
    (matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) <= 700);
  let enabled = params.get('gl') === '1', paused = false;
  const TILE = 512, STORAGE = TILE + 2, LAYER_BYTES = STORAGE * STORAGE * 4;
  const budget = (mobile ? 96 : 160) * 2 ** 20, layerCount = Math.floor(budget / LAYER_BYTES);
  const MAX_UPLOADS = mobile ? 8 : 16;          // new tiles a frame (the rest wait a frame, drawn by hand)
  const stats = { frames: 0, draws: 0, sprites: 0, inserts: 0, insertPixels: 0, uploads: 0, evictions: 0,
    bytes: 0, fallbacks: 0, contextLosses: 0, lastError: null, software: false };
  const el = document.createElement('canvas');
  el.id = 'iso-gl'; el.dataset.overlay = 'iso'; el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:3;pointer-events:none;display:none';
  // The layer of shots, smoke and dust drawn after the scene, above it.
  const fx = document.createElement('canvas'), fxCtx = fx.getContext('2d');
  fx.id = 'iso-fx'; fx.dataset.overlay = 'iso'; fx.setAttribute('aria-hidden', 'true');
  fx.style.cssText = 'position:fixed;left:0;top:0;z-index:3;pointer-events:none;display:none';
  game.insertAdjacentElement('afterend', el); el.insertAdjacentElement('afterend', fx);
  // Hand drawing inside the scene goes here first (never shown).
  const scratch = document.createElement('canvas'), scratchCtx = scratch.getContext('2d');

  let gl = null, sprite = null, plain = null, arrayTexture = null, insertTexture = null, lost = false, failed = false;
  let freeLayers = [], pending = [], frame = 0, uploaded = 0, width = 0, height = 0, dpr = 1;
  const textures = new Map(), sourceIds = new WeakMap(); let nextSourceId = 1;
  const vertices = new Float32Array(6 * 6 * 2048);

  function shader(type, source) {
    const sh = gl.createShader(type); gl.shaderSource(sh, source); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const why = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw Error(why); }
    return sh;
  }
  function programOf(vsText, fsText, attributes) {
    const p = gl.createProgram(), vs = shader(gl.VERTEX_SHADER, vsText), fs = shader(gl.FRAGMENT_SHADER, fsText);
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = attributes.reduce((n, a) => n + a[1], 0) * 4; let offset = 0;
    for (const [name, size] of attributes) {
      const loc = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset); offset += size * 4;
    }
    return { p, vao, buffer, resolution: gl.getUniformLocation(p, 'resolution'), image: gl.getUniformLocation(p, 'image') };
  }
  const VS = (uv) => `#version 300 es
    in vec2 position; in ${uv} uv; in float opacity; uniform vec2 resolution; out ${uv} vUv; out float vOpacity;
    void main(){gl_Position=vec4(position.x*2.0/resolution.x-1.0,1.0-position.y*2.0/resolution.y,0.0,1.0);vUv=uv;vOpacity=opacity;}`;
  function setup() {
    sprite = programOf(VS('vec3'), `#version 300 es
      precision mediump float; in vec3 vUv; in float vOpacity; uniform highp sampler2DArray image; out vec4 color;
      void main(){color=texture(image,vUv)*vOpacity;}`, [['position', 2], ['uv', 3], ['opacity', 1]]);
    plain = programOf(VS('vec2'), `#version 300 es
      precision mediump float; in vec2 vUv; in float vOpacity; uniform sampler2D image; out vec4 color;
      void main(){color=texture(image,vUv)*vOpacity;}`, [['position', 2], ['uv', 2], ['opacity', 1]]);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    insertTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, insertTexture);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  if (enabled) try {
    gl = el.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) enabled = false;
    else {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      stats.software = /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer/i.test(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '');
      setup();
    }
  } catch (error) { failed = true; stats.lastError = error.message; }
  const active = () => enabled && !paused && !!gl && !lost && !failed;
  function clearTextures() {
    if (arrayTexture && !lost) gl.deleteTexture(arrayTexture);
    arrayTexture = null; freeLayers = []; textures.clear(); stats.bytes = 0; pending = [];
  }
  el.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stats.contextLosses++; clearTextures(); insertTexture = null; });
  el.addEventListener('webglcontextrestored', () => { lost = false; try { setup(); failed = false; } catch (error) { failed = true; stats.lastError = error.message; } });

  function sizeLayer(c, w, h, s) {
    const pw = Math.round(w * s), ph = Math.round(h * s);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const cw = `${w}px`, ch = `${h}px`;
    if (c.style.width !== cw) c.style.width = cw;
    if (c.style.height !== ch) c.style.height = ch;
  }
  // A frame: the layers sized like the game canvas and cleared.
  function beginFrame(w, h, scale, now) {
    frame++; stats.frames++; uploaded = 0; width = w; height = h; dpr = scale;
    if (!active()) return false;
    sizeLayer(el, w, h, scale); sizeLayer(fx, w, h, scale);
    if (scratch.width !== el.width || scratch.height !== el.height) { scratch.width = el.width; scratch.height = el.height; }
    gl.viewport(0, 0, el.width, el.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    for (const [key, entry] of textures) if (now - entry.usedAt > 20000) drop(key, entry);
    fxCtx.setTransform(1, 0, 0, 1, 0, 0); fxCtx.clearRect(0, 0, fx.width, fx.height); fxCtx.setTransform(scale, 0, 0, scale, 0, 0);
    scratchCtx.setTransform(scale, 0, 0, scale, 0, 0);
    return true;
  }
  function show(on) {
    const d = on ? 'block' : 'none';
    if (el.style.display !== d) el.style.display = d;
    if (fx.style.display !== d) fx.style.display = d;
  }
  function drop(key, entry) { freeLayers.push(entry.layer); textures.delete(key); stats.bytes -= entry.bytes; stats.evictions++; }
  function allocateArray() {
    if (arrayTexture) return;
    arrayTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTexture);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, STORAGE, STORAGE, layerCount);
    freeLayers = Array.from({ length: layerCount }, (_, i) => layerCount - i - 1);
  }
  const tileCanvas = document.createElement('canvas'), tileCtx = tileCanvas.getContext('2d');
  function textureOf(image, x, y, w, h) {
    let id = sourceIds.get(image); if (!id) { id = nextSourceId++; sourceIds.set(image, id); }
    const key = `${id}:${x}:${y}:${w}:${h}`;
    let entry = textures.get(key);
    if (entry) { textures.delete(key); textures.set(key, entry); entry.usedAt = performance.now(); entry.frame = frame; return entry; }
    if (uploaded >= MAX_UPLOADS) return null;
    for (const [oldKey, old] of textures) { if (stats.bytes + LAYER_BYTES <= budget) break; if (old.frame !== frame) drop(oldKey, old); }
    if (stats.bytes + LAYER_BYTES > budget) return null;
    allocateArray();
    const layer = freeLayers.pop(); if (layer === undefined) return null;
    // A pixel of the neighbouring source keeps tile seams out under linear filtering.
    tileCanvas.width = tileCanvas.height = STORAGE;
    const px = Math.max(0, x - 1), py = Math.max(0, y - 1), pw = Math.min(image.width, x + w + 1) - px, ph = Math.min(image.height, y + h + 1) - py;
    tileCtx.drawImage(image, px, py, pw, ph, px - x + 1, py - y + 1, pw, ph);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTexture);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, STORAGE, STORAGE, 1, gl.RGBA, gl.UNSIGNED_BYTE, tileCanvas);
    entry = { layer, bytes: LAYER_BYTES, frame, usedAt: performance.now() }; textures.set(key, entry);
    uploaded++; stats.uploads++; stats.bytes += LAYER_BYTES;
    return entry;
  }
  // Queue a drawImage (4 or 8 arguments after the image, css px) at this opacity.
  // False when it cannot (yet): the caller draws it by hand.
  function draw(image, args, alpha = 1) {
    if (!active()) return false;
    let sx = 0, sy = 0, sw = image.width, sh = image.height, dx, dy, dw, dh;
    if (args.length === 4) [dx, dy, dw, dh] = args;
    else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    else return false;
    if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0 || sx < 0 || sy < 0 ||
      sx + sw > image.width + .01 || sy + sh > image.height + .01) return false;
    const left = Math.max(dx, 0), top = Math.max(dy, 0), right = Math.min(dx + dw, width), bottom = Math.min(dy + dh, height);
    if (left >= right || top >= bottom) return true;
    sx += (left - dx) * sw / dw; sy += (top - dy) * sh / dh; sw *= (right - left) / dw; sh *= (bottom - top) / dh;
    dx = left; dy = top; dw = right - left; dh = bottom - top;
    const endX = Math.min(image.width, sx + sw), endY = Math.min(image.height, sy + sh), pieces = [];
    try {
      for (let ty = Math.floor(sy / TILE) * TILE; ty < endY; ty += TILE) for (let tx = Math.floor(sx / TILE) * TILE; tx < endX; tx += TILE) {
        const tw = Math.min(TILE, image.width - tx), th = Math.min(TILE, image.height - ty), entry = textureOf(image, tx, ty, tw, th);
        if (!entry) { stats.fallbacks++; return false; }
        const x0 = Math.max(sx, tx), y0 = Math.max(sy, ty), x1 = Math.min(endX, tx + tw), y1 = Math.min(endY, ty + th);
        pieces.push({ layer: entry.layer, x: dx + (x0 - sx) / sw * dw, y: dy + (y0 - sy) / sh * dh, w: (x1 - x0) / sw * dw, h: (y1 - y0) / sh * dh,
          u0: (x0 - tx + 1) / STORAGE, v0: (y0 - ty + 1) / STORAGE, u1: (x1 - tx + 1) / STORAGE, v1: (y1 - ty + 1) / STORAGE, a: alpha });
      }
    } catch (error) { failed = true; stats.lastError = error.message; return false; }
    for (const p of pieces) pending.push(p);
    stats.sprites++;
    return true;
  }
  function vertex(offset, x, y, u, v, p) {
    vertices[offset] = x; vertices[offset + 1] = y; vertices[offset + 2] = u; vertices[offset + 3] = v; vertices[offset + 4] = p.layer; vertices[offset + 5] = p.a;
  }
  function flush() {
    if (!pending.length || !active()) { pending = []; return; }
    try {
      gl.useProgram(sprite.p); gl.bindVertexArray(sprite.vao); gl.bindBuffer(gl.ARRAY_BUFFER, sprite.buffer);
      gl.uniform2f(sprite.resolution, width, height); gl.uniform1i(sprite.image, 0); gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTexture);
      let cursor = 0;
      while (cursor < pending.length) {
        let count = 0;
        while (cursor < pending.length && count < 2048) {
          const p = pending[cursor++], o = count * 36;
          vertex(o, p.x, p.y, p.u0, p.v0, p); vertex(o + 6, p.x + p.w, p.y, p.u1, p.v0, p); vertex(o + 12, p.x, p.y + p.h, p.u0, p.v1, p);
          vertex(o + 18, p.x, p.y + p.h, p.u0, p.v1, p); vertex(o + 24, p.x + p.w, p.y, p.u1, p.v0, p); vertex(o + 30, p.x + p.w, p.y + p.h, p.u1, p.v1, p);
          count++;
        }
        gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, count * 36), gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, count * 6); stats.draws++;
      }
    } catch (error) { failed = true; stats.lastError = error.message; }
    pending = [];
  }
  const quad = new Float32Array(30);
  // Lay in a region of a 2D canvas (device px, same size as this layer) where it is in the order.
  function insert(source, x0, y0, x1, y1) {
    if (!active()) return false;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(source.width, Math.ceil(x1)); y1 = Math.min(source.height, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return true;
    flush();
    const w = x1 - x0, h = y1 - y0;
    try {
      gl.bindTexture(gl.TEXTURE_2D, insertTexture);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0); gl.pixelStorei(gl.UNPACK_ROW_LENGTH, source.width);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      const s = 1 / dpr, X0 = x0 * s, Y0 = y0 * s, X1 = x1 * s, Y1 = y1 * s;
      quad.set([X0, Y0, 0, 0, 1, X1, Y0, 1, 0, 1, X0, Y1, 0, 1, 1, X0, Y1, 0, 1, 1, X1, Y0, 1, 0, 1, X1, Y1, 1, 1, 1]);
      gl.useProgram(plain.p); gl.bindVertexArray(plain.vao); gl.bindBuffer(gl.ARRAY_BUFFER, plain.buffer);
      gl.uniform2f(plain.resolution, width, height); gl.uniform1i(plain.image, 0); gl.activeTexture(gl.TEXTURE0);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, 6);
      stats.inserts++; stats.insertPixels += w * h; stats.draws++;
      return true;
    } catch (error) { failed = true; stats.lastError = error.message; return false; }
  }
  root.__ISO_GL_SCENE_V1__ = Object.freeze({
    active, beginFrame, draw, flush, insert, show, scratch, scratchCtx, fx, fxCtx, layer: el,
    // Off and on again in a running game (comparisons, a fallback switch); only where it was enabled.
    setPaused(on) { paused = !!on; },
    stats: () => ({ ...stats, active: active(), enabled, mobile, textureCount: textures.size, budget })
  });
  root.NRTS?.events?.on?.('game:reset', clearTextures);
})(window);
