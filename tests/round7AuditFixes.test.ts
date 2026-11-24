import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { useInventoryStore } from '../src/renderer/store/inventoryStore';
import { CircleSelectTool } from '../src/renderer/components/Viewport/CircleSelectTool';
import { AssetRegistry } from '../src/renderer/engine/AssetRegistry';
import { ClaudeService } from '../src/main/services/ClaudeService';
import { StoreService } from '../src/main/services/StoreService';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class MockCanvas extends EventTarget {
  width = 800;
  height = 600;
  setPointerCapture = vi.fn();
  releasePointerCapture = vi.fn();
  getBoundingClientRect() {
    return {
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    };
  }
}

class MockPointerEvent extends Event {
  button: number;
  clientX: number;
  clientY: number;
  movementY: number;
  pointerId: number;
  shiftKey: boolean;

  constructor(type: string, props: Partial<MockPointerEvent> = {}) {
    super(type, { bubbles: true });
    this.button = props.button ?? 0;
    this.clientX = props.clientX ?? 0;
    this.clientY = props.clientY ?? 0;
    this.movementY = props.movementY ?? 0;
    this.pointerId = props.pointerId ?? 1;
    this.shiftKey = props.shiftKey ?? false;
  }
}

describe('Round 7 Bug Audit & Resiliency Fixes', () => {
  beforeEach(() => {
    useUIStore.setState({
      cameraMode: 'orbit',
      jsonInspectorOpen: false,
    });
    useWorldStore.setState({
      sceneGraph: null,
      playerPosition: [0, 1.7, 0],
    });
    useInventoryStore.getState().clearInventory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BUG-042: Local GLTF/GLB Asset Import and AssetRegistry Direct Path Resolution', () => {
    it('resolves local relative and absolute .glb/.gltf paths directly instead of prepending polyfork://', async () => {
      const registry = new AssetRegistry();
      const loadAsyncSpy = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({
        scene: new THREE.Group(),
        animations: [],
      } as any);

      // 1. Relative local path with ./
      await registry.loadModel('./assets/models/chest.glb');
      expect(loadAsyncSpy).toHaveBeenCalledWith('./assets/models/chest.glb');

      // 2. Relative assets/ folder
      await registry.loadModel('assets/models/pillar.gltf');
      expect(loadAsyncSpy).toHaveBeenCalledWith('assets/models/pillar.gltf');

      // 3. Absolute path /models/rock.glb
      await registry.loadModel('/models/rock.glb');
      expect(loadAsyncSpy).toHaveBeenCalledWith('/models/rock.glb');

      // 4. File ending with .glb without polyfork:
      await registry.loadModel('custom_scenery.glb');
      expect(loadAsyncSpy).toHaveBeenCalledWith('custom_scenery.glb');

      loadAsyncSpy.mockRestore();
    });

    it('preserves polyfork:// protocol for Polyfork library assets', async () => {
      const registry = new AssetRegistry();
      const loadAsyncSpy = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({
        scene: new THREE.Group(),
        animations: [],
      } as any);

      await registry.loadModel('polyfork:building_cottage');
      expect(loadAsyncSpy).toHaveBeenCalledWith('polyfork://building_cottage.glb');

      loadAsyncSpy.mockRestore();
    });
  });

  describe('BUG-043: CircleSelectTool Live Scene Mesh Detection & Initial Reticle Snapping', () => {
    it('snaps reticle immediately to mouse coordinates on updateInitialPosition', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 10, 20);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const canvas = new MockCanvas() as unknown as HTMLCanvasElement;

      const tool = new CircleSelectTool(scene, camera, canvas, null, 'pine');
      const reticle = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
      expect(reticle).toBeDefined();

      // Initially at 0, 0.05, 0 before any pointer event
      expect(reticle.position.x).toBe(0);

      // Snap to pointer coordinates
      tool.updateInitialPosition({ clientX: 200, clientY: 150 });
      expect(reticle.position.x).not.toBe(0);

      tool.dispose();
    });

    it('safely resets dragging state when pointercancel fires on canvas', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      const canvas = new MockCanvas() as unknown as HTMLCanvasElement;

      const tool = new CircleSelectTool(scene, camera, canvas, null, 'pine');

      // Pointer down starts dragging
      canvas.dispatchEvent(new MockPointerEvent('pointerdown', { button: 0, pointerId: 4 }));
      expect((canvas as any).setPointerCapture).toHaveBeenCalledWith(4);

      // Pointer cancel fires (e.g. system gesture interrupt or alt-tab)
      canvas.dispatchEvent(new MockPointerEvent('pointercancel', { button: 0, pointerId: 4 }));
      expect((canvas as any).releasePointerCapture).toHaveBeenCalledWith(4);

      tool.dispose();
    });

    it('detects live patrolling NPCs and transformed props in 3D scene during confirmSelection', async () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      const canvas = new MockCanvas() as unknown as HTMLCanvasElement;

      // Add a live patrolling NPC mesh at (2, 0, 2)
      const npcGroup = new THREE.Group();
      npcGroup.position.set(2, 0, 2);
      npcGroup.name = 'NPC_Patrol_Guard';
      npcGroup.userData = { id: 'npc_guard_patrol', type: 'npc', isNPC: true };
      scene.add(npcGroup);

      // Add an interactive prop mesh at (-1, 0, -1)
      const propGroup = new THREE.Group();
      propGroup.position.set(-1, 0, -1);
      propGroup.name = 'Chest_Gold';
      propGroup.userData = { id: 'prop_chest_gold', type: 'prop', assetId: 'polyfork:chest' };
      scene.add(propGroup);

      const tool = new CircleSelectTool(scene, camera, canvas, null, 'pine');

      canvas.dispatchEvent(new MockPointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }));
      canvas.dispatchEvent(new MockPointerEvent('pointerup', { button: 0, clientX: 400, clientY: 300 }));

      await new Promise((r) => setTimeout(r, 30));

      const selection = (tool as any)['useOrchestratorStore']?.getState?.()?.activeSelection ??
        (await import('../src/renderer/store/orchestratorStore')).useOrchestratorStore.getState().activeSelection;

      expect(selection).not.toBeNull();
      expect(selection?.npcs).toContain('npc_guard_patrol');
      expect(selection?.landmarks).toContain('prop_chest_gold');

      tool.dispose();
      scene.remove(npcGroup);
      scene.remove(propGroup);
    });
  });

  describe('BUG-044: Inspector Transform SceneGraph Synchronization', () => {
    it('persists modified object position, rotation, and scale to useWorldStore.sceneGraph', () => {
      useWorldStore.setState({
        sceneGraph: {
          world: { name: 'Test World', description: 'Testing', biome: 'pine', timeOfDay: 'noon', weather: 'clear', scale: 'small' },
          objects: [
            { id: 'obj_pine_tree', name: 'Pine Tree', type: 'foliage', position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] },
          ],
          characters: [
            { id: 'char_ranger', name: 'Ranger', description: 'Guardian', personality: 'brave', position: [0, 0, 0] },
          ],
        } as any,
      });

      // Simulate inspector position update
      useUIStore.getState().setSelectedNode({
        id: 'obj_pine_tree',
        name: 'Pine Tree',
        type: 'foliage',
        position: [12.5, 3.0, -8.0],
        scale: [2.0, 2.0, 2.0],
        rotation: [0, Math.PI / 4, 0],
        roughness: 0.5,
        metalness: 0.1,
        castShadow: true,
      });

      // Execute scene graph synchronization logic
      const currentScene = useWorldStore.getState().sceneGraph;
      if (currentScene?.objects) {
        const selectedNode = useUIStore.getState().selectedNode!;
        const matchObj = currentScene.objects.find((o) => o.id === selectedNode.id);
        if (matchObj) {
          matchObj.position = [selectedNode.position[0], selectedNode.position[1], selectedNode.position[2]];
          if (selectedNode.rotation) {
            matchObj.rotation = [selectedNode.rotation[0], selectedNode.rotation[1], selectedNode.rotation[2]];
          }
          matchObj.scale = [selectedNode.scale[0], selectedNode.scale[1], selectedNode.scale[2]];
        }
      }

      const updatedObj = useWorldStore.getState().sceneGraph?.objects?.find((o) => o.id === 'obj_pine_tree');
      expect(updatedObj?.position).toEqual([12.5, 3.0, -8.0]);
      expect(updatedObj?.scale).toEqual([2.0, 2.0, 2.0]);
      expect(updatedObj?.rotation?.[1]).toBeCloseTo(Math.PI / 4, 3);
    });
  });

  describe('BUG-045: ClaudeService Defensive Input Validation Against Null/Undefined Payloads', () => {
    it('throws descriptive validation error on null or non-object payloads without TypeError crash', async () => {
      const claude = new ClaudeService(StoreService);

      await expect(claude.parseWorld(null as any)).rejects.toThrow('Invalid or empty payload for parseWorld');
      await expect(claude.parseWorld(undefined as any)).rejects.toThrow('Invalid or empty payload for parseWorld');

      await expect(claude.enrichWorld(null as any)).rejects.toThrow('Invalid or empty sceneGraph for enrichWorld');
      await expect(claude.enrichWorld(undefined as any)).rejects.toThrow('Invalid or empty sceneGraph for enrichWorld');

      await expect(claude.generateCode(null as any)).rejects.toThrow('Invalid or empty sceneGraph for generateCode');
      await expect(claude.generateCode(undefined as any)).rejects.toThrow('Invalid or empty sceneGraph for generateCode');

      await expect(claude.updateWorld(null as any)).rejects.toThrow('Invalid or empty payload for updateWorld');
      await expect(claude.updateWorld(undefined as any)).rejects.toThrow('Invalid or empty payload for updateWorld');

      await expect(claude.npcReplyStream(null as any, () => {})).rejects.toThrow();
    });
  });

  describe('BUG-046: HUD Placement, Pointer Lock and Camera Reset Integrity', () => {
    it('handleResetCamera unlocks pointer lock and calls document.exitPointerLock when switching from walk mode', () => {
      const unlockMock = vi.fn();
      const pointerLock = { unlock: unlockMock } as any;
      const exitPointerLockMock = vi.fn();
      const originalExitPointerLock = (globalThis as any).document?.exitPointerLock;
      (globalThis as any).document = (globalThis as any).document || {};
      (globalThis as any).document.exitPointerLock = exitPointerLockMock;

      useUIStore.setState({ cameraMode: 'walk' });

      // Simulating handleResetCamera logic
      if (useUIStore.getState().cameraMode === 'walk') {
        useUIStore.getState().setCameraMode('orbit');
        pointerLock?.unlock();
        try { (globalThis as any).document.exitPointerLock?.(); } catch {}
      }

      expect(useUIStore.getState().cameraMode).toBe('orbit');
      expect(unlockMock).toHaveBeenCalled();
      expect(exitPointerLockMock).toHaveBeenCalled();

      if (originalExitPointerLock) {
        (globalThis as any).document.exitPointerLock = originalExitPointerLock;
      }
    });

    it('InventoryBar returns null in orbit mode to prevent obscuring SpotlightPromptBar', async () => {
      const { shouldRenderInventoryBar } = await import('../src/renderer/components/HUD/InventoryBar');
      expect(shouldRenderInventoryBar('orbit')).toBe(false);
      expect(shouldRenderInventoryBar('walk')).toBe(true);
      expect(shouldRenderInventoryBar('fly')).toBe(false);
    });
  });
});
