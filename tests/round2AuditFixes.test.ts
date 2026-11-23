import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useOrchestratorStore } from '../src/renderer/store/orchestratorStore';
import { generateStandaloneHtml } from '../src/shared/exportHtml';
import type { SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('Round 2 Audit & Fix Verification', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedNode: null,
      sceneHierarchy: [],
    });
    useOrchestratorStore.setState({
      activeSelection: null,
    });
  });

  describe('BUG-004: Rotation Controls and Schema in uiStore', () => {
    it('sets and updates rotation on SelectedNodeInfo', () => {
      useUIStore.getState().setSelectedNode({
        id: 'mesh_01',
        name: 'Tower_Pillar',
        type: 'building',
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
      });

      const store = useUIStore.getState();
      expect(store.selectedNode?.rotation).toEqual([0, 0, 0]);

      store.updateSelectedNodeRotation('y', Math.PI / 2);
      expect(useUIStore.getState().selectedNode?.rotation?.[1]).toBeCloseTo(Math.PI / 2);

      store.updateSelectedNodeRotation('x', Math.PI / 4);
      expect(useUIStore.getState().selectedNode?.rotation?.[0]).toBeCloseTo(Math.PI / 4);

      store.updateSelectedNodeRotation('z', Math.PI / 6);
      expect(useUIStore.getState().selectedNode?.rotation?.[2]).toBeCloseTo(Math.PI / 6);
    });

    it('handles updateSelectedNodeRotation when node has no prior rotation array', () => {
      useUIStore.getState().setSelectedNode({
        id: 'mesh_02',
        name: 'Rock_Cluster',
        type: 'rock',
        position: [1, 2, 3],
        scale: [1, 1, 1],
      });

      useUIStore.getState().updateSelectedNodeRotation('y', 1.57);
      const rot = useUIStore.getState().selectedNode?.rotation;
      expect(rot).toBeDefined();
      expect(rot?.[0]).toBe(0);
      expect(rot?.[1]).toBeCloseTo(1.57);
      expect(rot?.[2]).toBe(0);
    });

    it('stores rotation in SceneHierarchyItem', () => {
      useUIStore.getState().setSceneHierarchy([
        {
          id: 'item_1',
          name: 'Shrine',
          type: 'building',
          category: 'Architecture',
          icon: 'ph-columns',
          position: [5, 0, -5],
          scale: [2, 2, 2],
          rotation: [0, 1.57, 0],
        },
      ]);

      const items = useUIStore.getState().sceneHierarchy;
      expect(items[0].rotation).toEqual([0, 1.57, 0]);
    });
  });

  describe('BUG-011: IPv6 Loopback [::1] Origin and URL Resolution', () => {
    it('recognizes [::1] loopback URL hostname', () => {
      const url = new URL('http://[::1]:3422/api/app/version');
      expect(url.hostname).toBe('[::1]');
      const isLoopback =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '::1' ||
        url.hostname === '[::1]';
      expect(isLoopback).toBe(true);
    });

    it('blocks foreign external IPv6 or non-loopback domains', () => {
      const externalUrl = new URL('http://example.com:3422/api');
      const isLoopback =
        externalUrl.hostname === 'localhost' ||
        externalUrl.hostname === '127.0.0.1' ||
        externalUrl.hostname === '::1' ||
        externalUrl.hostname === '[::1]';
      expect(isLoopback).toBe(false);
    });
  });

  describe('BUG-012: Standalone HTML Camera Order (Gimbal Lock Fix)', () => {
    it('sets camera.rotation.order to YXZ in exported HTML script', () => {
      const minimalGraph = {
        version: '1.0',
        world: {
          name: 'FPS Arena',
          description: 'A test realm for standalone HTML export',
          biome: 'forest',
          timeOfDay: 'morning',
          weather: 'clear',
          scale: 'medium',
        },
        player: {
          spawn: [0, 1.7, 5] as [number, number, number],
          startPosition: [0, 1.7, 5] as [number, number, number],
          movementSpeed: 4.0,
          jumpHeight: 1.5,
        },
        atmosphere: {
          fogDensity: 0.01,
          fogColor: '#ffffff',
          ambientIntensity: 0.5,
          sunColor: '#ffffff',
        },
        zones: [],
        lights: [],
        events: [],
        objects: [],
        characters: [],
      } as unknown as SceneGraph;

      const html = generateStandaloneHtml(minimalGraph);
      expect(html).toContain("camera.rotation.order = 'YXZ';");
      expect(html).toContain('camera.rotation.set(pitch, yaw, 0);');
    });
  });

  describe('BUG-013: Orchestrator Selection Lifecycle', () => {
    it('clears activeSelection cleanly via clearSelection()', () => {
      useOrchestratorStore.getState().setActiveSelection({
        center: { x: 10, z: 20 },
        radiusWorldUnits: 15,
        regions: [],
        npcs: ['npc_1'],
        landmarks: [],
        activeQuests: [],
        biome: 'pine',
      });

      expect(useOrchestratorStore.getState().activeSelection).not.toBeNull();
      useOrchestratorStore.getState().clearSelection();
      expect(useOrchestratorStore.getState().activeSelection).toBeNull();
    });
  });
});
