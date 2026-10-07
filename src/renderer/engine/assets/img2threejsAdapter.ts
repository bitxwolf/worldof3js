import * as THREE from 'three';
import type { ResourceRegistry } from '../ResourceRegistry';
import { transport } from '../../../shared/transport';

export interface Img2ThreeOptions {
  id?: string;
  name?: string;
  depth?: number;            // extrusion depth, default 0.10 (0.08–0.12 units)
  targetHeight?: number;     // character height in world units, default 1.85
  bevelEnabled?: boolean;    // default true
  bevelThickness?: number;   // default 0.015
  bevelSize?: number;        // default 0.012
  bevelSegments?: number;    // default 2
  dominantColor?: string;    // matching rim/rear color, default '#3b82f6'
  colors?: string[];         // extracted palette
  contour?: Array<[number, number]>; // normalized [x, y] coordinates in [0, 1]
  aspectRatio?: number;      // width / height
  registry?: ResourceRegistry;
}

/**
 * Normalized default humanoid silhouette contour: [x, y] in [0, 1] range.
 * y = 0 is head top, y = 1 is feet bottom.
 */
export const DEFAULT_HUMANOID_CONTOUR: Array<[number, number]> = [
  [0.50, 0.00], // Head top
  [0.59, 0.04], // Head right
  [0.62, 0.13], // Jaw right
  [0.58, 0.18], // Neck right
  [0.72, 0.24], // Shoulder right
  [0.78, 0.38], // Arm right
  [0.70, 0.52], // Waist right
  [0.64, 0.65], // Hip right
  [0.62, 0.99], // Foot right
  [0.54, 0.99], // Inner foot right
  [0.52, 0.62], // Groin
  [0.46, 0.99], // Inner foot left
  [0.38, 0.99], // Foot left
  [0.36, 0.65], // Hip left
  [0.30, 0.52], // Waist left
  [0.22, 0.38], // Arm left
  [0.28, 0.24], // Shoulder left
  [0.42, 0.18], // Neck left
  [0.38, 0.13], // Jaw left
  [0.41, 0.04], // Head left
];

/**
 * Attempts to convert an image to 3D volumetric extruded avatar geometry via img2threejs.
 * Generates an extruded THREE.Shape with normalized UVs, multi-material configuration,
 * dynamic shadow casting, colliders, and accurate pivot grounding at y = 0.
 * Falls back gracefully to a stylized humanoid mesh if image processing fails.
 */
export async function imageToGeometry(
  imageInput: string,
  options?: Img2ThreeOptions
): Promise<THREE.Group> {
  return imageToAvatarGroup(imageInput, options);
}

/**
 * Transforms an image into a standalone production-ready ExtrudeGeometry.
 */
export async function imageToBufferGeometry(
  imageInput: string,
  options?: Img2ThreeOptions
): Promise<THREE.ExtrudeGeometry> {
  const group = await imageToAvatarGroup(imageInput, options);
  const mesh = group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined;
  if (mesh && mesh.geometry instanceof THREE.ExtrudeGeometry) {
    return mesh.geometry;
  }
  return createExtrudedAvatarGeometry(DEFAULT_HUMANOID_CONTOUR, options);
}

/**
 * Primary implementation of the volumetric extruded avatar pipeline.
 */
