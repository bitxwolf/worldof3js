import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CircleSelectTool } from '../src/renderer/components/Viewport/CircleSelectTool';
import { useOrchestratorStore } from '../src/renderer/store/orchestratorStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { transport } from '../src/shared/transport';

class MockCanvas extends EventTarget {
  width = 800;
  height = 600;
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
  shiftKey: boolean;
  movementY: number;

  constructor(type: string, init?: { button?: number; clientX?: number; clientY?: number; shiftKey?: boolean; movementY?: number }) {
    super(type);
    this.button = init?.button ?? 0;
    this.clientX = init?.clientX ?? 0;
    this.clientY = init?.clientY ?? 0;
    this.shiftKey = init?.shiftKey ?? false;
    this.movementY = init?.movementY ?? 0;
  }
}

class MockWheelEvent extends Event {
  deltaY: number;
  constructor(type: string, init?: { deltaY?: number }) {
    super(type);
    this.deltaY = init?.deltaY ?? 0;
  }
  preventDefault() {}
}

describe('CircleSelectTool & Hotkey (C) Area Selection', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let canvas: MockCanvas;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 50, 50);
    camera.lookAt(0, 0, 0);

    canvas = new MockCanvas();

    useOrchestratorStore.setState({
      currentSessionId: null,
      activeSelection: null,
      status: 'idle',
      error: null,
    });

    useWorldStore.setState({
      sceneGraph: null,
    });
  });

  it('initializes reticle in scene with correct geometry, rotation, and default radius', () => {
    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');

    // Reticle should be added to the scene
    const reticles = scene.children.filter((c) => c instanceof THREE.Group);
    expect(reticles.length).toBe(1);
    const reticle = reticles[0];

    // Normal should point up (rotation.x = -Math.PI / 2)
    expect(reticle.rotation.x).toBeCloseTo(-Math.PI / 2, 4);
    // Scale corresponds to default radius = 25
    expect(reticle.scale.x).toBe(25);
    expect(reticle.scale.y).toBe(25);

    tool.dispose();
  });

  it('clamps radius on wheel event between 5 and 100', () => {
    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');
    const reticle = scene.children[0] as THREE.Group;

    // Simulate wheel zoom in (decrease radius)
    const wheelIn = new MockWheelEvent('wheel', { deltaY: -500 });
    canvas.dispatchEvent(wheelIn);
    expect(reticle.scale.x).toBeGreaterThanOrEqual(5);

    // Simulate wheel zoom out past max limit
    const wheelOut = new MockWheelEvent('wheel', { deltaY: 2000 });
    canvas.dispatchEvent(wheelOut);
    expect(reticle.scale.x).toBeLessThanOrEqual(100);

    tool.dispose();
  });

  it('populates SelectionContext and activeSelection when confirmSelection runs with graph nodes', async () => {
    vi.spyOn(transport, 'call').mockResolvedValueOnce({
      success: true,
      data: {
        nodes: [
          { id: 'reg_pine_1', type: 'region', attrs: {}, x: 0, z: 0 },
          { id: 'npc_guard', type: 'npc', attrs: {}, x: 2, z: 2 },
          { id: 'lm_tower', type: 'landmark', attrs: {}, x: -3, z: 1 },
          { id: 'quest_watch', type: 'quest', attrs: {}, x: 0, z: 0 },
        ],
      },
    } as any);

    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');

    // Trigger pointerdown then pointerup to trigger confirmSelection
    canvas.dispatchEvent(new MockPointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new MockPointerEvent('pointerup', { button: 0, clientX: 400, clientY: 300 }));

    // Wait microtask for async confirmSelection
    await new Promise((r) => setTimeout(r, 20));

    const selection = useOrchestratorStore.getState().activeSelection;
    expect(selection).not.toBeNull();
    expect(selection?.regions).toContain('reg_pine_1');
    expect(selection?.npcs).toContain('npc_guard');
    expect(selection?.landmarks).toContain('lm_tower');
    expect(selection?.activeQuests).toContain('quest_watch');
    expect(selection?.biome).toBe('pine');
    expect(useOrchestratorStore.getState().currentSessionId).toBeDefined();

    tool.dispose();
    vi.restoreAllMocks();
  });

  it('falls back to local sceneGraph when graph query returns empty nodes', async () => {
    // Return empty nodes from graph store
    vi.spyOn(transport, 'call').mockResolvedValueOnce({
      success: true,
      data: { nodes: [] },
    } as any);

    // Populate local sceneGraph in worldStore
    useWorldStore.setState({
      sceneGraph: {
        world: {
          name: 'Local World',
          description: 'A test world',
          biome: 'forest',
          timeOfDay: 'afternoon',
          weather: 'clear',
          scale: 'small',
        },
        characters: [
          { id: 'npc_local_ranger', name: 'Ranger', description: 'Wise ranger', personality: 'brave', position: [0, 0, 0] },
          { id: 'npc_far_away', name: 'Far NPC', description: 'Too far', personality: 'shy', position: [200, 0, 200] },
        ],
        objects: [
          { id: 'obj_bonfire', name: 'Campfire', type: 'landmark', position: [5, 0, 5], collidable: true, interactable: false },
          { id: 'obj_far_rock', name: 'Far Rock', type: 'prop', position: [300, 0, 300], collidable: true, interactable: false },
        ],
        zones: [
          { id: 'zone_center', name: 'Center Grove', bounds: { center: [0, 0, 0], radius: 10 } },
        ],
      } as any,
    });

    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');

    canvas.dispatchEvent(new MockPointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new MockPointerEvent('pointerup', { button: 0, clientX: 400, clientY: 300 }));

    await new Promise((r) => setTimeout(r, 20));

    const selection = useOrchestratorStore.getState().activeSelection;
    expect(selection).not.toBeNull();
    // Nearby entities should be selected
    expect(selection?.npcs).toContain('npc_local_ranger');
    expect(selection?.npcs).not.toContain('npc_far_away');
    expect(selection?.landmarks).toContain('obj_bonfire');
    expect(selection?.landmarks).not.toContain('obj_far_rock');
    expect(selection?.regions).toContain('zone_center');

    tool.dispose();
    vi.restoreAllMocks();
  });

  it('orchestratorStore.editSelection automatically initializes default-session and handles error when no selection', async () => {
    // 1. When no active selection, should fail gracefully
    useOrchestratorStore.setState({ activeSelection: null, currentSessionId: null });
    const resultNoSel = await useOrchestratorStore.getState().editSelection('Add a shrine');
    expect(resultNoSel).toBeNull();
    expect(useOrchestratorStore.getState().error).toBe('No active selection to edit');

    // 2. When activeSelection is present and currentSessionId was null, it assigns default-session
    useOrchestratorStore.setState({
      activeSelection: {
        center: { x: 0, z: 0 },
        radiusWorldUnits: 25,
        regions: [],
        npcs: [],
        landmarks: [],
        activeQuests: [],
        biome: 'pine',
      },
      currentSessionId: null,
    });

    vi.spyOn(transport, 'call').mockResolvedValueOnce({
      success: true,
      data: {
        sessionId: 'default-session',
        activeBiome: 'pine',
        sceneGraph: { world: { name: 'Edited' } },
      },
    } as any);

    const result = await useOrchestratorStore.getState().editSelection('Add a watchtower');
    expect(result).not.toBeNull();
    expect(useOrchestratorStore.getState().currentSessionId).toBe('default-session');
    expect(useOrchestratorStore.getState().status).toBe('idle');

    vi.restoreAllMocks();
  });

  it('cleans up and disposes all GPU resources and reticle on dispose() without throwing', () => {
    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');
    expect(scene.children.length).toBe(1);

    expect(() => tool.dispose()).not.toThrow();
    expect(scene.children.length).toBe(0);
  });

  it('supports dynamic terrain getter and updates reticle depthTest to prevent mountain clipping', () => {
    const terrainGeo = new THREE.PlaneGeometry(100, 100);
    const terrainMat = new THREE.MeshBasicMaterial();
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.position.y = 10;
    scene.add(terrain);

    let currentTerrain: THREE.Mesh | null = null;
    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, () => currentTerrain, 'pine');

    const reticleGroup = scene.children.find((c) => c instanceof THREE.Group && (c as unknown) !== terrain) as THREE.Group;
    expect(reticleGroup).toBeDefined();

    // Verify depthTest is false on reticle materials to prevent mountain peak occlusion
    reticleGroup.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.material.depthTest).toBe(false);
      }
    });

    // Dynamically provide newly generated terrain mesh
    currentTerrain = terrain;
    // Moving pointer should raycast against the dynamic terrain
    canvas.dispatchEvent(new MockPointerEvent('pointermove', { button: 0, clientX: 400, clientY: 300 }));

    tool.dispose();
    terrainGeo.dispose();
    terrainMat.dispose();
  });

  it('debounces confirmSelection on rapid wheel events to prevent notification spam', async () => {
    const transportSpy = vi.spyOn(transport, 'call').mockResolvedValue({
      success: true,
      data: { nodes: [] },
    } as any);

    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');

    // Rapid wheel ticks
    for (let i = 0; i < 5; i++) {
      canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: -10 }));
    }

    // Immediately after wheel events, transport.call should not have been spammed 5 times
    expect(transportSpy).not.toHaveBeenCalled();

    // Wait for debounce timer (150ms)
    await new Promise((r) => setTimeout(r, 200));
    expect(transportSpy).toHaveBeenCalledTimes(1);

    tool.dispose();
    vi.restoreAllMocks();
  });

  it('merges graph nodes with sceneGraph entities without dropping sceneGraph characters/landmarks when graph returns nodes', async () => {
    // Return 1 region node from SQLite graph
    vi.spyOn(transport, 'call').mockResolvedValueOnce({
      success: true,
      data: {
        nodes: [
          { id: 'reg_pine_1', type: 'region', attrs: {}, x: 0, z: 0 },
        ],
      },
    } as any);

    // Populate local sceneGraph with a character and an object
    useWorldStore.setState({
      sceneGraph: {
        world: {
          name: 'Merged World',
          description: 'A test world',
          biome: 'forest',
          timeOfDay: 'morning',
          weather: 'clear',
          scale: 'small',
        },
        characters: [
          { id: 'npc_in_circle', name: 'Knight', description: 'Brave knight', personality: 'honorable', position: [2, 0, 2] },
        ],
        objects: [
          { id: 'obj_in_circle', name: 'Statue', type: 'landmark', position: [-2, 0, 1], collidable: true, interactable: true },
        ],
        zones: [],
      } as any,
    });

    const tool = new CircleSelectTool(scene, camera, canvas as unknown as HTMLCanvasElement, null, 'pine');

    canvas.dispatchEvent(new MockPointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new MockPointerEvent('pointerup', { button: 0, clientX: 400, clientY: 300 }));

    await new Promise((r) => setTimeout(r, 30));

    const selection = useOrchestratorStore.getState().activeSelection;
    expect(selection).not.toBeNull();
    // Both graph region AND sceneGraph character & landmark must be present
    expect(selection?.regions).toContain('reg_pine_1');
    expect(selection?.npcs).toContain('npc_in_circle');
    expect(selection?.landmarks).toContain('obj_in_circle');

    tool.dispose();
    vi.restoreAllMocks();
  });
});
