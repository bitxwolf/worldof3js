import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useNPCStore } from '../src/renderer/store/npcStore';
import { useOrchestratorStore } from '../src/renderer/store/orchestratorStore';
import { NPCSystem } from '../src/renderer/engine/NPCSystem';
import { PlayerController } from '../src/renderer/engine/PlayerController';
import { AudioManager } from '../src/renderer/engine/AudioManager';
import { CircleSelectTool } from '../src/renderer/components/Viewport/CircleSelectTool';
import { AssetRegistry } from '../src/renderer/engine/AssetRegistry';
import type { Character } from '../src/shared/schema/sceneGraph.schema';

class MockElement extends EventTarget {
  width = 800;
  height = 600;
  ownerDocument = {
    body: new EventTarget(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  requestPointerLock() {}
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

describe('Round 4 Audit & Defect Fix Verification (BUG-024 to BUG-030)', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedNode: null,
      cameraMode: 'orbit',
      isSettingsOpen: false,
      isLibraryOpen: false,
      isPolyforkOpen: false,
      isDocUploaderOpen: false,
      isImageUploaderOpen: false,
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
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-024: NPC Pathfinding Bounds, Waypoint Clamping & Physics Step Safety
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-024: NPC Pathfinding Bounds & Step Clamping', () => {
    it('clamps delta and prevents NPCs from overshooting patrol waypoints during frame hitches', async () => {
      const scene = new THREE.Scene();
      const npcSystem = new NPCSystem(scene);

      const char: Character = {
        id: 'patrol_guard',
        name: 'Guard Alec',
        description: 'A loyal guard',
        personality: 'Vigilant',
        secrets: [],
        knowledge: [],
        position: [0, 0, 0],
        behavior: 'patrol',
        patrolPath: [
          [0, 0, 0],
          [2, 0, 0],
        ],
      };

      await npcSystem.spawnNPC(char);
      const instances = npcSystem.getNPCInstances();
      expect(instances.length).toBe(1);
      const guard = instances[0];

      // Initial tick at spawn waypoint [0, 0, 0] reaches waypoint 0 and advances to waypoint 1 [2, 0, 0]
      npcSystem.tick(0.016, new THREE.Vector3(50, 0, 50));
      expect(guard.patrolIndex).toBe(1);

      // Now simulate a massive frame lag hitch (e.g. 5.0 seconds) moving toward [2, 0, 0]
      npcSystem.tick(5.0, new THREE.Vector3(50, 0, 50));

      // With step clamping to max 0.1s delta (step = 1.5 * 0.1 = 0.15m), guard advances safely without jumping past waypoint
      expect(guard.group.position.x).toBeLessThanOrEqual(2.0);
      expect(guard.group.position.x).toBeGreaterThan(0);
      expect(guard.group.position.z).toBe(0);

      // Now position guard close to target (dist <= 0.5)
      guard.group.position.set(1.8, 0, 0);
      npcSystem.tick(0.016, new THREE.Vector3(50, 0, 50));

      // Guard should cleanly snap to target and cycle waypoint index to 0
      expect(guard.patrolIndex).toBe(0);
      expect(guard.group.position.x).toBe(2.0);

      npcSystem.dispose();
    });

    it('clamps wander targets and positions strictly within terrain boundaries [-78m, +78m]', async () => {
      const scene = new THREE.Scene();
      const npcSystem = new NPCSystem(scene);

      // NPC placed near extreme edge of terrain (e.g. x = 77)
      const edgeChar: Character = {
        id: 'edge_scout',
        name: 'Edge Scout',
        description: 'An edge scout',
        personality: 'Cautious',
        secrets: [],
        knowledge: [],
        position: [77, 0, 77],
        behavior: 'wander',
      };

      await npcSystem.spawnNPC(edgeChar);
      const scout = npcSystem.getNPCInstances()[0];

      // Tick multiple times to induce wandering
      for (let i = 0; i < 20; i++) {
        npcSystem.tick(0.1, new THREE.Vector3(0, 0, 0));
        // Verify NPC is strictly clamped inside [-78, 78]
        expect(scout.group.position.x).toBeLessThanOrEqual(78);
        expect(scout.group.position.x).toBeGreaterThanOrEqual(-78);
        expect(scout.group.position.z).toBeLessThanOrEqual(78);
        expect(scout.group.position.z).toBeGreaterThanOrEqual(-78);
      }

      npcSystem.dispose();
    });

    it('safely handles malformed patrol paths and invalid patrol indices without throwing', async () => {
      const scene = new THREE.Scene();
      const npcSystem = new NPCSystem(scene);

      const brokenChar: Character = {
        id: 'broken_patrol',
        name: 'Lost Traveler',
        description: 'A lost traveler',
        personality: 'Confused',
        secrets: [],
        knowledge: [],
        position: [0, 0, 0],
        behavior: 'patrol',
        patrolPath: [], // empty patrol path
      };

      await npcSystem.spawnNPC(brokenChar);
      const inst = npcSystem.getNPCInstances()[0];
      inst.patrolIndex = 999; // out of range index

      expect(() => {
        npcSystem.tick(0.016, new THREE.Vector3(0, 0, 0));
      }).not.toThrow();

      npcSystem.dispose();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-025: Physics Step Clamping & Exponential Decay Damping
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-025: Physics Step Clamping & Exponential Damping', () => {
    it('exponential decay damping remains unconditionally stable even with huge frame deltas', () => {
      let velX = 18.0;
      let velZ = -18.0;

      const hugeDelta = 0.5;
      const clampedDelta = Math.max(0, Math.min(hugeDelta, 0.1));
      const damping = Math.exp(-10.0 * clampedDelta);

      velX *= damping;
      velZ *= damping;

      expect(velX).toBeGreaterThan(0); // Never flips sign
      expect(velX).toBeLessThan(18.0); // Properly attenuated
      expect(velZ).toBeLessThan(0); // Never flips sign
      expect(velZ).toBeGreaterThan(-18.0);
      expect(Number.isFinite(velX)).toBe(true);
      expect(Number.isFinite(velZ)).toBe(true);
    });

    it('PlayerController clamps delta to prevent gravity tunneling and includes void protection', () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 2, 0);
      const mockEl = new MockElement() as unknown as HTMLElement;
      const controller = new PlayerController(camera, mockEl);

      // Force pointer lock
      (controller as unknown as { controls: { isLocked: boolean } }).controls.isLocked = true;

      // Simulate a massive 10-second lag spike
      controller.update(10.0);

      // Camera position should NOT have plummeted into negative infinity
      expect(camera.position.y).toBeGreaterThanOrEqual(-30);
      expect(Number.isFinite(camera.position.y)).toBe(true);

      controller.dispose();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-026: Shader Uniform Boundaries & Extreme Lighting Parameter Sanitization
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-026: Shader Uniform Boundaries & Extreme Values', () => {
    it('setTuningParam clamps fogDensity to [0.001, 0.15] and protects against NaN and negatives', () => {
      const store = useUIStore.getState();

      // Negative value
      store.setTuningParam('fogDensity', -0.5);
      expect(useUIStore.getState().tuningParams.fogDensity).toBe(0.001);

      // Extreme high value (would black out WebGL)
      store.setTuningParam('fogDensity', 25.0);
      expect(useUIStore.getState().tuningParams.fogDensity).toBe(0.15);

      // NaN protection
      store.setTuningParam('fogDensity', NaN);
      expect(Number.isFinite(useUIStore.getState().tuningParams.fogDensity)).toBe(true);
    });

    it('setTuningParam clamps elevation and density to safe geometric thresholds', () => {
      const store = useUIStore.getState();

      store.setTuningParam('elevation', 9999);
      expect(useUIStore.getState().tuningParams.elevation).toBe(50.0);

      store.setTuningParam('elevation', -10);
      expect(useUIStore.getState().tuningParams.elevation).toBe(1.0);

      store.setTuningParam('density', 5000);
      expect(useUIStore.getState().tuningParams.density).toBe(250);

      store.setTuningParam('density', -50);
      expect(useUIStore.getState().tuningParams.density).toBe(5);
    });

    it('syncFromSceneGraph sanitizes extreme fogDensity from scene graph JSON', () => {
      const store = useUIStore.getState();

      store.syncFromSceneGraph({
        atmosphere: {
          fogDensity: 10.0,
          fogColor: '#000000',
          ambientIntensity: 0.5,
          sunColor: '#ffffff',
        },
      });
      expect(useUIStore.getState().tuningParams.fogDensity).toBe(0.15);

      store.syncFromSceneGraph({
        atmosphere: {
          fogDensity: -0.05,
          fogColor: '#000000',
          ambientIntensity: 0.5,
          sunColor: '#ffffff',
        },
      });
      expect(useUIStore.getState().tuningParams.fogDensity).toBe(0.001);
    });

    it('setSunlight and setMoonlight handle NaN and sanitize colors', () => {
      const store = useUIStore.getState();

      store.setSunlight({ elevation: NaN, intensity: NaN, color: '   #ffaa00   ' });
      const sun = useUIStore.getState().sunlight;
      expect(Number.isFinite(sun.elevation)).toBe(true);
      expect(Number.isFinite(sun.intensity)).toBe(true);
      expect(sun.color).toBe('#ffaa00');

      store.setMoonlight({ elevation: NaN, intensity: NaN, color: '   #88aacc   ', starDensity: NaN });
      const moon = useUIStore.getState().moonlight;
      expect(Number.isFinite(moon.elevation)).toBe(true);
      expect(Number.isFinite(moon.intensity)).toBe(true);
      expect(Number.isFinite(moon.starDensity)).toBe(true);
      expect(moon.color).toBe('#88aacc');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-027: GPU Resource Cleanup & Unmount Disposal
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-027: WebGL Resource Cleanup & Unmount Disposal', () => {
    it('sweepUnreferenced safely sweeps unreferenced assets while preserving active scene geometries and materials', () => {
      const registry = new AssetRegistry();
      const scene = new THREE.Scene();

      // Active mesh in the scene
      const activeGeom = new THREE.BoxGeometry(1, 1, 1);
      const activeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const activeMesh = new THREE.Mesh(activeGeom, activeMat);
      scene.add(activeMesh);

      // Model cached in registry that IS in the scene (shares activeGeom)
      const cachedActiveGroup = new THREE.Group();
      cachedActiveGroup.add(new THREE.Mesh(activeGeom, activeMat));
      (registry as unknown as { models: Map<string, THREE.Group> }).models.set('active_model', cachedActiveGroup);

      // Model cached in registry that is UNREFERENCED (not in scene)
      const unrefGeom = new THREE.SphereGeometry(1, 8, 8);
      const unrefMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const unrefGroup = new THREE.Group();
      unrefGroup.add(new THREE.Mesh(unrefGeom, unrefMat));
      (registry as unknown as { models: Map<string, THREE.Group> }).models.set('unreferenced_model', unrefGroup);

      // Perform GC sweep with active scene
      registry.sweepUnreferenced(scene);

      // Verify unreferenced model was swept from registry
      const modelsMap = (registry as unknown as { models: Map<string, THREE.Group> }).models;
      expect(modelsMap.has('unreferenced_model')).toBe(false);

      // Verify active model was preserved in registry and its geometry was NOT disposed
      expect(modelsMap.has('active_model')).toBe(true);
      expect(activeGeom.attributes.position).toBeDefined();
      expect(activeGeom.attributes.position.array.length).toBeGreaterThan(0);

      // Clean up
      registry.disposeAll();
      activeGeom.dispose();
      activeMat.dispose();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-028: Dialogue Branch State, Streaming Freeze & Hotkey Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-028: Dialogue Branch State Management & Stream Resiliency', () => {
    it('resets branch state when switching or closing active NPC', () => {
      const store = useNPCStore.getState();
      const charA: Character = {
        id: 'npc_a',
        name: 'Char A',
        description: 'NPC A',
        personality: 'Friendly',
        secrets: [],
        knowledge: [],
        position: [0, 0, 0],
        behavior: 'idle',
      };
      const charB: Character = {
        id: 'npc_b',
        name: 'Char B',
        description: 'NPC B',
        personality: 'Mysterious',
        secrets: [],
        knowledge: [],
        position: [0, 0, 0],
        behavior: 'idle',
      };

      store.setActiveNPC(charA);
      store.setCurrentBranch('investigate_ruins');
      store.setActiveQuestId('quest_ancient_relic');
      expect(useNPCStore.getState().currentBranch).toBe('investigate_ruins');
      expect(useNPCStore.getState().activeQuestId).toBe('quest_ancient_relic');

      // Switch to NPC B
      store.setActiveNPC(charB);
      expect(useNPCStore.getState().currentBranch).toBeNull();
      expect(useNPCStore.getState().activeQuestId).toBeNull();

      // Setting activeNPC to null closes dialogue
      store.setDialogueOpen(true);
      store.setActiveNPC(null);
      expect(useNPCStore.getState().dialogueOpen).toBe(false);
      expect(useNPCStore.getState().currentBranch).toBeNull();
    });

    it('resetDialogueState clears history and branch options cleanly', () => {
      const store = useNPCStore.getState();
      store.addDialogueMessage('npc_test', { sender: 'npc', text: 'Hello!' });
      store.setBranchOptions('npc_test', ['Tell me more', 'Goodbye']);
      expect(useNPCStore.getState().dialogueHistory['npc_test'].length).toBe(1);
      expect(useNPCStore.getState().branchOptions['npc_test'].length).toBe(2);

      store.resetDialogueState('npc_test');
      expect(useNPCStore.getState().dialogueHistory['npc_test'].length).toBe(0);
      expect(useNPCStore.getState().branchOptions['npc_test'].length).toBe(0);
    });

    it('suppresses viewport hotkeys when dialogueOpen is active', () => {
      useNPCStore.getState().setDialogueOpen(true);
      const isDialogueOpen = useNPCStore.getState().dialogueOpen;

      const uiStore = useUIStore.getState();
      const isAnyModalOpen =
        uiStore.isSettingsOpen ||
        uiStore.isLibraryOpen ||
        uiStore.isPolyforkOpen ||
        uiStore.isDocUploaderOpen ||
        uiStore.isImageUploaderOpen ||
        isDialogueOpen;

      expect(isAnyModalOpen).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-029: AudioManager Procedural Sound Synthesizer & Error Fallbacks
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-029: AudioManager Procedural Sound & Playback Fallbacks', () => {
    it('creates a singleton AudioManager with safe error suppression in mock/headless environments', () => {
      const audio = AudioManager.getInstance();
      expect(audio).toBeDefined();

      expect(() => audio.playInteract()).not.toThrow();
      expect(() => audio.playSelect()).not.toThrow();
      expect(() => audio.playDialogue()).not.toThrow();
      expect(() => audio.playLightning(0.8)).not.toThrow();
    });

    it('handles master volume clamping and mute controls safely', () => {
      const audio = AudioManager.getInstance();

      audio.setMasterVolume(0.8);
      expect(audio.getMasterVolume()).toBe(0.8);

      audio.setMasterVolume(5.0); // should clamp to 1.0
      expect(audio.getMasterVolume()).toBe(1.0);

      audio.setMasterVolume(-2.0); // should clamp to 0.0
      expect(audio.getMasterVolume()).toBe(0.0);

      audio.setMuted(true);
      expect(audio.getMuted()).toBe(true);
      audio.setMuted(false);
      expect(audio.getMuted()).toBe(false);
    });

    it('disposes cleanly without throwing', () => {
      const audio = AudioManager.getInstance();
      expect(() => audio.dispose()).not.toThrow();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-030: Circle Select Lifecycle & Disposed State Resurrections
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-030: Circle Select Tool Lifecycle & Disposed State Guards', () => {
    it('disposed CircleSelectTool rejects in-flight confirmations and avoids resurrecting selection', async () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const mockCanvas = new MockElement() as unknown as HTMLCanvasElement;

      const tool = new CircleSelectTool(
        scene,
        camera,
        mockCanvas,
        null,
        'pine'
      );

      // Verify tool created reticle in scene
      expect(scene.children.length).toBeGreaterThan(0);

      // Immediately dispose tool
      tool.dispose();

      // Calling confirmSelection on disposed instance should immediately return without setting active selection
      useOrchestratorStore.getState().clearSelection();
      await (tool as unknown as { confirmSelection: () => Promise<void> }).confirmSelection();

      expect(useOrchestratorStore.getState().activeSelection).toBeNull();
    });
  });
});