export async function imageToAvatarGroup(
  imageInput: string,
  options?: Img2ThreeOptions
): Promise<THREE.Group> {
  try {
    if (!imageInput || typeof imageInput !== 'string') {
      console.warn('[img2threejsAdapter] Invalid imageInput, returning fallback avatar');
      return createFallbackAvatar(options);
    }

    const cleanInput = imageInput.trim();
    let dominantColor = options?.dominantColor || options?.colors?.[0];
    let contour = options?.contour;
    let aspect = options?.aspectRatio;

    const isJpeg = cleanInput.startsWith('data:image/jpeg') || cleanInput.startsWith('/9j/');
    const mimeHint = isJpeg ? 'image/jpeg' : 'image/png';

    // 1. If contour or colors are not pre-provided, extract via IPC / backend
    if (!contour || contour.length < 3 || !dominantColor) {
      try {
        const ipcRes = await transport.processImage(cleanInput, mimeHint);
        if (ipcRes && ipcRes.success && ipcRes.data) {
          if ((!contour || contour.length < 3) && ipcRes.data.contour && ipcRes.data.contour.length >= 3) {
            contour = ipcRes.data.contour;
          }
          if (!aspect && ipcRes.data.aspectRatio) {
            aspect = ipcRes.data.aspectRatio;
          }
          if (!dominantColor && ipcRes.data.colors && ipcRes.data.colors.length > 0) {
            dominantColor = ipcRes.data.colors[0];
          }
        }
      } catch (ipcErr) {
        console.warn('[img2threejsAdapter] IPC processImage failed, checking client Canvas:', ipcErr);
      }
    }

    // 2. If still no contour, try extracting via browser Canvas
    if (!contour || contour.length < 3) {
      if (typeof document !== 'undefined') {
        const clientResult = await extractContourFromCanvas(cleanInput);
        if (clientResult) {
          contour = clientResult.contour;
          if (!aspect) aspect = clientResult.aspect;
        }
      }
    }

    // 3. Fallback to stylized humanoid contour if extraction was unavailable
    if (!contour || contour.length < 3) {
      contour = DEFAULT_HUMANOID_CONTOUR;
    }

    if (!dominantColor) {
      dominantColor = '#3b82f6';
    }

    const targetHeight = options?.targetHeight ?? 1.85;
    const finalAspect = Math.max(0.3, Math.min(1.5, aspect ?? 0.65));

    // 4. Extrude the shape
    const geometry = createExtrudedAvatarGeometry(contour, {
      ...options,
      targetHeight,
      aspectRatio: finalAspect,
    });

    // 5. Create Portrait Texture
    const texture = createTextureFromBase64(cleanInput);

    // 6. Multi-material configuration:
    // - Front face (index 0): High-res portrait texture
    // - Extruded sides (index 1): Matching stylized material using dominant extracted color and low roughness
    // - Rear backing (index 2): Matching stylized backing material
    const sideColor = new THREE.Color(dominantColor);
    const backColor = sideColor.clone().multiplyScalar(0.85);

    const frontMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: texture ? 0xffffff : sideColor,
      roughness: 0.35,
      metalness: 0.05,
      side: THREE.FrontSide,
      transparent: true,
      alphaTest: 0.01,
    });

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: 0.25, // low roughness as required
      metalness: 0.15,
      side: THREE.DoubleSide,
    });

    const backMaterial = new THREE.MeshStandardMaterial({
      color: backColor,
      roughness: 0.30,
      metalness: 0.10,
      side: THREE.FrontSide,
    });

    const materials = [frontMaterial, sideMaterial, backMaterial];

    // 7. Create mesh with shadows & colliders
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // 8. Create complete centered group
    const group = new THREE.Group();
    const npcName = options?.name || 'NPC';
    group.name = `NPC_${npcName.replace(/\s+/g, '_')}`;
    group.add(mesh);

    group.userData = {
      id: options?.id || `npc_${Date.now()}`,
      name: npcName,
      type: 'npc',
      isNPC: true,
      interactable: true,
      collidable: true,
      isCustomAvatar: true,
      baseGroundY: 0,
      dominantColor,
    };

    mesh.userData = { ...group.userData };

    // Attach convenience references
    (group as unknown as { geometry: THREE.BufferGeometry }).geometry = geometry;
    (group as unknown as { mesh: THREE.Mesh }).mesh = mesh;

    // 9. Resource registry tracking
    if (options?.registry) {
      options.registry.trackGeometry(geometry);
      options.registry.trackMaterial(frontMaterial);
      options.registry.trackMaterial(sideMaterial);
      options.registry.trackMaterial(backMaterial);
      if (texture) {
        options.registry.trackTexture(texture);
      }
    }

    return group;
  } catch (err) {
    console.warn('[img2threejsAdapter] Conversion failed, using stylized fallback:', err);
    return createFallbackAvatar(options);
  }
}

/**
 * Generates an extruded BufferGeometry from normalized contour points.
 * Automatically aligns pivot grounding precisely at y = 0,
 * and sets normalized UVs [0, 1] on front and rear faces.
 */
