import * as THREE from './vendor/three.module.js';

// Scenery culling. An instanced batch that carpets the whole arena is always "in view" as a
// single object, so every instance reaches the GPU even when it is behind the camera. These
// helpers split a batch into floor patches with their own bounds: three.js then skips the
// patches outside the view, and cullDecor skips the ones the fog has already hidden.
const center = new THREE.Vector3();
const patches = new Set();

function watch(mesh, pad) {
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += pad;
  mesh.frustumCulled = true;
  patches.add(mesh);
}

// Replaces a static InstancedMesh with a Group of per-patch InstancedMeshes. `cell` is the patch
// size in the batch's own units and `pad` covers vertex-shader sway. The group stands in for the
// batch: it keeps its transform and visibility, and setFraction(0..1) thins every patch evenly.
export function chunkInstances(mesh, { cell = 28, pad = 1 } = {}) {
  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor?.array;
  const buckets = new Map();
  for (let i = 0; i < mesh.count; i++) {
    const key = Math.floor(matrices[i * 16 + 12] / cell) + ':' + Math.floor(matrices[i * 16 + 14] / cell);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push(i);
  }
  const group = new THREE.Group();
  group.name = mesh.name;
  group.position.copy(mesh.position);
  group.quaternion.copy(mesh.quaternion);
  group.scale.copy(mesh.scale);
  group.visible = mesh.visible;
  for (const bucket of buckets.values()) {
    const patch = new THREE.InstancedMesh(mesh.geometry, mesh.material, bucket.length);
    bucket.forEach((source, index) => {
      patch.instanceMatrix.array.set(matrices.subarray(source * 16, source * 16 + 16), index * 16);
    });
    if (colors) {
      patch.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bucket.length * 3), 3);
      bucket.forEach((source, index) => patch.instanceColor.array.set(colors.subarray(source * 3, source * 3 + 3), index * 3));
    }
    patch.castShadow = mesh.castShadow;
    patch.receiveShadow = mesh.receiveShadow;
    patch.userData.instances = bucket.length;
    watch(patch, pad);
    group.add(patch);
  }
  group.total = mesh.count;
  group.setFraction = fraction => {
    for (const patch of group.children) patch.count = Math.ceil(patch.userData.instances * fraction);
  };
  mesh.parent?.add(group);
  mesh.removeFromParent();
  mesh.dispose();
  return group;
}

// A batch whose instances travel (blood cells in a river): fixed patches with explicit bounds
// that the caller refills each frame through begin / push / end.
export function flowPatches(parent, geometry, material, bounds, capacity) {
  const list = bounds.map(sphere => {
    const patch = new THREE.InstancedMesh(geometry, material, capacity);
    patch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    patch.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    patch.instanceColor.setUsage(THREE.DynamicDrawUsage);
    patch.boundingSphere = sphere.clone();
    patch.count = 0;
    patches.add(patch);
    parent.add(patch);
    return patch;
  });
  return {
    patches: list,
    begin() {
      for (const patch of list) patch.count = 0;
    },
    push(index, matrix, color) {
      const patch = list[index];
      if (patch.count >= capacity) return;
      matrix.toArray(patch.instanceMatrix.array, patch.count * 16);
      color.toArray(patch.instanceColor.array, patch.count * 3);
      patch.count++;
    },
    end() {
      for (const patch of list) {
        for (const attribute of [patch.instanceMatrix, patch.instanceColor]) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, patch.count * attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
    },
  };
}

// Hides patches that lie wholly beyond the distance at which exponential fog leaves less than
// one percent of their colour. Patches in a hidden branch of the scene are simply not drawn.
export function cullDecor(camera, fog) {
  const reach = fog?.density > 0 ? Math.sqrt(-Math.log(.01)) / fog.density : Infinity;
  for (const patch of patches) {
    if (!patch.parent) continue;
    center.copy(patch.boundingSphere.center).applyMatrix4(patch.matrixWorld);
    const radius = patch.boundingSphere.radius * patch.matrixWorld.getMaxScaleOnAxis();
    patch.visible = center.distanceTo(camera.position) - radius < reach;
  }
}
