const { test, expect } = require('@playwright/test');

test('trees, food plants and 3D crop scenery stay clear of road corridors', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test=3d');
  await page.waitForFunction(() => Boolean(
    window.NRTS_3D_SOURCE &&
    window.__BATTLEFIELD_ECOLOGY_V1__?.resourceRoadExclusion &&
    window.__BATTLEFIELD_3D_LANDSCAPE_V1__?.roadClearance &&
    window.__NRTS_THREE_SCENE__
  ), null, { timeout: 20000 });

  const result = await page.evaluate(() => {
    const ecology = window.__BATTLEFIELD_ECOLOGY_V1__;
    const source = window.NRTS_3D_SOURCE;
    const scene = window.__NRTS_THREE_SCENE__;
    const THREE = scene.constructor;

    const resourceConflicts = source.resources()
      .filter(resource => !resource.dead)
      .filter(resource => ecology.roadConflict(resource.type, resource.x, resource.y))
      .map(resource => ({ id: resource.id, type: resource.type, x: resource.x, y: resource.y }));

    const taggedConflicts = [];
    scene.traverse(object => {
      const radius = object.userData?.vegetationClearanceRadius;
      if (!Number.isFinite(radius) || object.isInstancedMesh) return;
      const position = object.getWorldPosition({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
      if (ecology.roadConflictAt(position.x, position.z, radius, 0)) {
        taggedConflicts.push({ name: object.name || object.type, kind: object.userData.vegetationKind, x: position.x, z: position.z, radius });
      }
    });

    const terrain = scene.getObjectByName('terrain-patches-road-cleared-v1');
    const terrainConflicts = [];
    if (terrain?.isInstancedMesh) {
      const matrix = new Float32Array(16);
      for (let i = 0; i < terrain.count; i++) {
        terrain.getMatrixAt(i, { elements: matrix });
        const x = matrix[12];
        const z = matrix[14];
        const sx = Math.hypot(matrix[0], matrix[1], matrix[2]);
        const sz = Math.hypot(matrix[8], matrix[9], matrix[10]);
        const radius = Math.hypot(sx, sz) * 0.5;
        if (ecology.roadConflictAt(x, z, radius, 0)) terrainConflicts.push({ i, x, z, radius });
      }
    }

    return {
      resourceConflicts,
      taggedConflicts,
      terrainConflicts,
      ecology: {
        roadPadding: ecology.roadPadding,
        relocatedFromRoad: ecology.relocatedFromRoad,
        resourceRoadExclusion: ecology.resourceRoadExclusion
      },
      landscape: window.__BATTLEFIELD_3D_LANDSCAPE_V1__
    };
  });

  expect(result.ecology.resourceRoadExclusion).toBe(true);
  expect(result.ecology.roadPadding).toBeGreaterThan(0);
  expect(result.landscape.roadClearance).toBe(true);
  expect(result.resourceConflicts).toEqual([]);
  expect(result.taggedConflicts).toEqual([]);
  expect(result.terrainConflicts).toEqual([]);
});
