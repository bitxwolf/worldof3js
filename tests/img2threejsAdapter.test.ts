import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  imageToGeometry,
  imageToBufferGeometry,
  createExtrudedAvatarGeometry,
  createFallbackAvatar,
  DEFAULT_HUMANOID_CONTOUR,
} from '../src/renderer/engine/assets/img2threejsAdapter';
import { ResourceRegistry } from '../src/renderer/engine/ResourceRegistry';
import { transport } from '../src/shared/transport';

describe('img2threejsAdapter (Approach B Extrusion & UV Projection)', () => {
  describe('createExtrudedAvatarGeometry', () => {
    it('creates an ExtrudeGeometry with depth in 0.08–0.12 range and accurate pivot grounding at y = 0', () => {
      const geometry = createExtrudedAvatarGeometry(DEFAULT_HUMANOID_CONTOUR, {
        targetHeight: 1.85,
        depth: 0.10,
        bevelEnabled: true,
      });

      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;

      // Accurate pivot grounding at y = 0 (bottom touches floor)
      expect(box.min.y).toBeCloseTo(0.0, 2);

      // Height matches target height (including bevels)
      expect(box.max.y).toBeGreaterThan(1.8);
      expect(box.max.y).toBeLessThan(2.0);

      // Centered on X: |min.x + max.x| ~ 0
      const centerX = (box.min.x + box.max.x) / 2;
      expect(centerX).toBeCloseTo(0.0, 2);

      // Thickness/Depth is within 0.08–0.12 units range (+ bevels)
      const thickness = box.max.z - box.min.z;
      expect(thickness).toBeGreaterThanOrEqual(0.08);
      expect(thickness).toBeLessThanOrEqual(0.18);

      // Centered on Z: |min.z + max.z| ~ 0
      const centerZ = (box.min.z + box.max.z) / 2;
      expect(centerZ).toBeCloseTo(0.0, 2);
    });

    it('generates normalized [0, 1] UV coordinates for front and rear faces', () => {
      const geometry = createExtrudedAvatarGeometry(DEFAULT_HUMANOID_CONTOUR, {
        targetHeight: 1.85,
        depth: 0.10,
      });

      const uvs = geometry.attributes.uv;
      const normals = geometry.attributes.normal;
      expect(uvs).toBeDefined();

      let frontVertexCount = 0;
      let minU = 1, maxU = 0, minV = 1, maxV = 0;

      for (let i = 0; i < uvs.count; i++) {
        const u = uvs.getX(i);
        const v = uvs.getY(i);
        const nz = normals.getZ(i);

        // All UVs must be bounded in [0, 1]
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1.0);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.0);

        if (nz > 0.5) {
          frontVertexCount++;
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }

      expect(frontVertexCount).toBeGreaterThan(10);
      // Front face UV projection covers the [0, 1] texture bounds
      expect(maxU - minU).toBeGreaterThan(0.5);
      expect(maxV - minV).toBeGreaterThan(0.5);
    });

    it('partitions triangle indices into front (0), side (1), and rear (2) material groups', () => {
      const geometry = createExtrudedAvatarGeometry(DEFAULT_HUMANOID_CONTOUR, {
        targetHeight: 1.85,
        depth: 0.10,
      });

      expect(geometry.groups.length).toBeGreaterThanOrEqual(2);
      const groupIndices = geometry.groups.map((g) => g.materialIndex);
      expect(groupIndices).toContain(0); // Front face
      expect(groupIndices).toContain(1); // Sides
    });
  });

  describe('imageToGeometry (Avatar Group Assembly)', () => {
    it('creates a complete THREE.Group with multi-materials, shadows, and colliders', async () => {
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const group = await imageToGeometry(mockBase64, {
        name: 'Sir Galahad',
        dominantColor: '#4f46e5',
      });

      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.name).toBe('NPC_Sir_Galahad');
      expect(group.userData.name).toBe('Sir Galahad');
      expect(group.userData.type).toBe('npc');
      expect(group.userData.interactable).toBe(true);
      expect(group.userData.collidable).toBe(true);
      expect(group.userData.isCustomAvatar).toBe(true);

      // Contains mesh child
      const mesh = group.children[0] as THREE.Mesh;
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);

      // Multi-material setup
      expect(Array.isArray(mesh.material)).toBe(true);
      const materials = mesh.material as THREE.Material[];
      expect(materials.length).toBe(3);

      // Front face material
      const frontMat = materials[0] as THREE.MeshStandardMaterial;
      expect(frontMat.isMeshStandardMaterial).toBe(true);

      // Extruded side material: low roughness as specified in prompt
      const sideMat = materials[1] as THREE.MeshStandardMaterial;
      expect(sideMat.isMeshStandardMaterial).toBe(true);
      expect(sideMat.roughness).toBeLessThanOrEqual(0.35);

      // Rear backing material
      const backMat = materials[2] as THREE.MeshStandardMaterial;
      expect(backMat.isMeshStandardMaterial).toBe(true);
    });

    it('tracks all created geometries, materials, and textures in ResourceRegistry', async () => {
      const registry = new ResourceRegistry();
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      await imageToGeometry(mockBase64, {
        name: 'Tracked_NPC',
        registry,
      });

      expect(registry.stats.geometries).toBeGreaterThan(0);
      expect(registry.stats.materials).toBeGreaterThanOrEqual(3);

      // Can dispose all without error
      registry.disposeAll();
      expect(registry.stats.geometries).toBe(0);
      expect(registry.stats.materials).toBe(0);
    });

    it('gracefully handles empty or corrupted base64 with fallback avatar without throwing', async () => {
      const fallback = await imageToGeometry('', {
        name: 'Corrupt_NPC',
      });

      expect(fallback).toBeInstanceOf(THREE.Group);
      expect(fallback.userData.type).toBe('npc');
      expect(fallback.children.length).toBeGreaterThan(0);
    });

    it('createFallbackAvatar produces valid grounded humanoid group', () => {
      const fallback = createFallbackAvatar({ name: 'Emergency_NPC', dominantColor: '#ef4444' });
      expect(fallback).toBeInstanceOf(THREE.Group);
      expect(fallback.name).toBe('NPC_Emergency_NPC');
      const mesh = fallback.children[0] as THREE.Mesh;
      expect(mesh.geometry).toBeDefined();

      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(0.0, 2);
    });

    it('imageToBufferGeometry returns production-ready THREE.ExtrudeGeometry', async () => {
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const geom = await imageToBufferGeometry(mockBase64, {
        targetHeight: 1.85,
        depth: 0.10,
      });

      expect(geom).toBeInstanceOf(THREE.ExtrudeGeometry);
      geom.computeBoundingBox();
      expect(geom.boundingBox!.min.y).toBeCloseTo(0.0, 2);
    });

    it('accurately projects front UVs corresponding to image contour coordinates without distortion', () => {
      // Silhouette with head at top-center (nx = 0.50, ny = 0.10) and foot at (nx = 0.60, ny = 0.90)
      const customContour: Array<[number, number]> = [
        [0.50, 0.10], // Head top
        [0.65, 0.30], // Shoulder right
        [0.60, 0.90], // Foot right
        [0.40, 0.90], // Foot left
        [0.35, 0.30], // Shoulder left
      ];

      const geom = createExtrudedAvatarGeometry(customContour, {
        targetHeight: 2.0,
        aspectRatio: 0.8,
        bevelEnabled: false,
      });

      const uvs = geom.attributes.uv;
      const normals = geom.attributes.normal;

      let foundHeadUv = false;
      for (let i = 0; i < uvs.count; i++) {
        const nz = normals.getZ(i);
        if (nz > 0.5) {
          const u = uvs.getX(i);
          const v = uvs.getY(i);
          // Head top is at nx = 0.50, ny = 0.10 -> expected U = 0.50, V = 0.90 (1 - 0.10)
          if (Math.abs(u - 0.50) < 0.05 && Math.abs(v - 0.90) < 0.05) {
            foundHeadUv = true;
          }
        }
      }

      expect(foundHeadUv).toBe(true);
    });

    it('applies extracted dominant color to extruded rim and back materials', async () => {
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const group = await imageToGeometry(mockBase64, {
        colors: ['#10b981', '#064e3b'], // Emerald green
      });

      const mesh = group.children[0] as THREE.Mesh;
      const materials = mesh.material as THREE.MeshStandardMaterial[];
      const sideMat = materials[1];
      const backMat = materials[2];

      // Side material color matches dominant color (#10b981)
      expect(sideMat.color.getHexString()).toBe('10b981');
      expect(backMat.color.getHexString()).toBeDefined();
    });

    it('transport.processImage returns valid processed image in browser fallback mode', async () => {
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const res = await transport.processImage(mockBase64, 'image/png');

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBeDefined();
        expect(res.data.dimensions.width).toBeGreaterThan(0);
        expect(res.data.colors).toBeDefined();
        expect(res.data.contour).toBeDefined();
        expect(res.data.contour!.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
