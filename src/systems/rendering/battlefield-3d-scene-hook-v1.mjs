import * as THREE from 'three';

// Capture the battlefield Three.js scene/camera without coupling renderer internals to companion scenery modules.
if (!window.__NRTS_THREE_SCENE_HOOK_V1__) {
  let activeScene = null;
  let activeCamera = null;
  const originalAdd = THREE.Scene.prototype.add;
  const originalRender = THREE.WebGLRenderer.prototype.render;

  function rememberScene(scene) {
    if (!scene?.isScene) return;
    activeScene = scene;
    // Compatibility contract used by the existing village/scenery companion modules.
    window.__NRTS_THREE_SCENE__ = scene;
  }

  THREE.Scene.prototype.add = function patchedSceneAdd(...objects) {
    rememberScene(this);
    return originalAdd.apply(this, objects);
  };

  THREE.WebGLRenderer.prototype.render = function patchedRendererRender(scene, camera) {
    rememberScene(scene);
    if (camera?.isCamera) activeCamera = camera;
    return originalRender.call(this, scene, camera);
  };

  window.__NRTS_THREE_SCENE_HOOK_V1__ = Object.freeze({
    version: 'battlefield-3d-scene-hook-v1',
    installed: true,
    scene: () => activeScene,
    camera: () => activeCamera
  });
}

// GRAPHICS-V2: install the non-authoritative Three.js look layer and the lightweight
// Pixi mode loader. PixiJS itself is still fetched lazily only after the player opts in.
import('./battlefield-3d-look-v2.mjs?build=look2').catch(error => {
  console.warn('Graphics V2 look layer failed to install', error);
});

import('./pixi-battlefield-v1.mjs?build=pixi1').catch(error => {
  console.warn('Pixi V2 loader failed to install', error);
});
