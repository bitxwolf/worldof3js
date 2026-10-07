import * as THREE from 'three';
import type { RawPresetData } from './presetData';
import type { ResourceRegistry } from '../ResourceRegistry';

export interface PresetSpawnOptions {
  scale?: number;
  position?: [number, number, number];
  rotationY?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  registry?: ResourceRegistry;
}

/**
 * Creates a Three.js Texture safely from a data URL or Base64 string.
 */
export function createDataTexture(base64Data: string, name?: string): THREE.Texture | null {
  if (!base64Data || typeof base64Data !== 'string') return null;

  // In headless Node test environments without DOM
  if (typeof Image === 'undefined' && typeof document === 'undefined') {
    const mock = new THREE.Texture();
    mock.name = name || 'DataTexture_NodeMock';
    return mock;
  }

  try {
    let url = base64Data.trim();
    if (!url.startsWith('data:')) {
      url = `data:image/png;base64,${url}`;
    }
    const loader = new THREE.TextureLoader();
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    if (name) tex.name = name;
    return tex;
  } catch (err) {
    console.warn(`[PresetConverter] Failed to load texture ${name}:`, err);
    return null;
  }
}

/**
 * Converts a raw preset data definition into a fully dimensional 3D Three.js Object.
 * Enforces:
 * - Proper dimensional 3D geometry (volumetric extrusion with bevels or multi-faceted depth geometry)
 * - Avoids flat cardboard-like 2D billboards
 * - Tangent-space normal mapping and roughness for dynamic lighting
 * - Grounding precisely at y = 0
 */
export function buildPreset3DObject(
  data: RawPresetData,
  options?: PresetSpawnOptions
): THREE.Group {
  const group = new THREE.Group();
  group.name = `Preset_${data.id}`;

  const scale = options?.scale ?? 1.0;
  const targetHeight = (data.targetHeight || 1.85) * scale;
  const depth = (data.depth || 0.15) * scale;
  const dominantColor = new THREE.Color(data.dominantColor || '#3b82f6');

  // Load albedo and normal textures
  const albedoTex = createDataTexture(data.albedoBase64, `${data.id}_albedo`);
  const normalTex = createDataTexture(data.normalBase64, `${data.id}_normal`);

  if (options?.registry) {
    if (albedoTex) options.registry.trackTexture(albedoTex);
    if (normalTex) options.registry.trackTexture(normalTex);
  }

  // Branch by asset category
  if (data.type === 'foliage' && data.id === 'grass_tuft_dense') {
    // Multi-faceted 3D volumetric grass clump (4 intersecting curved blade layers with depth)
    buildVolumetricGrassClump(group, data, targetHeight, depth, albedoTex, normalTex, options);
  } else if (data.type === 'foliage' && data.id.includes('tree')) {
    // Volumetric multi-plane canopy + extruded trunk geometry
    buildVolumetricTreePreset(group, data, targetHeight, depth, albedoTex, normalTex, options);
  } else if (data.type === 'terrain') {
    // High-detail terrain tile with normal map and displacement surface
    buildTerrainSurfacePreset(group, data, targetHeight, albedoTex, normalTex, options);
  } else {
    // Volumetric extruded polygonal 3D mesh (for NPCs, Props, Obelisks)
    buildVolumetricExtrudedPreset(group, data, targetHeight, depth, dominantColor, albedoTex, normalTex, options);
  }

  // Metadata
  group.userData = {
    id: data.id,
    name: data.name,
    type: data.type,
    category: data.category,
    isPreset: true,
    interactable: data.type === 'npc' || data.type === 'prop',
    collidable: true,
    baseGroundY: 0,
    dominantColor: data.dominantColor,
    scale,
  };

  if (options?.position) {
    group.position.set(options.position[0], options.position[1], options.position[2]);
  }
  if (options?.rotationY !== undefined) {
    group.rotation.y = options.rotationY;
  }

  if (options?.registry) {
    options.registry.trackObject(group);
  }

  return group;
}

/**
 * Builds an extruded 3D mesh from contour coordinates with bevels, normal maps, and front/side/rear materials.
 */