export function createExtrudedAvatarGeometry(
  contour: Array<[number, number]>,
  options?: Img2ThreeOptions
): THREE.ExtrudeGeometry {
  const targetHeight = options?.targetHeight ?? 1.85;
  const aspect = options?.aspectRatio ?? 0.65;
  const width = targetHeight * aspect;
  const depth = options?.depth ?? 0.10; // 0.08–0.12 units thickness

  // 1. Construct 2D THREE.Shape from normalized contour
  const shape = new THREE.Shape();
  for (let i = 0; i < contour.length; i++) {
    const [nx, ny] = contour[i];
    // In contour space: y = 0 is top, y = 1 is bottom
    // In Three.js Shape space: Y goes upwards, centered on X = 0
    const sx = (nx - 0.5) * width;
    const sy = (1 - ny) * targetHeight;
    if (i === 0) {
      shape.moveTo(sx, sy);
    } else {
      shape.lineTo(sx, sy);
    }
  }
  shape.closePath();

  // 2. Extrude geometry with subtle bevels
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: options?.bevelEnabled ?? true,
    bevelThickness: options?.bevelThickness ?? 0.015,
    bevelSize: options?.bevelSize ?? 0.012,
    bevelSegments: options?.bevelSegments ?? 2,
    curveSegments: 16,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // 3. Precise pivot grounding:
  // - Ground bottom at y = 0
  // - Center horizontally at x = 0
  // - Center thickness at z = 0
  geometry.computeBoundingBox();
  const rawBox = geometry.boundingBox!;
  const centerZ = (rawBox.min.z + rawBox.max.z) / 2;
  const centerX = (rawBox.min.x + rawBox.max.x) / 2;
  const bottomY = rawBox.min.y;

  geometry.translate(-centerX, -bottomY, -centerZ);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  // 4. Normalized UV Mapping ([0, 1] projection)
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nz = norm.getZ(i);

    if (nz > 0.35) {
      // Front face & front bevel: direct [0, 1] projection mapping 1:1 with source artwork coordinates
      const u = Math.max(0, Math.min(1, (x + centerX) / width + 0.5));
      const v = Math.max(0, Math.min(1, (y + bottomY) / targetHeight));
      uvs.setXY(i, u, v);
    } else if (nz < -0.35) {
      // Rear face & rear bevel: horizontally mirrored [0, 1] projection matching source artwork
      const u = Math.max(0, Math.min(1, 0.5 - (x + centerX) / width));
      const v = Math.max(0, Math.min(1, (y + bottomY) / targetHeight));
      uvs.setXY(i, u, v);
    } else {
      // Extruded side/rim faces
      const z = pos.getZ(i);
      const spanZ = depth || 0.1;
      const u = Math.max(0, Math.min(1, (z + depth / 2) / spanZ));
      const v = Math.max(0, Math.min(1, (y + bottomY) / targetHeight));
      uvs.setXY(i, u, v);
    }
  }
  uvs.needsUpdate = true;

  // 5. Partition triangle groups into:
  // Group 0: Front face (nz > 0.4)
  // Group 1: Sides (|nz| <= 0.4)
  // Group 2: Back face (nz < -0.4)
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

      if (avgNz > 0.4) {
        frontTris.push(a, b, c);
      } else if (avgNz < -0.4) {
        backTris.push(a, b, c);
      } else {
        sideTris.push(a, b, c);
      }
    }

    const reordered = new Uint32Array(frontTris.length + sideTris.length + backTris.length);
    reordered.set(frontTris, 0);
    reordered.set(sideTris, frontTris.length);
    reordered.set(backTris, frontTris.length + sideTris.length);

    geometry.setIndex(new THREE.BufferAttribute(reordered, 1));
    geometry.clearGroups();
    geometry.addGroup(0, frontTris.length, 0); // Front face -> material 0
    geometry.addGroup(frontTris.length, sideTris.length, 1); // Sides -> material 1
    geometry.addGroup(frontTris.length + sideTris.length, backTris.length, 2); // Back -> material 2
  }

  return geometry;
}

/**
 * Creates a graceful stylized colored humanoid avatar without crashing.
 */
