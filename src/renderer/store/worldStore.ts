import { create } from 'zustand';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';
import { useUIStore } from './uiStore';

interface WorldState {
  sceneGraph: SceneGraph | null;
  generatedCode: string | null;
  flags: Record<string, boolean>;
  playerPosition: [number, number, number];
  isCustomWorldActive: boolean;
  uploadedDocument: string | null;
  uploadedImages: Array<{ base64: string; mimeType: string; tag: string }>;
  setUploadedDocument: (doc: string | null) => void;
  setUploadedImages: (images: Array<{ base64: string; mimeType: string; tag: string }>) => void;
  setCustomWorldActive: (v: boolean) => void;

  setSceneGraph: (graph: SceneGraph) => void;
  patchSceneGraph: (partialGraph: Partial<SceneGraph>) => void;
  setGeneratedCode: (code: string | null) => void;
  setFlag: (key: string, value: boolean) => void;
  setPlayerPosition: (position: [number, number, number]) => void;
  resetWorld: () => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  sceneGraph: null,
  generatedCode: null,
  flags: {},
  playerPosition: [0, 1.7, 0],
  isCustomWorldActive: false,
  uploadedDocument: null,
  uploadedImages: [],

  setSceneGraph: (sceneGraph) => {
    try {
      useUIStore.getState().syncFromSceneGraph(sceneGraph);
    } catch {
      // In isolated tests where uiStore is mocked or not yet initialized
    }
    set({
      sceneGraph,
      flags: sceneGraph.flags || {},
      playerPosition: sceneGraph.player?.spawn || sceneGraph.player?.startPosition || [0, 1.7, 0],
    });
  },

  patchSceneGraph: (partial) =>
    set((state) => {
      const baseGraph: SceneGraph = state.sceneGraph || {
        version: '1.0',
        world: {
          name: 'World',
          description: 'Custom World',
          biome: 'forest',
          timeOfDay: 'morning',
          weather: 'clear',
          scale: 'medium',
        },
        player: {
          spawn: state.playerPosition || [0, 1.7, 0],
          startPosition: state.playerPosition || [0, 1.7, 0],
          movementSpeed: 4.0,
          jumpHeight: 1.5,
        },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
        skybox: { type: 'gradient', topColor: '#0a0a1a', bottomColor: '#2a2a4a' },
        atmosphere: {
          fogDensity: 0.015,
          fogColor: '#1a1a2e',
          ambientIntensity: 0.5,
          sunColor: '#fff4e0',
        },
        flags: {},
      };
      return {
        isCustomWorldActive: true,
        sceneGraph: {
          ...baseGraph,
          ...partial,
          objects: partial.objects
            ? [...baseGraph.objects.filter((o) => !partial.objects?.some((po) => po.id === o.id)), ...partial.objects]
            : baseGraph.objects,
          characters: partial.characters
            ? [...baseGraph.characters.filter((c) => !partial.characters?.some((pc) => pc.id === c.id)), ...partial.characters]
            : baseGraph.characters,
          zones: partial.zones
            ? [...baseGraph.zones.filter((z) => !partial.zones?.some((pz) => pz.id === z.id)), ...partial.zones]
            : baseGraph.zones,
          lights: partial.lights
            ? [...baseGraph.lights.filter((l) => !partial.lights?.some((pl) => pl.id === l.id)), ...partial.lights]
            : baseGraph.lights,
          events: partial.events
            ? [...baseGraph.events.filter((e) => !partial.events?.some((pe) => pe.id === e.id)), ...partial.events]
            : baseGraph.events,
        },
      };
    }),

  setGeneratedCode: (generatedCode) => set({ generatedCode }),
  setFlag: (key, value) =>
    set((state) => ({ flags: { ...state.flags, [key]: value } })),
  setPlayerPosition: (playerPosition) => set({ playerPosition }),
  setCustomWorldActive: (isCustomWorldActive) => set({ isCustomWorldActive }),
  setUploadedDocument: (uploadedDocument) => set({ uploadedDocument }),
  setUploadedImages: (uploadedImages) => set({ uploadedImages }),
  resetWorld: () =>
    set({
      sceneGraph: null,
      generatedCode: null,
      flags: {},
      playerPosition: [0, 1.7, 0],
      isCustomWorldActive: false,
      uploadedDocument: null,
      uploadedImages: [],
    }),
}));