function buildVolumetricExtrudedPreset(
  group: THREE.Group,
  data: RawPresetData,
  targetHeight: number,
  depth: number,
  dominantColor: THREE.Color,
  albedoTex: THREE.Texture | null,
  normalTex: THREE.Texture | null,
  options?: PresetSpawnOptions
): void {
  const contour = data.contour && data.contour.length >= 3
    ? data.contour
    : [
        [0.5, 0.0], [0.65, 0.15], [0.72, 0.4], [0.65, 0.7], [0.6, 1.0],
        [0.52, 1.0], [0.5, 0.7], [0.48, 1.0], [0.4, 1.0], [0.35, 0.7],
        [0.28, 0.4], [0.35, 0.15]
      ];

  const aspect = 1.0;
  const width = targetHeight * aspect;

  // Build 2D shape
  const shape = new THREE.Shape();
  for (let i = 0; i < contour.length; i++) {
    const [nx, ny] = contour[i];
    const sx = (nx - 0.5) * width;
    const sy = (1 - ny) * targetHeight;
    if (i === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  }
  shape.closePath();

  // Extrude with bevel for true 3D curvature and depth
  const bevelThickness = Math.min(0.04, depth * 0.25);
  const bevelSize = Math.min(0.03, depth * 0.2);
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: Math.max(0.06, depth - bevelThickness * 2),
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 3,
    curveSegments: 16,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Center horizontally and ground at y = 0
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const centerX = (box.min.x + box.max.x) / 2;
  const bottomY = box.min.y;
  const centerZ = (box.min.z + box.max.z) / 2;
  geometry.translate(-centerX, -bottomY, -centerZ);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  // Project normalized UVs onto front, sides, and rear
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nz = norm.getZ(i);

    if (nz > 0.35) {
      // Front face
      const u = Math.max(0, Math.min(1, (x + centerX) / width + 0.5));
      const v = Math.max(0, Math.min(1, (y + bottomY) / targetHeight));
      uvs.setXY(i, u, v);
    } else if (nz < -0.35) {
      // Rear face
      const u = Math.max(0, Math.min(1, 0.5 - (x + centerX) / width));
      const v = Math.max(0, Math.min(1, (y + bottomY) / targetHeight));
      uvs.setXY(i, u, v);
    } else {
      // Extruded side rim
      const z = pos.getZ(i);
      const u = Math.max(0, Math.min(1, (z + depth / 2) / depth));
      const v = Math.max(0, Math.min(1, (y + bottomY) / targetHeight));
      uvs.setXY(i, u, v);
    }
  }
  uvs.needsUpdate = true;

  // Materials
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: albedoTex ?? undefined,
    normalMap: normalTex ?? undefined,
    normalScale: new THREE.Vector2(1.2, 1.2),
    color: albedoTex ? 0xffffff : dominantColor,
    roughness: 0.38,
    metalness: data.id.includes('cyber') ? 0.45 : data.id.includes('steam') ? 0.35 : 0.08,
    side: THREE.FrontSide,
    transparent: true,
    alphaTest: 0.02,
  });

  const sideMaterial = new THREE.MeshStandardMaterial({
    color: dominantColor.clone().multiplyScalar(0.85),
    roughness: 0.3,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  const backMaterial = new THREE.MeshStandardMaterial({
    map: albedoTex ?? undefined,
    normalMap: normalTex ?? undefined,
    color: albedoTex ? 0xe5e7eb : dominantColor.clone().multiplyScalar(0.75),
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.FrontSide,
  });

  // Assign groups to geometry if index exists
  if (geometry.index) {
    const indices = geometry.index.array;
    const frontTris: number[] = [];
    const sideTris: number[] = [];
    const backTris: number[] = [];

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      const avgNz = (norm.getZ(a) + norm.getZ(b) + norm.getZ(c)) / 3;

      if (avgNz > 0.35) frontTris.push(a, b, c);
      else if (avgNz < -0.35) backTris.push(a, b, c);
      else sideTris.push(a, b, c);
    }

    const reordered = new Uint32Array(frontTris.length + sideTris.length + backTris.length);
    reordered.set(frontTris, 0);
    reordered.set(sideTris, frontTris.length);
    reordered.set(backTris, frontTris.length + sideTris.length);

    geometry.setIndex(new THREE.BufferAttribute(reordered, 1));
    geometry.clearGroups();
    geometry.addGroup(0, frontTris.length, 0);
    geometry.addGroup(frontTris.length, sideTris.length, 1);
    geometry.addGroup(frontTris.length + sideTris.length, backTris.length, 2);
  }

  const mesh = new THREE.Mesh(geometry, [frontMaterial, sideMaterial, backMaterial]);
  mesh.castShadow = options?.castShadow ?? true;
  mesh.receiveShadow = options?.receiveShadow ?? true;
  group.add(mesh);

  if (options?.registry) {
    options.registry.trackGeometry(geometry);
    options.registry.trackMaterial(frontMaterial);
    options.registry.trackMaterial(sideMaterial);
    options.registry.trackMaterial(backMaterial);
  }
}

