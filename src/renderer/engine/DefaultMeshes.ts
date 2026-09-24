import * as THREE from 'three';

/** Creates a simple humanoid shape from primitives: body cylinder + head sphere */
export function createDefaultHumanoid(color: number = 0x886644): THREE.Group {
  const group = new THREE.Group();

  // Body (cylinder)
  const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  // Head (sphere)
  const headGeo = new THREE.SphereGeometry(0.22, 12, 8);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.6 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.4;
  head.castShadow = true;
  group.add(head);

  return group;
}