export function createFallbackAvatar(options?: Img2ThreeOptions): THREE.Group {
  const dominantColor = options?.dominantColor || options?.colors?.[0] || '#6366f1';
  const geometry = createExtrudedAvatarGeometry(DEFAULT_HUMANOID_CONTOUR, {
    ...options,
    dominantColor,
  });

  const sideColor = new THREE.Color(dominantColor);
  const frontMaterial = new THREE.MeshStandardMaterial({
    color: sideColor,
    roughness: 0.4,
    metalness: 0.1,
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: sideColor.clone().multiplyScalar(0.75),
    roughness: 0.25,
    metalness: 0.15,
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    color: sideColor.clone().multiplyScalar(0.65),
    roughness: 0.35,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geometry, [frontMaterial, sideMaterial, backMaterial]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  const name = options?.name || 'Fallback_NPC';
  group.name = `NPC_${name.replace(/\s+/g, '_')}`;
  group.add(mesh);

  group.userData = {
    id: options?.id || `npc_fallback_${Date.now()}`,
    name,
    type: 'npc',
    isNPC: true,
    interactable: true,
    collidable: true,
    isCustomAvatar: true,
    baseGroundY: 0,
    dominantColor,
  };

  mesh.userData = { ...group.userData };
  (group as unknown as { geometry: THREE.BufferGeometry }).geometry = geometry;
  (group as unknown as { mesh: THREE.Mesh }).mesh = mesh;

  if (options?.registry) {
    options.registry.trackGeometry(geometry);
    options.registry.trackMaterial(frontMaterial);
    options.registry.trackMaterial(sideMaterial);
    options.registry.trackMaterial(backMaterial);
  }

  return group;
}

/**
 * Safely creates a Three.js texture from a base64 string or data URL.
 */
function createTextureFromBase64(base64: string): THREE.Texture | null {
  // If running in headless/Node test environment without Image or DOM
  if (typeof Image === 'undefined' && typeof document === 'undefined') {
    const mockTex = new THREE.Texture();
    mockTex.name = 'PortraitTexture_NodeMock';
    return mockTex;
  }

  try {
    let dataUrl = base64.trim();
    if (!dataUrl.startsWith('data:')) {
      const isJpeg = dataUrl.startsWith('/9j/') || dataUrl.startsWith('ffd8', 0);
      dataUrl = isJpeg ? `data:image/jpeg;base64,${dataUrl}` : `data:image/png;base64,${dataUrl}`;
    }
    const loader = new THREE.TextureLoader();
    const texture = loader.load(dataUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    return texture;
  } catch (err) {
    console.warn('[img2threejsAdapter] Texture creation failed:', err);
    return null;
  }
}

/**
 * Extracts contour outline from an image using an offscreen HTMLCanvasElement.
 */
async function extractContourFromCanvas(
  input: string
): Promise<{ contour: Array<[number, number]>; aspect: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      let dataUrl = input.trim();
      if (!dataUrl.startsWith('data:')) {
        const isJpeg = dataUrl.startsWith('/9j/') || dataUrl.startsWith('ffd8', 0);
        dataUrl = isJpeg ? `data:image/jpeg;base64,${dataUrl}` : `data:image/png;base64,${dataUrl}`;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const aspect = img.width > 0 && img.height > 0 ? img.width / img.height : 0.65;
          const canvas = document.createElement('canvas');
          const gridW = 64;
          const gridH = 64;
          canvas.width = gridW;
          canvas.height = gridH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, gridW, gridH);
          const imgData = ctx.getImageData(0, 0, gridW, gridH);
          const data = imgData.data;

          // Check if image has real alpha transparency
          let transCount = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 240) transCount++;
          }
          const hasAlpha = transCount > (gridW * gridH * 0.02);

          // If opaque, estimate background color from 4 corners
          let bgR = 255, bgG = 255, bgB = 255;
          if (!hasAlpha) {
            const corners = [0, (gridW - 1) * 4, (gridH - 1) * gridW * 4, (gridH * gridW - 1) * 4];
            let cr = 0, cg = 0, cb = 0;
            for (const c of corners) {
              cr += data[c];
              cg += data[c + 1];
              cb += data[c + 2];
            }
            bgR = cr / 4;
            bgG = cg / 4;
            bgB = cb / 4;
          }

          const leftSide: Array<[number, number]> = [];
          const rightSide: Array<[number, number]> = [];

          for (let gy = 0; gy < gridH; gy++) {
            let firstX = -1;
            let lastX = -1;
            for (let gx = 0; gx < gridW; gx++) {
              const idx = (gy * gridW + gx) * 4;
              let isFg = false;
              if (hasAlpha) {
                isFg = data[idx + 3] > 30;
              } else {
                const dist = Math.sqrt(
                  (data[idx] - bgR) ** 2 +
                  (data[idx + 1] - bgG) ** 2 +
                  (data[idx + 2] - bgB) ** 2
                );
                isFg = dist > 35;
              }

              if (isFg) {
                if (firstX === -1) firstX = gx;
                lastX = gx;
              }
            }
            if (firstX !== -1 && lastX !== -1) {
              leftSide.push([firstX / gridW, gy / gridH]);
              rightSide.push([lastX / gridW, gy / gridH]);
            }
          }

          if (leftSide.length < 3) {
            resolve(null);
            return;
          }

          const raw: Array<[number, number]> = [];
          for (let i = 0; i < leftSide.length; i++) {
            raw.push(leftSide[i]);
          }
          for (let i = rightSide.length - 1; i >= 0; i--) {
            const pt = rightSide[i];
            const prev = raw[raw.length - 1];
            if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.001) {
              raw.push(pt);
            }
          }

          const simplified = simplifyContourPoints(raw, 0.015);
          resolve({ contour: simplified.length >= 3 ? simplified : raw, aspect });
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

function simplifyContourPoints(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (points.length <= 4) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lenSq = dx * dx + dy * dy;
    const dist = lenSq === 0
      ? Math.hypot(p[0] - start[0], p[1] - start[1])
      : Math.abs(dy * p[0] - dx * p[1] + end[0] * start[1] - end[1] * start[0]) / Math.sqrt(lenSq);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyContourPoints(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyContourPoints(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  } else {
    return [start, end];
  }
}
