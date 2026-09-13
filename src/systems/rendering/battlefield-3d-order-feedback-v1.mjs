import * as THREE from 'three';

const hook = window.__NRTS_THREE_SCENE_HOOK_V1__;
const feedback = window.RTS_ORDER_FEEDBACK;
const battlefield = window.__BATTLEFIELD_3D_V1__;

if (!hook || !feedback || !battlefield) {
  console.warn('3D order feedback skipped: required renderer bridge is not ready.');
} else {
  const MAX_TARGETS = 8;
  const REBUILD_INTERVAL_FRAMES = 12;
  const MIN_DISTANCE = Number(feedback.minVisibleDistance) || 28;
  const root = new THREE.Group();
  root.name = 'order-feedback-3d';
  root.renderOrder = 20;

  const lineMaterial = new THREE.LineDashedMaterial({
    color: 0xf4d86d,
    transparent: true,
    opacity: 0.7,
    dashSize: 18,
    gapSize: 12,
    depthTest: false,
    depthWrite: false
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4d86d,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4d86d,
    transparent: true,
    opacity: 0.34,
    depthTest: false,
    depthWrite: false
  });
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4d86d,
    transparent: true,
    opacity: 0.12,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const footprintEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0xf4d86d,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false
  });
  const ringGeometry = new THREE.RingGeometry(12, 16, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const beaconGeometry = new THREE.CylinderGeometry(1.2, 2.4, 26, 8);
  const terrainRaycaster = new THREE.Raycaster();
  const terrainRayOrigin = new THREE.Vector3();
  const terrainRayDirection = new THREE.Vector3(0, -1, 0);

  let attachedScene = null;
  let terrainObject = null;
  let frame = 0;
  let visibleTargets = 0;

  function terrainHeight(x, z) {
    const scene = hook.scene?.();
    if (!scene) return 2;
    if (!terrainObject) terrainObject = scene.getObjectByName('battlefield-terrain') || null;
    if (!terrainObject) return 2;
    terrainRayOrigin.set(x, 2000, z);
    terrainRaycaster.set(terrainRayOrigin, terrainRayDirection);
    const hit = terrainRaycaster.intersectObject(terrainObject, false)[0];
    return hit ? hit.point.y + 2.5 : 2;
  }

  function disposeTransient() {
    for (const child of [...root.children]) {
      root.remove(child);
      if (child.geometry && child.geometry !== ringGeometry && child.geometry !== beaconGeometry) child.geometry.dispose();
    }
  }

  function addFootprint(target, terrainY) {
    const width = Number(target.footprint?.width);
    const depth = Number(target.footprint?.depth);
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return;
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    const footprint = new THREE.Mesh(geometry, footprintMaterial);
    footprint.position.set(target.x, terrainY + 0.35, target.y);
    footprint.renderOrder = 18;
    footprint.userData.orderFootprint = true;
    root.add(footprint);

    const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.4, depth));
    const edges = new THREE.LineSegments(edgeGeometry, footprintEdgeMaterial);
    edges.position.set(target.x, terrainY + 0.55, target.y);
    edges.renderOrder = 19;
    edges.userData.orderFootprintEdge = true;
    root.add(edges);
  }

  function buildTarget(target, index) {
    if (!target || target.distance < MIN_DISTANCE) return;
    const fromY = terrainHeight(target.fromX, target.fromY) + 2;
    const destinationY = terrainHeight(target.x, target.y) + 2;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(target.fromX, fromY, target.fromY),
      new THREE.Vector3(target.x, destinationY, target.y)
    ]);
    const line = new THREE.Line(geometry, lineMaterial);
    line.computeLineDistances();
    line.renderOrder = 20;
    line.userData.orderTargetId = target.id ?? `loose-${index}`;
    root.add(line);

    addFootprint(target, destinationY);

    const marker = new THREE.Mesh(ringGeometry, ringMaterial.clone());
    marker.position.set(target.x, destinationY + 0.8, target.y);
    marker.renderOrder = 21;
    marker.userData.baseScale = target.kind === 'loose' ? 0.9 : 1;
    marker.userData.phase = index * 0.8;
    root.add(marker);

    const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial.clone());
    beacon.position.set(target.x, destinationY + 13, target.y);
    beacon.renderOrder = 19;
    root.add(beacon);
  }

  function prioritizedTargets() {
    return feedback.getTargets()
      .filter(target => target.distance >= MIN_DISTANCE)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_TARGETS);
  }

  function rebuild() {
    disposeTransient();
    const targets = prioritizedTargets();
    targets.forEach(buildTarget);
    visibleTargets = targets.length;
  }

  function animateMarkers(time) {
    for (const child of root.children) {
      if (!child.userData?.baseScale) continue;
      const pulse = child.userData.baseScale * (1 + Math.sin(time * 4 + child.userData.phase) * 0.12);
      child.scale.setScalar(pulse);
      if (child.material) child.material.opacity = 0.78 + Math.sin(time * 4 + child.userData.phase) * 0.12;
    }
  }

  function tick(timeMs) {
    requestAnimationFrame(tick);
    frame++;
    const scene = hook.scene?.();
    if (scene && scene !== attachedScene) {
      attachedScene = scene;
      terrainObject = null;
      attachedScene.add(root);
    }
    if (!attachedScene || !battlefield.enabled()) {
      root.visible = false;
      return;
    }
    root.visible = true;
    if (frame % REBUILD_INTERVAL_FRAMES === 1) rebuild();
    animateMarkers(timeMs / 1000);
  }

  requestAnimationFrame(tick);

  window.__BATTLEFIELD_3D_ORDER_FEEDBACK_V1__ = Object.freeze({
    version: 'battlefield-3d-order-feedback-v1',
    maxTargets: MAX_TARGETS,
    rebuildIntervalFrames: REBUILD_INTERVAL_FRAMES,
    visibleTargets: () => visibleTargets,
    group: () => root
  });
}
