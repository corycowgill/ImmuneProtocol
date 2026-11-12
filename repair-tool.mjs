import * as THREE from './vendor/three.module.js';

function bevelledBlock(width, height, length, bevel) {
  const halfWidth = width * .5 - bevel;
  const halfHeight = height * .5 - bevel;
  const face = new THREE.Shape();
  face.moveTo(-halfWidth, -halfHeight);
  face.lineTo(halfWidth, -halfHeight);
  face.lineTo(halfWidth, halfHeight);
  face.lineTo(-halfWidth, halfHeight);
  face.closePath();
  const geometry = new THREE.ExtrudeGeometry(face, {
    depth: length - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -length * .5 + bevel);
  return geometry;
}

export function createRepairTool(supportGlove) {
  const model = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x545a58, metalness: .66, roughness: .52 });
  const hardware = new THREE.MeshStandardMaterial({ color: 0xb4a997, metalness: .83, roughness: .39 });
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xb9ad94, metalness: .16, roughness: .56, clearcoat: .15, clearcoatRoughness: .41,
  });
  const grip = new THREE.MeshStandardMaterial({ color: 0x212423, roughness: .84 });
  const hose = new THREE.MeshStandardMaterial({ color: 0x294844, roughness: .59 });
  const reagent = new THREE.MeshPhysicalMaterial({
    color: 0x78ad88, emissive: 0x387457, emissiveIntensity: .42,
    clearcoat: .85, roughness: .18, metalness: .14,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9ac1a8, roughness: .16, metalness: .11, clearcoat: 1,
    transparent: true, opacity: .37, depthWrite: false,
  });
  const indicator = new THREE.MeshStandardMaterial({
    color: 0x91c8a0, emissive: 0x65ce91, emissiveIntensity: .52, roughness: .34,
  });

  function part(geometry, material, x, y, z, parent = model) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = !material.transparent;
    parent.add(mesh);
    return mesh;
  }

  function block(width, height, length, bevel, material, x, y, z) {
    return part(bevelledBlock(width, height, length, bevel), material, x, y, z);
  }

  function collar(radius, length, material, x, y, z) {
    const mesh = part(new THREE.CylinderGeometry(radius, radius, length, 20), material, x, y, z);
    mesh.rotation.x = Math.PI * .5;
    return mesh;
  }

  block(.199, .132, .281, .014, frame, 0, 0, .032);
  block(.226, .092, .236, .012, shell, 0, .027, .032);
  block(.074, .160, .084, .012, grip, .047, -.104, .104).rotation.x = -.26;
  block(.106, .013, .116, .004, grip, -.027, .079, .041);
  block(.065, .003, .025, .001, indicator, -.028, .086, .067);
  for (let i = 0; i < 3; i++) {
    block(.066, .004, .006, .001, hardware, -.028, .086, .026 - i * .014);
  }

  const steelRing = new THREE.TorusGeometry(.051, .005, 8, 30);
  for (const z of [-.11, -.289]) {
    collar(.054, .025, frame, 0, .012, z);
    part(steelRing, hardware, 0, .012, z - .011);
  }
  collar(.034, .158, reagent, 0, .012, -.201);
  collar(.044, .169, glass, 0, .012, -.201);
  for (const x of [-.068, .068]) {
    block(.036, .048, .236, .008, shell, x, .007, -.197);
    block(.017, .015, .186, .004, hardware, x, .035, -.197);
    block(.029, .032, .066, .006, frame, x * .76, -.008, -.344).rotation.y = x * 2;
  }

  collar(.038, .052, frame, 0, .012, -.325);
  collar(.027, .052, hardware, 0, .012, -.372);
  collar(.021, .042, frame, 0, .012, -.413);
  collar(.013, .007, grip, 0, .012, -.435);
  for (const x of [-.015, .015]) {
    collar(.0055, .029, hardware, x, .018, -.432);
  }
  const nozzle = new THREE.Object3D();
  nozzle.position.set(0, .012, -.446);
  model.add(nozzle);

  for (const x of [-.1, .10]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * .72, -.019, .131),
      new THREE.Vector3(x * 1.21, -.048, .086),
      new THREE.Vector3(x * 1.24, -.063, -.064),
      new THREE.Vector3(x * .91, -.026, -.264),
    ]);
    part(new THREE.TubeGeometry(path, 24, .0115, 8, false), hose, 0, 0, 0);
  }
  for (const x of [-.085, .085]) {
    for (const z of [.101, -.049]) {
      const head = part(new THREE.CylinderGeometry(.012, .013, .004, 6), hardware, x, .075, z);
      head.rotation.y = .19;
    }
  }

  const cloth = supportGlove.children[0].material;
  const up = new THREE.Vector3(0, 1, 0);
  function hold(x, y, z, mirrored, shoulder) {
    const hand = supportGlove.clone();
    hand.position.set(x, y, z);
    hand.rotation.set(mirrored ? -.48 : .11, mirrored ? -.13 : -.26, mirrored ? -.76 : .17);
    if (mirrored) hand.scale.x = -1;
    hand.traverse(mesh => {
      if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    });
    model.add(hand);
    const wrist = new THREE.Vector3(x + (mirrored ? .034 : -.026), y - .039, z + .088);
    const arm = wrist.clone().sub(shoulder);
    const center = shoulder.clone().lerp(wrist, .5);
    const sleeve = part(new THREE.CylinderGeometry(.046, .073, arm.length(), 18),
      cloth, center.x, center.y, center.z);
    sleeve.quaternion.setFromUnitVectors(up, arm.normalize());
    const cuff = part(new THREE.CylinderGeometry(.049, .053, .052, 18),
      grip, wrist.x, wrist.y, wrist.z);
    cuff.quaternion.copy(sleeve.quaternion);
  }
  hold(-.075, -.078, -.159, false, new THREE.Vector3(-.36, -.32, .35));
  hold(.078, -.114, .075, true, new THREE.Vector3(.28, -.34, .43));

  model.visible = false;
  return { model, nozzle, indicator, reagent };
}