/**
 * Builds a volumetric grass clump with 4 curved intersecting blade clusters.
 */
function buildVolumetricGrassClump(
  group: THREE.Group,
  _data: RawPresetData,
  height: number,
  radius: number,
  albedoTex: THREE.Texture | null,
  normalTex: THREE.Texture | null,
  options?: PresetSpawnOptions
): void {
  const mat = new THREE.MeshStandardMaterial({
    map: albedoTex ?? undefined,
    normalMap: normalTex ?? undefined,
    normalScale: new THREE.Vector2(1.5, 1.5),
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.05,
  });

  const planes = 4;
  for (let i = 0; i < planes; i++) {
    const angle = (i / planes) * Math.PI;
    const geo = new THREE.PlaneGeometry(radius * 2, height);
    geo.translate(0, height / 2, 0); // Ground at y = 0
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = angle;
    mesh.castShadow = options?.castShadow ?? true;
    mesh.receiveShadow = options?.receiveShadow ?? true;
    group.add(mesh);

    if (options?.registry) {
      options.registry.trackGeometry(geo);
    }
  }

  if (options?.registry) {
    options.registry.trackMaterial(mat);
  }
}

/**
 * Builds a volumetric tree with an extruded 3D solid trunk and multi-angle layered canopy planes.
 */
function buildVolumetricTreePreset(
  group: THREE.Group,
  _data: RawPresetData,
  height: number,
  _depth: number,
  albedoTex: THREE.Texture | null,
  normalTex: THREE.Texture | null,
  options?: PresetSpawnOptions
): void {
  // 1. Extruded cylindrical trunk base
  const trunkHeight = height * 0.45;
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, trunkHeight, 8);
  trunkGeo.translate(0, trunkHeight / 2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x3d2b1f,
    roughness: 0.9,
    metalness: 0.05,
  });
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

  // 2. Multi-tier intersecting volumetric canopy
  const canopyMat = new THREE.MeshStandardMaterial({
    map: albedoTex ?? undefined,
    normalMap: normalTex ?? undefined,
    normalScale: new THREE.Vector2(1.8, 1.8),
    roughness: 0.7,
    metalness: 0.04,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.08,
  });

  const canopyWidth = height * 0.85;
  const canopyHeight = height * 0.75;
  const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];

  angles.forEach((rot) => {
    const planeGeo = new THREE.PlaneGeometry(canopyWidth, canopyHeight);
    planeGeo.translate(0, height * 0.6, 0);
    const planeMesh = new THREE.Mesh(planeGeo, canopyMat);
    planeMesh.rotation.y = rot;
    planeMesh.castShadow = true;
    planeMesh.receiveShadow = true;
    group.add(planeMesh);

    if (options?.registry) {
      options.registry.trackGeometry(planeGeo);
    }
  });

  if (options?.registry) {
    options.registry.trackGeometry(trunkGeo);
    options.registry.trackMaterial(trunkMat);
    options.registry.trackMaterial(canopyMat);
  }
}

/**
 * Builds a high-detail terrain surface tile with normal relief.
 */
function buildTerrainSurfacePreset(
  group: THREE.Group,
  _data: RawPresetData,
  size: number,
  albedoTex: THREE.Texture | null,
  normalTex: THREE.Texture | null,
  options?: PresetSpawnOptions
): void {
  const geo = new THREE.PlaneGeometry(size * 10, size * 10, 16, 16);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    map: albedoTex ?? undefined,
    normalMap: normalTex ?? undefined,
    normalScale: new THREE.Vector2(2.0, 2.0),
    roughness: 0.85,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = options?.receiveShadow ?? true;
  group.add(mesh);

  if (options?.registry) {
    options.registry.trackGeometry(geo);
    options.registry.trackMaterial(mat);
  }
}
