import { create } from 'zustand';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';

interface WorldState {
  sceneGraph: SceneGraph | null;
  generatedCode: string | null;
  flags: Record<string, boolean>;
  playerPosition: [number, number, number];

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

  setSceneGraph: (sceneGraph) =>
    set({
      sceneGraph,
      flags: sceneGraph.flags || {},
      playerPosition: sceneGraph.player?.startPosition || [0, 1.7, 0],
    }),

  patchSceneGraph: (partial) =>
    set((state) => {
      if (!state.sceneGraph) return state;
      return {
        sceneGraph: {
          ...state.sceneGraph,
          ...partial,
          objects: partial.objects
            ? [...state.sceneGraph.objects.filter((o) => !partial.objects?.some((po) => po.id === o.id)), ...partial.objects]
            : state.sceneGraph.objects,
          characters: partial.characters
            ? [...state.sceneGraph.characters.filter((c) => !partial.characters?.some((pc) => pc.id === c.id)), ...partial.characters]
            : state.sceneGraph.characters,
          zones: partial.zones
            ? [...state.sceneGraph.zones.filter((z) => !partial.zones?.some((pz) => pz.id === z.id)), ...partial.zones]
            : state.sceneGraph.zones,
          lights: partial.lights
            ? [...state.sceneGraph.lights.filter((l) => !partial.lights?.some((pl) => pl.id === l.id)), ...partial.lights]
            : state.sceneGraph.lights,
          events: partial.events
            ? [...state.sceneGraph.events.filter((e) => !partial.events?.some((pe) => pe.id === e.id)), ...partial.events]
            : state.sceneGraph.events,
        },
      };
    }),

  setGeneratedCode: (generatedCode) => set({ generatedCode }),
  setFlag: (key, value) =>
    set((state) => ({ flags: { ...state.flags, [key]: value } })),
  setPlayerPosition: (playerPosition) => set({ playerPosition }),
  resetWorld: () =>
    set({
      sceneGraph: null,
      generatedCode: null,
      flags: {},
      playerPosition: [0, 1.7, 0],
    }),
}));
