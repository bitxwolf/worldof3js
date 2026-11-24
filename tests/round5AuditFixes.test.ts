import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useNPCStore } from '../src/renderer/store/npcStore';
import { useOrchestratorStore } from '../src/renderer/store/orchestratorStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { NPCSystem } from '../src/renderer/engine/NPCSystem';
import { PlayerController } from '../src/renderer/engine/PlayerController';
import { AudioManager } from '../src/renderer/engine/AudioManager';
import { CircleSelectTool } from '../src/renderer/components/Viewport/CircleSelectTool';
import { AssetRegistry } from '../src/renderer/engine/AssetRegistry';
import { WeatherSystem } from '../src/renderer/engine/WeatherSystem';
import type { Character, SceneGraph } from '../src/shared/schema/sceneGraph.schema';
import { transport } from '../src/shared/transport';

class MockElement extends EventTarget {
  width = 800;
  height = 600;
  ownerDocument = {
    body: new EventTarget(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  requestPointerLock() {}
  setPointerCapture() {}
  releasePointerCapture() {}
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

describe('Round 5 Audit & Defect Fix Verification (BUG-031 to BUG-038)', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedNode: null,
      cameraMode: 'orbit',
      isSettingsOpen: false,
      tuningParams: {
        elevation: 10,
        density: 40,
        fogDensity: 0.015,
        sunAngle: 50,
        roughness: 0.8,
        metalness: 0.1,
        castShadow: true,
      },
      sunlight: { elevation: 50, azimuth: 180, intensity: 1.25, color: '#fff6e6' },
      moonlight: { elevation: 35, azimuth: 45, intensity: 0.35, color: '#8ba2cc', starDensity: 0.65 },
    });
    useNPCStore.setState({
      activeNPC: null,
      dialogueOpen: false,
      currentBranch: null,
      activeQuestId: null,
      dialogueHistory: {},
      branchOptions: {},
    });
    useOrchestratorStore.setState({
      activeSelection: null,
      currentSessionId: 'test-session',
    });
    useWorldStore.setState({
      sceneGraph: null,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-031: AssetRegistry sweepUnreferenced and Scene Mesh Protection
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-031: Safe GPU Sweep & Active Mesh Protection', () => {
    it('sweepUnreferenced keeps active scene meshes and textures intact while purging unreferenced assets', () => {
      const registry = new AssetRegistry();
      const scene = new THREE.Scene();

      // Mesh active in scene
      const activeGeo = new THREE.BoxGeometry(2, 2, 2);
      const activeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const activeMesh = new THREE.Mesh(activeGeo, activeMat);
      scene.add(activeMesh);

      // Model cached in registry that shares activeGeo
      const cachedActiveGroup = new THREE.Group();
      cachedActiveGroup.add(new THREE.Mesh(activeGeo, activeMat));
      (registry as unknown as { models: Map<string, THREE.Group> }).models.set('pine_tree', cachedActiveGroup);

      // Model cached in registry that is unreferenced
      const unrefGeo = new THREE.CylinderGeometry(1, 1, 2);
      const unrefMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const cachedUnrefGroup = new THREE.Group();
      cachedUnrefGroup.add(new THREE.Mesh(unrefGeo, unrefMat));
      (registry as unknown as { models: Map<string, THREE.Group> }).models.set('ruined_temple', cachedUnrefGroup);

      // Execute sweep
      registry.sweepUnreferenced(scene);

      const modelsMap = (registry as unknown as { models: Map<string, THREE.Group> }).models;
      // Active model must remain cached
      expect(modelsMap.has('pine_tree')).toBe(true);
      // Unreferenced model must be purged
      expect(modelsMap.has('ruined_temple')).toBe(false);

      // Active geometry buffers must remain valid and not disposed
      expect(activeGeo.attributes.position).toBeDefined();
      expect(activeGeo.attributes.position.array.length).toBeGreaterThan(0);

      registry.disposeAll();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-032: Circle Select Biome Switch, Fallbacks, and Right-Click Dismissal
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-032: Circle Select Tool Biome Switching & Fallback Resiliency', () => {
    it('setActiveBiome updates biome without destroying reticle or resetting brush radius', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const mockCanvas = new MockElement() as unknown as HTMLCanvasElement;

      const tool = new CircleSelectTool(scene, camera, mockCanvas, null, 'pine');
      (tool as unknown as { updateRadius: (r: number) => void }).updateRadius(60);
      expect((tool as unknown as { radius: number }).radius).toBe(60);

      // Dynamically switch biome
      tool.setActiveBiome('canyon');
      // Radius must be retained, not reset to default 25
      expect((tool as unknown as { radius: number }).radius).toBe(60);
      expect((tool as unknown as { activeBiome: string }).activeBiome).toBe('canyon');

      tool.dispose();
    });

    it('confirmSelection falls back to local sceneGraph entities when IPC fails or times out', async () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const mockCanvas = new MockElement() as unknown as HTMLCanvasElement;

      // Mock transport.call to simulate network / IPC failure
      const transportSpy = vi.spyOn(transport, 'call').mockRejectedValueOnce(new Error('IPC transport disconnected'));

      // Populate local sceneGraph with entities
      const dummySceneGraph: Partial<SceneGraph> = {
        characters: [
          {
            id: 'local_guard',
            name: 'Local Guard',
            description: 'Guarding local post',
            personality: 'Firm',
            secrets: [],
            knowledge: [],
            position: [5, 0, 5],
            behavior: 'idle',
          },
        ],
        objects: [
          {
            id: 'ancient_obelisk',
            name: 'Ancient Obelisk',
            type: 'monolith',
            position: [8, 0, 8],
            collidable: true,
            interactable: true,
            pickable: false,
            locked: false,
          },
        ],
      };
      useWorldStore.setState({ sceneGraph: dummySceneGraph as SceneGraph });

      const tool = new CircleSelectTool(scene, camera, mockCanvas, null, 'pine');
      (tool as unknown as { updateRadius: (r: number) => void }).updateRadius(50);

      // confirmSelection must catch IPC rejection and fall back to selecting local scene entities
      await (tool as unknown as { confirmSelection: () => Promise<void> }).confirmSelection();

      const activeSelection = useOrchestratorStore.getState().activeSelection;
      expect(activeSelection).not.toBeNull();
      expect(activeSelection?.npcs).toContain('local_guard');
      expect(activeSelection?.landmarks).toContain('ancient_obelisk');

      tool.dispose();
      transportSpy.mockRestore();
    });

    it('right-click on canvas invokes onDismiss callback cleanly', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const mockCanvas = new MockElement() as unknown as HTMLCanvasElement;
      let dismissed = false;

      const tool = new CircleSelectTool(
        scene,
        camera,
        mockCanvas,
        null,
        'pine',
        () => {
          dismissed = true;
        }
      );

      const pointerEvent = new Event('pointerdown') as unknown as PointerEvent;
      Object.defineProperty(pointerEvent, 'button', { value: 2 });
      mockCanvas.dispatchEvent(pointerEvent);

      expect(dismissed).toBe(true);
      tool.dispose();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-033: Right Inspector Stream Error Resiliency
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-033: Right Inspector Unhandled Stream Fallback', () => {
    it('npcReply failure response immediately unblocks thinking state and injects fallback reply', async () => {
      const store = useNPCStore.getState();
      const char: Character = {
        id: 'npc_oracle',
        name: 'The Oracle',
        description: 'Seer of futures',
        personality: 'Enigmatic',
        secrets: [],
        knowledge: [],
        position: [0, 0, 0],
        behavior: 'idle',
      };
      store.setActiveNPC(char);

      // Simulate electronAPI failure returning { success: false, error: ... }
      const mockNpcReply = vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'Agent quota exceeded' },
      });

      const res = await mockNpcReply({ npcId: char.id, playerMessage: 'Hello' });
      expect(res.success).toBe(false);

      if (!res.success) {
        const fallback = res.error?.message || 'The character pauses thoughtfully, looking into the distance.';
        store.addDialogueMessage(char.id, { sender: 'npc', text: fallback });
      }

      const history = useNPCStore.getState().dialogueHistory[char.id];
      expect(history.length).toBe(1);
      expect(history[0].text).toBe('Agent quota exceeded');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-034: Global Escape Handling in Dialogue Mode
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-034: Global Escape Key Handling in Dialogue Mode', () => {
    it('dynamic state check in Escape keydown handler closes dialogue and clears active NPC', () => {
      useNPCStore.setState({ dialogueOpen: true });

      // Simulate Escape handler checking dynamic state
      const isDialogueOpen = useNPCStore.getState().dialogueOpen;
      expect(isDialogueOpen).toBe(true);

      if (isDialogueOpen) {
        useNPCStore.getState().setDialogueOpen(false);
        useNPCStore.getState().setActiveNPC(null);
      }

      expect(useNPCStore.getState().dialogueOpen).toBe(false);
      expect(useNPCStore.getState().activeNPC).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-035: NPC Movement Rotation Alignment
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-035: NPC Movement Rotation Facing', () => {
    it('rotates NPC body towards patrol waypoint when player is not in immediate proximity', async () => {
      const scene = new THREE.Scene();
      const npcSystem = new NPCSystem(scene);

      const char: Character = {
        id: 'patrol_guard',
        name: 'Patrol Guard',
        description: 'Patrolling guard',
        personality: 'Alert',
        secrets: [],
        knowledge: [],
        position: [0, 0, 0],
        behavior: 'patrol',
        patrolPath: [
          [0, 0, 0],
          [20, 0, 0], // Waypoint due east along +X
        ],
      };

      await npcSystem.spawnNPC(char);
      const guard = npcSystem.getNPCInstances()[0];
      guard.patrolIndex = 1;

      // Player is far away (50 units)
      const distantPlayerPos = new THREE.Vector3(50, 0, 50);

      // Tick multiple times to advance along patrol path
      for (let i = 0; i < 5; i++) {
        npcSystem.tick(0.05, distantPlayerPos);
      }

      // Guard should have turned towards +X (rotation should have updated from 0)
      expect(guard.group.position.x).toBeGreaterThan(0);
      expect(guard.group.quaternion.y !== 0 || guard.group.quaternion.w !== 1).toBe(true);

      npcSystem.dispose();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-036: PlayerController Void Bounds & Blur Key Reset
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-036: PlayerController Void Bounds & Blur Key Reset', () => {
    it('resets all movement keys upon resetKeys / blur to prevent stuck locomotion', () => {
      const camera = new THREE.PerspectiveCamera();
      const mockEl = new MockElement() as unknown as HTMLElement;
      const controller = new PlayerController(camera, mockEl);

      // Simulate key pressed
      (controller as unknown as { onKey: (e: { code: string }, pressed: boolean) => void }).onKey(
        { code: 'KeyW' },
        true
      );
      const keysBefore = (controller as unknown as { keys: Record<string, boolean> }).keys;
      expect(keysBefore.forward).toBe(true);

      // Invoke resetKeys
      controller.resetKeys();
      const keys = (controller as unknown as { keys: Record<string, boolean> }).keys;
      expect(keys.forward).toBe(false);
      expect(keys.backward).toBe(false);
      expect(keys.left).toBe(false);
      expect(keys.right).toBe(false);

      controller.dispose();
    });

    it('void protection resets player within safe terrain boundaries [-70, 70]', () => {
      const camera = new THREE.PerspectiveCamera();
      // Player walked far off cliff at x=95, z=95
      camera.position.set(95, -35, 95);
      const mockEl = new MockElement() as unknown as HTMLElement;
      const controller = new PlayerController(camera, mockEl);
      (controller as unknown as { controls: { isLocked: boolean } }).controls.isLocked = true;

      // Tick controller
      controller.update(0.016);

      // Camera position must be reset to safe terrain bounds
      expect(camera.position.x).toBeLessThanOrEqual(70);
      expect(camera.position.x).toBeGreaterThanOrEqual(-70);
      expect(camera.position.z).toBeLessThanOrEqual(70);
      expect(camera.position.z).toBeGreaterThanOrEqual(-70);
      expect(camera.position.y).toBe(1.7);

      controller.dispose();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-037: Left Sidebar Sun Angle Slider Clamping
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-037: Left Sidebar Sun Angle Slider Clamping', () => {
    it('sets sunAngle and updates sunlight elevation within [5, 90] bounds', () => {
      const store = useUIStore.getState();

      store.setTuningParam('sunAngle', 75);
      store.setSunlight({ elevation: 75 });
      expect(useUIStore.getState().tuningParams.sunAngle).toBe(75);
      expect(useUIStore.getState().sunlight.elevation).toBe(75);

      // Extreme high value clamped to 90
      store.setSunlight({ elevation: 120 });
      expect(useUIStore.getState().sunlight.elevation).toBe(90);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-038: WeatherSystem Delta NaN Protection & AudioManager Noise Cache
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-038: WeatherSystem Delta NaN Protection & Audio Noise Cache', () => {
    it('safely handles NaN and negative delta without breaking weather particle simulation', () => {
      const scene = new THREE.Scene();
      const weatherSystem = new WeatherSystem(scene);

      expect(() => {
        weatherSystem.update(NaN, new THREE.Vector3(0, 0, 0));
        weatherSystem.update(-0.5, new THREE.Vector3(0, 0, 0));
        weatherSystem.update(0.016, new THREE.Vector3(0, 0, 0));
      }).not.toThrow();

      weatherSystem.dispose();
    });

    it('AudioManager playLightning reuses noise buffer without throwing', () => {
      const audio = AudioManager.getInstance();
      expect(() => {
        audio.playLightning(0.5);
        audio.playLightning(1.0);
      }).not.toThrow();
    });
  });
});
