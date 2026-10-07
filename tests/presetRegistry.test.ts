import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PresetRegistry } from '../src/renderer/engine/presets/PresetRegistry';
import { ResourceRegistry } from '../src/renderer/engine/ResourceRegistry';
import { createDefaultHumanoid, createPresetNPC } from '../src/renderer/engine/DefaultMeshes';

describe('PresetRegistry & High-Detail 3D Presets', () => {
  let registry: PresetRegistry;
  let resourceRegistry: ResourceRegistry;

  beforeEach(() => {
    resourceRegistry = new ResourceRegistry();
    registry = new PresetRegistry(resourceRegistry);
  });

  describe('Catalog & Metadata', () => {
    it('registers all 9 core presets in the catalog', () => {
      const presets = registry.listPresets();
      expect(presets.length).toBeGreaterThanOrEqual(9);

      const ids = presets.map((p) => p.id);
      expect(ids).toContain('npc_cyber_cyborg');
      expect(ids).toContain('npc_arcane_mystic');
      expect(ids).toContain('npc_desert_scavenger');
      expect(ids).toContain('npc_forest_guardian');
      expect(ids).toContain('npc_steam_alchemist');
      expect(ids).toContain('tree_layered_canopy');
      expect(ids).toContain('grass_tuft_dense');
      expect(ids).toContain('prop_rune_obelisk');
      expect(ids).toContain('terrain_surface_stone');
    });

    it('filters presets by category correctly', () => {
      const npcs = registry.listPresets('npc');
      expect(npcs.length).toBe(5);
      npcs.forEach((n) => expect(n.type).toBe('npc'));

      const flora = registry.listPresets('flora');
      expect(flora.length).toBe(2);
      expect(flora.map((f) => f.id)).toContain('tree_layered_canopy');
      expect(flora.map((f) => f.id)).toContain('grass_tuft_dense');
    });
  });

  describe('NPC Archetype Presets (Dimensional 3D Geometry & Normals)', () => {
    const npcIds = [
      'npc_cyber_cyborg',
      'npc_arcane_mystic',
      'npc_desert_scavenger',
      'npc_forest_guardian',
      'npc_steam_alchemist',
    ];

    npcIds.forEach((id) => {
      it(`spawns ${id} with true dimensional 3D depth, bevels, and grounded pivot at y=0`, () => {
        const group = registry.spawn(id, { scale: 1.0 });
        expect(group).toBeInstanceOf(THREE.Group);
        expect(group.userData.id).toBe(id);
        expect(group.userData.type).toBe('npc');

        // Verify bounding box and 3D depth (avoids flat 2D billboards)
        const box = new THREE.Box3().setFromObject(group);
        const depth = box.max.z - box.min.z;
        const height = box.max.y - box.min.y;

        expect(depth).toBeGreaterThan(0.05); // True dimensional 3D thickness
        expect(height).toBeGreaterThan(1.2); // Full humanoid stature
        expect(box.min.y).toBeCloseTo(0, 1); // Grounded anchor at y=0

        // Verify multi-material and normal map support
        const mesh = group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
        expect(mesh).toBeDefined();
        expect(Array.isArray(mesh.material)).toBe(true);
        const mats = mesh.material as THREE.Material[];
        expect(mats.length).toBe(3); // Front, side rim, rear

        const frontMat = mats[0] as THREE.MeshStandardMaterial;
        expect(frontMat.roughness).toBeDefined();
        expect(frontMat.roughness).toBeLessThanOrEqual(0.7);
      });
    });
  });

  describe('Environment Presets', () => {
    it('spawns tree_layered_canopy with 3D trunk and multi-angle canopy planes', () => {
      const tree = registry.spawn('tree_layered_canopy', { scale: 1.2 });
      expect(tree).toBeInstanceOf(THREE.Group);

      const box = new THREE.Box3().setFromObject(tree);
      const width = box.max.x - box.min.x;
      const depth = box.max.z - box.min.z;
      const height = box.max.y - box.min.y;

      expect(height).toBeGreaterThan(4.0);
      expect(width).toBeGreaterThan(2.0);
      expect(depth).toBeGreaterThan(2.0); // Multi-directional canopy volume
      expect(box.min.y).toBeCloseTo(0, 1);
    });

    it('spawns grass_tuft_dense with 4 volumetric blade planes', () => {
      const grass = registry.spawn('grass_tuft_dense');
      expect(grass.children.length).toBe(4); // 4 intersecting volumetric blade planes

      const box = new THREE.Box3().setFromObject(grass);
      const width = box.max.x - box.min.x;
      const depth = box.max.z - box.min.z;

      expect(width).toBeGreaterThan(0.3);
      expect(depth).toBeGreaterThan(0.3); // Radial spread avoids 2D billboard look
      expect(box.min.y).toBeCloseTo(0, 1);
    });

    it('spawns prop_rune_obelisk with dimensional polygonal depth and rune normal maps', () => {
      const obelisk = registry.spawn('prop_rune_obelisk');
      const box = new THREE.Box3().setFromObject(obelisk);

      expect(box.max.y - box.min.y).toBeGreaterThan(2.5);
      expect(box.max.z - box.min.z).toBeGreaterThan(0.1);
      expect(box.min.y).toBeCloseTo(0, 1);
    });

    it('spawns terrain_surface_stone surface mesh with normal map support', () => {
      const terrain = registry.spawn('terrain_surface_stone');
      const mesh = terrain.children[0] as THREE.Mesh;
      expect(mesh).toBeDefined();
      expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.normalMap).toBeDefined();
    });
  });

  describe('Legacy Mesh Replacement & DefaultMeshes Integration', () => {
    it('createDefaultHumanoid spawns a volumetric 3D preset instead of legacy cylinder primitives', () => {
      const humanoid = createDefaultHumanoid();
      expect(humanoid).toBeInstanceOf(THREE.Group);

      const box = new THREE.Box3().setFromObject(humanoid);
      const depth = box.max.z - box.min.z;
      expect(depth).toBeGreaterThan(0.05);
      expect(box.min.y).toBeCloseTo(0, 1);
    });

    it('createPresetNPC spawns any designated archetype', () => {
      const mystic = createPresetNPC('npc_arcane_mystic');
      expect(mystic.userData.id).toBe('npc_arcane_mystic');
      expect(mystic.userData.name).toBe('Arcanist Elenya');
    });
  });

  describe('Resource Management & GPU Disposal', () => {
    it('disposes all allocated geometries, materials, and textures cleanly', () => {
      const npc = registry.spawn('npc_cyber_cyborg', { registry: resourceRegistry });
      expect(resourceRegistry.stats.geometries).toBeGreaterThan(0);
      expect(resourceRegistry.stats.materials).toBeGreaterThan(0);

      registry.disposeInstance(npc);
      resourceRegistry.disposeAll();

      expect(resourceRegistry.stats.geometries).toBe(0);
      expect(resourceRegistry.stats.materials).toBe(0);
      expect(resourceRegistry.stats.textures).toBe(0);
    });
  });
});
