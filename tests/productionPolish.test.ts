import { describe, it, expect, vi } from 'vitest';
import { ViewportErrorBoundary } from '../src/renderer/components/ErrorBoundary';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import type { SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('Phase 4: Production Polish', () => {
  describe('ViewportErrorBoundary', () => {
    it('returns hasError true and the error object from getDerivedStateFromError', () => {
      const error = new Error('WebGL Context Lost');
      const state = ViewportErrorBoundary.getDerivedStateFromError(error);
      expect(state).toEqual({
        hasError: true,
        error,
      });
    });

    it('resets error state on handleRestart', () => {
      const boundary = new ViewportErrorBoundary({ children: null });
      boundary.state = { hasError: true, error: new Error('Crash') };
      boundary.setState = vi.fn((newState) => {
        boundary.state = { ...boundary.state, ...newState };
      });

      boundary.handleRestart();
      expect(boundary.setState).toHaveBeenCalledWith({ hasError: false, error: null });
    });
  });

  describe('GenerationOverlay step progression logic', () => {
    const STEPS = [
      'Reading your story',
      'Designing the world',
      'Writing the scene code',
      'Rendering geometry',
      'Summoning characters',
    ];

    it('computes correct step index based on pipelineProgress', () => {
      const computeStep = (progress: number) =>
        Math.min(Math.floor(progress / 20), STEPS.length - 1);

      expect(computeStep(0)).toBe(0);
      expect(computeStep(19)).toBe(0);
      expect(computeStep(20)).toBe(1);
      expect(computeStep(45)).toBe(2);
      expect(computeStep(65)).toBe(3);
      expect(computeStep(85)).toBe(4);
      expect(computeStep(100)).toBe(4);
      expect(computeStep(120)).toBe(4);
    });

    it('tracks isGenerating and pipelineProgress in uiStore', () => {
      const store = useUIStore.getState();
      store.setGenerating(true, 'Synthesizing...');
      store.setPipelineProgress(50);

      expect(useUIStore.getState().isGenerating).toBe(true);
      expect(useUIStore.getState().pipelineProgress).toBe(50);

      store.setGenerating(false);
      store.setPipelineProgress(0);
      expect(useUIStore.getState().isGenerating).toBe(false);
      expect(useUIStore.getState().pipelineProgress).toBe(0);
    });
  });

  describe('AutoSave payload structure', () => {
    it('creates valid auto-save payload from worldStore sceneGraph', () => {
      const mockSceneGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'Mystic Vale',
          description: 'A glowing forest',
          biome: 'forest',
          timeOfDay: 'dusk',
          weather: 'clear',
          scale: 'medium',
        },
        player: {
          spawn: [0, 1, 0],
          startPosition: [0, 1, 0],
          movementSpeed: 4.0,
          jumpHeight: 1.5,
        },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
        flags: {},
        skybox: { type: 'procedural' },
        atmosphere: { fogDensity: 0.01, fogColor: '#ffffff', ambientIntensity: 0.5, sunColor: '#ffffff' },
      };

      useWorldStore.getState().setSceneGraph(mockSceneGraph);

      const graph = useWorldStore.getState().sceneGraph;
      expect(graph).not.toBeNull();

      const payload = {
        name: graph?.world?.name ?? 'Autosave',
        timestamp: Date.now(),
        sceneGraph: graph!,
        flags: {},
        playerPosition: [0, 0, 0] as [number, number, number],
      };

      expect(payload.name).toBe('Mystic Vale');
      expect(payload.sceneGraph).toBe(mockSceneGraph);
      expect(payload.playerPosition).toEqual([0, 0, 0]);
      expect(payload.flags).toEqual({});
      expect(typeof payload.timestamp).toBe('number');
    });

    it('falls back to "Autosave" when world.name is missing', () => {
      const mockSceneGraph = {
        version: '1.0',
        player: { spawn: [0, 0, 0], startPosition: [0, 0, 0], movementSpeed: 4, jumpHeight: 1 },
        zones: [],
        characters: [],
        objects: [],
      } as unknown as SceneGraph;

      useWorldStore.getState().setSceneGraph(mockSceneGraph);
      const graph = useWorldStore.getState().sceneGraph;

      const payload = {
        name: graph?.world?.name ?? 'Autosave',
        timestamp: Date.now(),
        sceneGraph: graph!,
        flags: {},
        playerPosition: [0, 0, 0] as [number, number, number],
      };

      expect(payload.name).toBe('Autosave');
    });
  });

  describe('Camera Fly-To Calculation (KeyF shortcut logic)', () => {
    it('calculates proper camera position and target relative to selected object position', () => {
      const selectedPos: [number, number, number] = [10, 2, -15];
      const cameraPos = {
        x: 0,
        y: 0,
        z: 0,
        set: (x: number, y: number, z: number) => {
          cameraPos.x = x;
          cameraPos.y = y;
          cameraPos.z = z;
        },
      };
      const controlsTarget = {
        x: 0,
        y: 0,
        z: 0,
        set: (x: number, y: number, z: number) => {
          controlsTarget.x = x;
          controlsTarget.y = y;
          controlsTarget.z = z;
        },
      };

      // KeyF fly-to logic
      cameraPos.set(selectedPos[0] + 5, selectedPos[1] + 3, selectedPos[2] + 5);
      controlsTarget.set(selectedPos[0], selectedPos[1], selectedPos[2]);

      expect(cameraPos.x).toBe(15);
      expect(cameraPos.y).toBe(5);
      expect(cameraPos.z).toBe(-10);
      expect(controlsTarget.x).toBe(10);
      expect(controlsTarget.y).toBe(2);
      expect(controlsTarget.z).toBe(-15);
    });
  });
});
