import * as THREE from 'three';

// Capture the battlefield Three.js scene without coupling renderer internals to companion scenery modules.
if (!window.__NRTS_THREE_SCENE_HOOK_V1__) {
  const originalAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function patchedSceneAdd(...objects) {
    if (!window.__NRTS_THREE_SCENE__) window.__NRTS_THREE_SCENE__ = this;
    return originalAdd.apply(this, objects);
  };
  window.__NRTS_THREE_SCENE_HOOK_V1__ = Object.freeze({
    version: 'battlefield-3d-scene-hook-v1',
    installed: true
  });
}
