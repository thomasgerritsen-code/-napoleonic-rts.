import * as THREE from 'three';

// Capture the battlefield Three.js scene/camera without coupling renderer internals to companion scenery modules.
if (!window.__NRTS_THREE_SCENE_HOOK_V1__) {
  let activeScene = null;
  let activeCamera = null;
  const originalAdd = THREE.Scene.prototype.add;
  const originalRender = THREE.WebGLRenderer.prototype.render;

  THREE.Scene.prototype.add = function patchedSceneAdd(...objects) {
    if (!activeScene) activeScene = this;
    return originalAdd.apply(this, objects);
  };

  THREE.WebGLRenderer.prototype.render = function patchedRendererRender(scene, camera) {
    if (scene?.isScene) activeScene = scene;
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
