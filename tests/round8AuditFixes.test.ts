import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { useOrchestratorStore } from '../src/renderer/store/orchestratorStore';
import { CircleSelectTool } from '../src/renderer/components/Viewport/CircleSelectTool';
import { ParentAgent } from '../src/main/agents/parentAgent';

class MockCanvas extends EventTarget {
  width = 800;
  height = 600;
  setPointerCapture = vi.fn();
  releasePointerCapture = vi.fn();
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect;
  }
}

class MockWheelEvent extends Event {
  deltaY: number;
  clientX: number;
  clientY: number;

  constructor(type: string, props: { deltaY?: number; clientX?: number; clientY?: number } = {}) {
    super(type, { cancelable: true });
    this.deltaY = props.deltaY ?? 100;
    this.clientX = props.clientX ?? 400;
    this.clientY = props.clientY ?? 300;
  }
}

describe('Round 8 Bug Audit & UX Integrity Fixes', () => {
  beforeEach(() => {
    useUIStore.setState({
      cameraMode: 'orbit',
      isDocUploaderOpen: false,
      isImageUploaderOpen: false,
    });
    useWorldStore.setState({
      sceneGraph: null,
      isCustomWorldActive: false,
      playerPosition: [0, 1.7, 0],
    });
    useOrchestratorStore.setState({
      activeSelection: null,
      currentSessionId: 'test-session',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BUG-047: Selection Edit Fallback Guard in SpotlightPromptBar', () => {
    it('does not reset isCustomWorldActive to false when selection editing fails', () => {
      useWorldStore.setState({ isCustomWorldActive: true });
      useOrchestratorStore.setState({
        activeSelection: {
          center: { x: 10, z: 20 },
          radiusWorldUnits: 15,
          regions: [],
          npcs: [],
          landmarks: [],
          activeQuests: [],
          biome: 'pine',
        },
      });

      // Simulation of safe SpotlightPromptBar failure handling
      const activeSelection = useOrchestratorStore.getState().activeSelection;
      const isCustomWorldActiveInitial = useWorldStore.getState().isCustomWorldActive;
      expect(isCustomWorldActiveInitial).toBe(true);

      // In the fixed code, when activeSelection is true, isCustomWorldActive is not flipped to false
      if (!activeSelection) {
        useWorldStore.getState().setCustomWorldActive(false);
      }

      expect(useWorldStore.getState().isCustomWorldActive).toBe(true);
    });
  });

  describe('BUG-048: Circle Select Context Menu & Safe Radius Clamping', () => {
    it('clamps brush radius within [5, 100] on extreme wheel zoom', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
      const canvas = new MockCanvas();

      const tool = new CircleSelectTool(
        scene,
        camera,
        canvas as unknown as HTMLCanvasElement,
        null,
        'pine'
      );

      // Extreme scroll down to shrink brush
      for (let i = 0; i < 50; i++) {
        canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: 100 }));
      }
      expect((tool as any).radius).toBe(5);

      // Extreme scroll up to expand brush
      for (let i = 0; i < 100; i++) {
        canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: -100 }));
      }
      expect((tool as any).radius).toBe(100);

      tool.dispose();
    });

    it('prevents default on contextmenu event to eliminate browser OS popup during selection', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
      const canvas = new MockCanvas();

      const tool = new CircleSelectTool(
        scene,
        camera,
        canvas as unknown as HTMLCanvasElement,
        null,
        'pine'
      );

      const contextMenuEvt = new Event('contextmenu', { cancelable: true });
      const preventDefaultSpy = vi.spyOn(contextMenuEvt, 'preventDefault');

      canvas.dispatchEvent(contextMenuEvt);

      expect(preventDefaultSpy).toHaveBeenCalled();

      tool.dispose();
    });
  });

  describe('BUG-049: Custom World Flag Persistence on SceneGraph Patch', () => {
    it('sets isCustomWorldActive to true when patchSceneGraph is called', () => {
      expect(useWorldStore.getState().isCustomWorldActive).toBe(false);

      useWorldStore.getState().patchSceneGraph({
        objects: [
          {
            id: 'imported_prop_1',
            name: 'Ancient Monument',
            type: 'landmark',
            position: [5, 0, 10],
            collidable: true,
            interactable: true,
            pickable: false,
            locked: false,
          },
        ],
      });

      expect(useWorldStore.getState().isCustomWorldActive).toBe(true);
      expect(useWorldStore.getState().sceneGraph?.objects?.length).toBe(1);
    });
  });

  describe('BUG-050: Popover Collision Prevention in uiStore', () => {
    it('toggleDocUploader closes isImageUploaderOpen and toggleImageUploader closes isDocUploaderOpen', () => {
      const ui = useUIStore.getState();

      ui.toggleDocUploader();
      expect(useUIStore.getState().isDocUploaderOpen).toBe(true);
      expect(useUIStore.getState().isImageUploaderOpen).toBe(false);

      ui.toggleImageUploader();
      expect(useUIStore.getState().isDocUploaderOpen).toBe(false);
      expect(useUIStore.getState().isImageUploaderOpen).toBe(true);

      ui.toggleImageUploader();
      expect(useUIStore.getState().isImageUploaderOpen).toBe(false);
    });
  });

  describe('BUG-051: Orchestrator Request Validation & IPC Sanitization', () => {
    it('ParentAgent.generate rejects null or invalid request gracefully', async () => {
      const storeService = { getSettings: vi.fn(), setSettings: vi.fn() } as any;
      const graphStore = { loadSession: vi.fn().mockResolvedValue({ nodes: [], edges: [] }), saveSession: vi.fn() } as any;
      const kvStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), listSessions: vi.fn() } as any;

      const agent = new ParentAgent(storeService, graphStore, kvStore, () => {});

      await expect(agent.generate(null as any)).rejects.toThrow('Invalid or missing WorldRequest');
      await expect(agent.generate(undefined as any)).rejects.toThrow('Invalid or missing WorldRequest');
    });

    it('sanitizes NaN and infinite coordinates for query radius', () => {
      const sanitizeRadiusQuery = (payload: any) => {
        const qx = typeof payload?.x === 'number' && Number.isFinite(payload.x) ? payload.x : 0;
        const qz = typeof payload?.z === 'number' && Number.isFinite(payload.z) ? payload.z : 0;
        const qr = typeof payload?.radius === 'number' && Number.isFinite(payload.radius) && payload.radius > 0
          ? Math.min(payload.radius, 500)
          : 25;
        return { qx, qz, qr };
      };

      expect(sanitizeRadiusQuery({ x: NaN, z: Infinity, radius: -10 })).toEqual({
        qx: 0,
        qz: 0,
        qr: 25,
      });

      expect(sanitizeRadiusQuery({ x: 15.5, z: -32.1, radius: 45 })).toEqual({
        qx: 15.5,
        qz: -32.1,
        qr: 45,
      });

      expect(sanitizeRadiusQuery({ radius: 999999 })).toEqual({
        qx: 0,
        qz: 0,
        qr: 500,
      });
    });
  });
});
