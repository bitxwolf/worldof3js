import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useUIStore, type SceneHierarchyItem } from '../src/renderer/store/uiStore';

describe('Point 79 & Point 75: GLTF Export & Hierarchy Tab Improvements', () => {
  beforeEach(() => {
    // Clear notification state
    const store = useUIStore.getState();
    store.setSelectedNode(null);
  });

  describe('Point 79: GLTF Export functionality', () => {
    it('dispatches and receives engine:export-gltf event on EventTarget', () => {
      const target = new EventTarget();
      const listener = vi.fn();
      target.addEventListener('engine:export-gltf', listener);

      target.dispatchEvent(new CustomEvent('engine:export-gltf'));

      expect(listener).toHaveBeenCalledTimes(1);
      target.removeEventListener('engine:export-gltf', listener);
    });

    it('supports error and success notifications in uiStore for export feedback', () => {
      const store = useUIStore.getState();
      store.showNotification('World exported as GLTF!', 3000, 'success');
      expect(useUIStore.getState().notifications.some((n) => n.message === 'World exported as GLTF!' && n.type === 'success')).toBe(true);

      store.showNotification('GLTF export failed', 3000, 'error');
      expect(useUIStore.getState().notifications.some((n) => n.message === 'GLTF export failed' && n.type === 'error')).toBe(true);
    });

    it('can load GLTFExporter from three/examples/jsm/exporters/GLTFExporter.js', async () => {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      expect(GLTFExporter).toBeDefined();
      const exporter = new GLTFExporter();
      expect(exporter).toBeInstanceOf(GLTFExporter);
      expect(typeof exporter.parse).toBe('function');
    });
  });

  describe('Point 75: Hierarchy Tab scene tree & traversal', () => {
    it('stores sceneHierarchy items in uiStore and allows updating them', () => {
      const sampleItems: SceneHierarchyItem[] = [
        {
          id: 'test_terrain',
          name: 'Terrain_Heightmap_Surface',
          type: 'Terrain/HeightmapMesh',
          category: 'Terrain',
          icon: 'ph-mountains',
          position: [0, 0, 0],
          scale: [1, 1, 1],
        },
        {
          id: 'test_pine',
          name: 'Procedural_Pine_4821',
          type: 'Flora/ProceduralPine',
          category: 'Flora',
          icon: 'ph-tree-evergreen',
          position: [5, 2, -3],
          scale: [1, 1.2, 1],
        },
        {
          id: 'test_npc',
          name: 'NPC_Eldrin_The_Ranger',
          type: 'NPCs/HumanoidNPC',
          category: 'NPCs',
          icon: 'ph-user',
          position: [3, 0, 5],
          scale: [1, 1, 1],
        },
        {
          id: 'test_sun',
          name: 'Sun',
          type: 'Lights/DirectionalSun',
          category: 'Lights',
          icon: 'ph-sun',
          position: [35, 50, 25],
          scale: [1, 1, 1],
        },
      ];

      useUIStore.getState().setSceneHierarchy(sampleItems);
      const hierarchy = useUIStore.getState().sceneHierarchy;
      expect(hierarchy).toHaveLength(4);
      expect(hierarchy.map((h) => h.category)).toEqual(['Terrain', 'Flora', 'NPCs', 'Lights']);
    });

    it('correctly categorizes Three.js objects traversed from scene', () => {
      const scene = new THREE.Scene();
      const terrain = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
      terrain.name = 'Terrain_Heightmap_Surface';
      terrain.userData = { type: 'Terrain/HeightmapMesh' };
      scene.add(terrain);

      const treeGroup = new THREE.Group();
      treeGroup.name = 'Procedural_Pine_1234';
      treeGroup.userData = { type: 'Flora/ProceduralPine' };
      scene.add(treeGroup);

      const npcGroup = new THREE.Group();
      npcGroup.name = 'NPC_Eldrin_The_Ranger';
      npcGroup.userData = { type: 'NPCs/HumanoidNPC' };
      scene.add(npcGroup);

      const sunLight = new THREE.DirectionalLight();
      sunLight.name = 'Sun';
      sunLight.userData = { type: 'Lights/DirectionalSun' };
      scene.add(sunLight);

      const categorized: Record<string, string[]> = {};
      scene.traverse((obj) => {
        if (obj === scene) return;
        const uType = (obj.userData?.type as string) || '';
        let category = 'Objects';
        if (uType.toLowerCase().includes('terrain')) category = 'Terrain';
        else if (uType.toLowerCase().includes('flora')) category = 'Flora';
        else if (uType.toLowerCase().includes('npc')) category = 'NPCs';
        else if (uType.toLowerCase().includes('light') || (obj as THREE.Light).isLight) category = 'Lights';

        if (!categorized[category]) categorized[category] = [];
        categorized[category].push(obj.name);
      });

      expect(categorized.Terrain).toContain('Terrain_Heightmap_Surface');
      expect(categorized.Flora).toContain('Procedural_Pine_1234');
      expect(categorized.NPCs).toContain('NPC_Eldrin_The_Ranger');
      expect(categorized.Lights).toContain('Sun');
    });

    it('allows selecting node from hierarchy and sets selectedNode in uiStore', () => {
      const targetItem: SceneHierarchyItem = {
        id: 'mesh_uuid_123',
        name: 'Procedural_Pine_4821',
        type: 'Flora/ProceduralPine',
        category: 'Flora',
        icon: 'ph-tree-evergreen',
        position: [10, 0, -15],
        scale: [1, 1.5, 1],
        roughness: 0.75,
        metalness: 0.05,
        castShadow: true,
      };

      useUIStore.getState().setSelectedNode({
        id: targetItem.id,
        name: targetItem.name,
        type: targetItem.type,
        position: targetItem.position,
        scale: targetItem.scale,
        roughness: targetItem.roughness,
        metalness: targetItem.metalness,
        castShadow: targetItem.castShadow,
      });

      const selected = useUIStore.getState().selectedNode;
      expect(selected).not.toBeNull();
      expect(selected?.id).toBe('mesh_uuid_123');
      expect(selected?.name).toBe('Procedural_Pine_4821');
      expect(selected?.position).toEqual([10, 0, -15]);
    });
  });
});
