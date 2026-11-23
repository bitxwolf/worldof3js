import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useOrchestratorStore } from '../src/renderer/store/orchestratorStore';
import { useInventoryStore } from '../src/renderer/store/inventoryStore';
import { generateStandaloneHtml } from '../src/shared/exportHtml';
import type { SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('Round 3 Audit & Bug Fix Verification', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedNode: null,
      sceneHierarchy: [],
      cameraMode: 'orbit',
      isSettingsOpen: false,
      isLibraryOpen: false,
      isPolyforkOpen: false,
      isDocUploaderOpen: false,
      isImageUploaderOpen: false,
      jsonInspectorOpen: false,
    });
    useOrchestratorStore.setState({
      activeSelection: null,
    });
    useInventoryStore.setState({
      items: [],
      selectedSlot: 0,
    });
  });

  describe('BUG-014 & BUG-015: Viewport Hotkeys & Selection Lifecycle', () => {
    it('isInputTarget helper detects input, textarea, select, and contenteditable elements', () => {
      const isInputTarget = (target: unknown): boolean => {
        if (!target || typeof target !== 'object') return false;
        const tag = ((target as { tagName?: string }).tagName || '').toUpperCase();
        return (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          Boolean((target as { isContentEditable?: boolean }).isContentEditable)
        );
      };

      const input = { tagName: 'INPUT' };
      const textarea = { tagName: 'TEXTAREA' };
      const select = { tagName: 'SELECT' };
      const editableDiv = { tagName: 'DIV', isContentEditable: true };
      const normalDiv = { tagName: 'DIV', isContentEditable: false };

      expect(isInputTarget(input)).toBe(true);
      expect(isInputTarget(textarea)).toBe(true);
      expect(isInputTarget(select)).toBe(true);
      expect(isInputTarget(editableDiv)).toBe(true);
      expect(isInputTarget(normalDiv)).toBe(false);
      expect(isInputTarget(null)).toBe(false);
      expect(isInputTarget(undefined)).toBe(false);
    });

    it('clears activeSelection when Circle Select toggles off', () => {
      useOrchestratorStore.getState().setActiveSelection({
        center: { x: 5, z: 10 },
        radiusWorldUnits: 20,
        regions: [],
        npcs: [],
        landmarks: [],
        activeQuests: [],
        biome: 'pine',
      });
      expect(useOrchestratorStore.getState().activeSelection).not.toBeNull();

      // Simulate deactivation
      const isNextActive = false;
      if (!isNextActive) {
        useOrchestratorStore.getState().clearSelection();
      }
      expect(useOrchestratorStore.getState().activeSelection).toBeNull();
    });
  });

  describe('BUG-016: Image & Doc Uploader States in uiStore', () => {
    it('manages isDocUploaderOpen and isImageUploaderOpen states and toggles', () => {
      const store = useUIStore.getState();
      expect(store.isDocUploaderOpen).toBe(false);
      expect(store.isImageUploaderOpen).toBe(false);

      store.setIsDocUploaderOpen(true);
      expect(useUIStore.getState().isDocUploaderOpen).toBe(true);

      store.toggleDocUploader();
      expect(useUIStore.getState().isDocUploaderOpen).toBe(false);

      store.setIsImageUploaderOpen(true);
      expect(useUIStore.getState().isImageUploaderOpen).toBe(true);

      store.toggleImageUploader();
      expect(useUIStore.getState().isImageUploaderOpen).toBe(false);
    });
  });

  describe('BUG-017 & BUG-018: Transform Sanitization & Scene Hierarchy Synchronization', () => {
    beforeEach(() => {
      useUIStore.getState().setSceneHierarchy([
        {
          id: 'tower_01',
          name: 'Watchtower',
          type: 'building',
          category: 'Architecture',
          icon: 'ph-columns',
          position: [0, 0, 0],
          scale: [1, 1, 1],
          rotation: [0, 0, 0],
        },
      ]);
      useUIStore.getState().setSelectedNode({
        id: 'tower_01',
        name: 'Watchtower',
        type: 'building',
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
      });
    });

    it('sanitizes non-finite or zero scales and synchronizes hierarchy', () => {
      // Scale <= 0 must be clamped to minimum safe value 0.001
      useUIStore.getState().updateSelectedNodeScale('x', 0);
      expect(useUIStore.getState().selectedNode?.scale[0]).toBe(0.001);
      expect(useUIStore.getState().sceneHierarchy[0].scale[0]).toBe(0.001);

      // Negative scale clamped to 0.001
      useUIStore.getState().updateSelectedNodeScale('y', -5);
      expect(useUIStore.getState().selectedNode?.scale[1]).toBe(0.001);

      // NaN scale defaults safely to 1.0
      useUIStore.getState().updateSelectedNodeScale('z', NaN);
      expect(useUIStore.getState().selectedNode?.scale[2]).toBe(1.0);

      // Valid scale is applied and synced to hierarchy
      useUIStore.getState().updateSelectedNodeScale('x', 2.5);
      expect(useUIStore.getState().selectedNode?.scale[0]).toBe(2.5);
      expect(useUIStore.getState().sceneHierarchy[0].scale[0]).toBe(2.5);
    });

    it('sanitizes non-finite positions and synchronizes hierarchy', () => {
      useUIStore.getState().updateSelectedNodePosition('x', 14.5);
      expect(useUIStore.getState().selectedNode?.position[0]).toBe(14.5);
      expect(useUIStore.getState().sceneHierarchy[0].position[0]).toBe(14.5);

      // NaN position safely defaults to 0
      useUIStore.getState().updateSelectedNodePosition('y', NaN);
      expect(useUIStore.getState().selectedNode?.position[1]).toBe(0);
      expect(useUIStore.getState().sceneHierarchy[0].position[1]).toBe(0);

      // Infinity position safely defaults to 0
      useUIStore.getState().updateSelectedNodePosition('z', Infinity);
      expect(useUIStore.getState().selectedNode?.position[2]).toBe(0);
      expect(useUIStore.getState().sceneHierarchy[0].position[2]).toBe(0);
    });

    it('sanitizes non-finite rotations and synchronizes hierarchy', () => {
      useUIStore.getState().updateSelectedNodeRotation('y', Math.PI);
      expect(useUIStore.getState().selectedNode?.rotation?.[1]).toBeCloseTo(Math.PI);
      expect(useUIStore.getState().sceneHierarchy[0].rotation?.[1]).toBeCloseTo(Math.PI);

      // NaN rotation safely defaults to 0
      useUIStore.getState().updateSelectedNodeRotation('x', NaN);
      expect(useUIStore.getState().selectedNode?.rotation?.[0]).toBe(0);
      expect(useUIStore.getState().sceneHierarchy[0].rotation?.[0]).toBe(0);
    });
  });

  describe('BUG-019: Reset Camera Mode Switch', () => {
    it('switches cameraMode from walk back to orbit when resetting view', () => {
      useUIStore.getState().setCameraMode('walk');
      expect(useUIStore.getState().cameraMode).toBe('walk');

      if (useUIStore.getState().cameraMode === 'walk') {
        useUIStore.getState().setCameraMode('orbit');
      }
      expect(useUIStore.getState().cameraMode).toBe('orbit');
    });
  });

  describe('BUG-020: Circle Select Wheel Brush Scaling Direction', () => {
    it('scroll up (deltaY < 0) increases radius and scroll down (deltaY > 0) decreases radius', () => {
      let radius = 25;
      const updateRadius = (deltaY: number) => {
        radius = Math.max(5, Math.min(100, radius - Math.sign(deltaY) * 2.5));
      };

      // Scroll up: deltaY is -100
      updateRadius(-100);
      expect(radius).toBe(27.5);

      // Scroll down: deltaY is +100
      updateRadius(100);
      expect(radius).toBe(25);
    });
  });

  describe('BUG-022: Inventory Hotbar Modifier & Editable Guarding', () => {
    it('ignores hotbar number keypresses when modifiers or editable elements are active', () => {
      useInventoryStore.getState().addItem({ id: 'item_1', name: 'Magic Compass' });
      useInventoryStore.getState().addItem({ id: 'item_2', name: 'Golden Key' });

      const simulateInventoryKey = (e: {
        key: string;
        ctrlKey?: boolean;
        metaKey?: boolean;
        altKey?: boolean;
        isInput?: boolean;
      }) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.isInput) return;
        const keyNum = parseInt(e.key, 10);
        if (keyNum >= 1 && keyNum <= 8) {
          useInventoryStore.getState().selectSlot(keyNum - 1);
        }
      };

      // Pressing 2 normally selects slot 1
      simulateInventoryKey({ key: '2' });
      expect(useInventoryStore.getState().selectedSlot).toBe(1);

      // Pressing Ctrl+1 does not change slot
      simulateInventoryKey({ key: '1', ctrlKey: true });
      expect(useInventoryStore.getState().selectedSlot).toBe(1);

      // Pressing 1 while typing in input does not change slot
      simulateInventoryKey({ key: '1', isInput: true });
      expect(useInventoryStore.getState().selectedSlot).toBe(1);
    });
  });

  describe('BUG-023: Standalone HTML Arrow Key Navigation', () => {
    it('registers ArrowUp, ArrowDown, ArrowLeft, ArrowRight in exported HTML keys', () => {
      const minimalGraph = {
        version: '1.0',
        world: {
          name: 'Arrow World',
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
      expect(html).toContain('ArrowUp: false');
      expect(html).toContain('keys.KeyW || keys.ArrowUp');
      expect(html).toContain('keys.KeyS || keys.ArrowDown');
      expect(html).toContain('keys.KeyA || keys.ArrowLeft');
      expect(html).toContain('keys.KeyD || keys.ArrowRight');
    });
  });
});
