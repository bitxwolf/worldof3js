import { create } from 'zustand';
import { useWorldStore } from './worldStore';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';

export interface ToastNotification {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export interface SceneHierarchyItem {
  id: string;
  name: string;
  type: string;
  category: string;
  icon: string;
  position: [number, number, number];
  scale: [number, number, number];
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
}

export interface SelectedNodeInfo {
  id: string;
  name: string;
  type: string;
  position: [number, number, number];
  scale: [number, number, number];
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
}

export interface IpcLogEntry {
  id: string;
  text: string;
  type: 'info' | 'error' | 'success' | 'build' | 'selection' | 'warn';
  timestamp: number;
}

export interface TuningParams {
  elevation: number;
  density: number;
  fogDensity: number;
  sunAngle: number;
  roughness: number;
  metalness: number;
  castShadow: boolean;
}

export type BiomeType = 'pine' | 'cyber' | 'canyon' | 'alien' | 'ruins';

export type WeatherType = 'clear' | 'fog' | 'rain' | 'snow' | 'storm';

export interface SunlightParams {
  elevation: number;   // 5 to 90 degrees
  azimuth: number;     // 0 to 360 degrees
  intensity: number;   // 0.1 to 3.0
  color: string;       // Hex string
}

export interface MoonlightParams {
  elevation: number;   // 5 to 90 degrees
  azimuth: number;     // 0 to 360 degrees
  intensity: number;   // 0.05 to 1.5
  color: string;       // Hex string
  starDensity: number; // 0.0 to 1.0
}

export interface WeatherParams {
  type: WeatherType;
  intensity: number;   // 0.0 to 1.0
  windSpeed: number;   // -10 to +10
}

interface UIState {
  viewMode: 'editor' | 'world';
  isSettingsOpen: boolean;
  isLibraryOpen: boolean;
  isPolyforkOpen: boolean;
  isGenerating: boolean;
  isUpdatingWorld: boolean;
  generationStep: string | null;
  generationError: string | null;
  pipelineProgress: number;
  jsonInspectorOpen: boolean;
  notifications: ToastNotification[];

  // macOS Studio layout & tabs
  leftSidebarOpen: boolean;
  leftSidebarTab: 'hierarchy' | 'biomes' | 'tuning';
  rightInspectorOpen: boolean;
  rightInspectorTab: 'inspector' | 'npc' | 'telemetry';

  // Navigation & Viewport toggles
  cameraMode: 'orbit' | 'walk';
  wireframe: boolean;
  shadowsEnabled: boolean;
  isNight: boolean;

  // Biome & Procedural Tuning
  seed: number;
  activeBiome: BiomeType;
  tuningParams: TuningParams;

  // Weather & Celestial Controls
  weather: WeatherParams;
  sunlight: SunlightParams;
  moonlight: MoonlightParams;

  // Generation mode
  generationMode: 'detailed' | 'quick';
  setGenerationMode: (mode: 'detailed' | 'quick') => void;

  // Selected Object in 3D Scene
  selectedNode: SelectedNodeInfo | null;
  sceneHierarchy: SceneHierarchyItem[];

  // Live Telemetry
  telemetry: {
    fps: number;
    polyCount: number;
    drawCalls: number;
    camCoords: string;
    bufferMemoryMB: number;
  };

  generatorMeta: {
    generator: string;
    lodStrategy: string;
    zodValidation: string;
  };
  setGeneratorMeta: (meta: Partial<{ generator: string; lodStrategy: string; zodValidation: string }>) => void;

  // IPC Telemetry Logs
  ipcLogs: IpcLogEntry[];

  // Action methods
  setViewMode: (mode: 'editor' | 'world') => void;
  openSettings: () => void;
  closeSettings: () => void;
  openLibrary: () => void;
  closeLibrary: () => void;
  openPolyfork: () => void;
  closePolyfork: () => void;
  togglePolyfork: () => void;
  setGenerating: (isGenerating: boolean, step?: string | null) => void;
  setIsUpdatingWorld: (isUpdating: boolean) => void;
  setGenerationError: (error: string | null) => void;
  setPipelineProgress: (progress: number) => void;
  toggleJsonInspector: () => void;
  setJsonInspectorOpen: (open: boolean) => void;
  showNotification: (
    message: string,
    durationMs?: number,
    type?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
  dismissNotification: (id: string) => void;

  toggleLeftSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setLeftSidebarTab: (tab: 'hierarchy' | 'biomes' | 'tuning') => void;

  toggleRightInspector: () => void;
  setRightInspectorOpen: (open: boolean) => void;
  setRightInspectorTab: (tab: 'inspector' | 'npc' | 'telemetry') => void;

  setCameraMode: (mode: 'orbit' | 'walk') => void;
  toggleWireframe: () => void;
  toggleShadows: () => void;
  toggleDayNight: () => void;
  setIsNight: (isNight: boolean) => void;

  setSeed: (seed: number) => void;
  reseed: () => void;
  setActiveBiome: (biome: BiomeType) => void;
  setTuningParam: <K extends keyof TuningParams>(key: K, value: TuningParams[K]) => void;

  // Weather & Celestial Actions
  setWeather: (type: WeatherType) => void;
  setWeatherIntensity: (intensity: number) => void;
  setWindSpeed: (speed: number) => void;
  setSunlight: (params: Partial<SunlightParams>) => void;
  setMoonlight: (params: Partial<MoonlightParams>) => void;
  applyAtmosphericPreset: (presetName: string) => void;
  syncFromSceneGraph: (graph: SceneGraph) => void;

  setSelectedNode: (node: SelectedNodeInfo | null) => void;
  setSceneHierarchy: (items: SceneHierarchyItem[]) => void;
  updateSelectedNodePosition: (axis: 'x' | 'y' | 'z', value: number) => void;
  updateSelectedNodeScale: (axis: 'x' | 'y' | 'z', value: number) => void;

  setTelemetry: (t: Partial<UIState['telemetry']>) => void;
  addIpcLog: (text: string, type?: IpcLogEntry['type']) => void;
  clearIpcLogs: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: 'editor',
  isSettingsOpen: false,
  isLibraryOpen: false,
  isPolyforkOpen: false,
  isGenerating: false,
  isUpdatingWorld: false,
  generationStep: null,
  generationError: null,
  pipelineProgress: 0,
  jsonInspectorOpen: false,
  notifications: [],

  leftSidebarOpen: true,
  leftSidebarTab: 'hierarchy',
  rightInspectorOpen: true,
  rightInspectorTab: 'inspector',

  cameraMode: 'orbit',
  wireframe: false,
  shadowsEnabled: true,
  isNight: false,

  seed: 482910,
  activeBiome: 'pine',
  tuningParams: {
    elevation: 12.0,
    density: 65,
    fogDensity: 0.015,
    sunAngle: 45,
    roughness: 0.68,
    metalness: 0.10,
    castShadow: true,
  },
  weather: {
    type: 'clear',
    intensity: 0.75,
    windSpeed: 2.0,
  },
  sunlight: {
    elevation: 45,
    azimuth: 135,
    intensity: 1.35,
    color: '#fff8e8',
  },
  moonlight: {
    elevation: 55,
    azimuth: 315,
    intensity: 0.25,
    color: '#8ba2cc',
    starDensity: 0.85,
  },
  generationMode: 'detailed',

  selectedNode: null,
  sceneHierarchy: [
    { id: 'node_terrain', name: 'Terrain_Heightmap_Surface', type: 'Terrain/HeightmapMesh', category: 'Terrain', icon: 'ph-mountains', position: [0, 0, 0], scale: [1, 1, 1], roughness: 0.85, metalness: 0.1 },
    { id: 'node_pine_1', name: 'Procedural_Pine_4821', type: 'Flora/ProceduralPine', category: 'Flora', icon: 'ph-tree-evergreen', position: [4.2, 0, -6.5], scale: [1, 1, 1], roughness: 0.75, metalness: 0.05 },
    { id: 'node_pine_2', name: 'Procedural_Pine_0293', type: 'Flora/ProceduralPine', category: 'Flora', icon: 'ph-tree-evergreen', position: [-8.1, 0, 12.3], scale: [1, 1, 1], roughness: 0.75, metalness: 0.05 },
    { id: 'node_rock_1', name: 'Rock_Cluster_3819', type: 'Geology/Boulders', category: 'Geology', icon: 'ph-diamonds-four', position: [12.5, 0, -4.2], scale: [1, 1, 1], roughness: 0.92, metalness: 0.08 },
    { id: 'node_npc_1', name: 'NPC_Eldrin_The_Ranger', type: 'NPCs/HumanoidNPC', category: 'NPCs', icon: 'ph-user', position: [3, 0, 5], scale: [1, 1, 1], roughness: 0.6, metalness: 0.0 },
    { id: 'node_sun', name: 'Sun', type: 'Lights/DirectionalSun', category: 'Lights', icon: 'ph-sun', position: [35, 50, 25], scale: [1, 1, 1] },
    { id: 'node_ambient', name: 'Ambient', type: 'Lights/AmbientLight', category: 'Lights', icon: 'ph-lightbulb', position: [0, 0, 0], scale: [1, 1, 1] },
  ],

  telemetry: {
    fps: 60,
    polyCount: 18400,
    drawCalls: 42,
    camCoords: 'CAM: X: 28.0 Y: 22.0 Z: 34.0',
    bufferMemoryMB: 0,
  },

  generatorMeta: {
    generator: 'None',
    lodStrategy: 'None',
    zodValidation: 'Not run',
  },

  ipcLogs: [
    { id: '1', text: '[IPC:MAIN_READY] Main process initialized. Sandboxed IPC channel opened.', type: 'build', timestamp: Date.now() - 4000 },
    { id: '2', text: '[IPC:ZOD_SCHEMA] SceneGraph validated in 1.4ms. 0 violations.', type: 'success', timestamp: Date.now() - 3000 },
    { id: '3', text: '[THREE:DISPOSE] Previous mesh buffer reclaimed: 14 Geometries.', type: 'info', timestamp: Date.now() - 2000 },
    { id: '4', text: "[PROCEDURAL:BIOME] Applied preset 'Pine Forest' (Seed: 482910).", type: 'warn', timestamp: Date.now() - 1000 },
  ],

  setViewMode: (viewMode) => set({ viewMode }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openLibrary: () => set({ isLibraryOpen: true }),
  closeLibrary: () => set({ isLibraryOpen: false }),
  openPolyfork: () => set({ isPolyforkOpen: true }),
  closePolyfork: () => set({ isPolyforkOpen: false }),
  togglePolyfork: () => set((s) => ({ isPolyforkOpen: !s.isPolyforkOpen })),
  setGenerating: (isGenerating, step = null) =>
    set({ isGenerating, generationStep: step, generationError: null }),
  setIsUpdatingWorld: (isUpdatingWorld) => set({ isUpdatingWorld }),
  setGenerationError: (generationError) =>
    set({ generationError, isGenerating: false, generationStep: null }),
  setPipelineProgress: (pipelineProgress) => set({ pipelineProgress }),
  toggleJsonInspector: () =>
    set((state) => ({ jsonInspectorOpen: !state.jsonInspectorOpen })),
  setJsonInspectorOpen: (open) => set({ jsonInspectorOpen: open }),

  showNotification: (message, durationMs = 4000, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }],
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, durationMs);
  },

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  toggleLeftSidebar: () =>
    set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  setLeftSidebarTab: (leftSidebarTab) => set({ leftSidebarTab }),

  toggleRightInspector: () =>
    set((state) => ({ rightInspectorOpen: !state.rightInspectorOpen })),
  setRightInspectorOpen: (open) => set({ rightInspectorOpen: open }),
  setRightInspectorTab: (rightInspectorTab) => set({ rightInspectorTab }),

  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleWireframe: () => set((state) => ({ wireframe: !state.wireframe })),
  toggleShadows: () => set((state) => ({ shadowsEnabled: !state.shadowsEnabled })),
  toggleDayNight: () =>
    set((state) => {
      const next = !state.isNight;
      const message = next ? 'Shifted to Night mode (Moon & Starfield)' : 'Shifted to Day mode (Sun & Shadows)';
      const notification: ToastNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        message,
        type: 'info',
      };
      const logEntry: IpcLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        text: `[LIGHTING:CYCLE] ${message}`,
        type: 'info',
        timestamp: Date.now(),
      };

      // Sync sceneGraph timeOfDay if world is active
      try {
        const ws = useWorldStore.getState();
        if (ws.sceneGraph?.world) {
          ws.patchSceneGraph({
            world: {
              ...ws.sceneGraph.world,
              timeOfDay: next ? 'night' : 'afternoon',
            },
          });
        }
      } catch {
        // ignore if not initialized
      }

      return {
        isNight: next,
        notifications: [...state.notifications.slice(-4), notification],
        ipcLogs: [...state.ipcLogs.slice(-199), logEntry],
      };
    }),
  setIsNight: (isNight) => set({ isNight }),

  setSeed: (seed) => set({ seed }),
  reseed: () =>
    set({ seed: Math.floor(Math.random() * 900000) + 100000 }),
  setActiveBiome: (activeBiome) => set({ activeBiome }),
  setGenerationMode: (generationMode) => set({ generationMode }),
  setTuningParam: (key, value) =>
    set((state) => ({
      tuningParams: {
        ...state.tuningParams,
        [key]: value,
      },
    })),

  setWeather: (type) =>
    set((state) => {
      const notification: ToastNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        message: `Weather changed to ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        type: 'info',
      };
      const logEntry: IpcLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        text: `[WEATHER:CHANGE] Weather set to ${type}`,
        type: 'info',
        timestamp: Date.now(),
      };

      try {
        const ws = useWorldStore.getState();
        if (ws.sceneGraph?.world) {
          ws.patchSceneGraph({
            world: {
              ...ws.sceneGraph.world,
              weather: type,
            },
          });
        }
      } catch {
        // ignore if not initialized
      }

      return {
        weather: {
          ...state.weather,
          type,
        },
        notifications: [...state.notifications.slice(-4), notification],
        ipcLogs: [...state.ipcLogs.slice(-199), logEntry],
      };
    }),

  setWeatherIntensity: (intensity) =>
    set((state) => ({
      weather: {
        ...state.weather,
        intensity: Math.max(0, Math.min(1, intensity)),
      },
    })),

  setWindSpeed: (windSpeed) =>
    set((state) => ({
      weather: {
        ...state.weather,
        windSpeed: Math.max(-10, Math.min(10, windSpeed)),
      },
    })),

  setSunlight: (params) =>
    set((state) => {
      const updated: SunlightParams = {
        elevation:
          params.elevation !== undefined
            ? Math.max(5, Math.min(90, params.elevation))
            : state.sunlight.elevation,
        azimuth:
          params.azimuth !== undefined
            ? ((params.azimuth % 360) + 360) % 360
            : state.sunlight.azimuth,
        intensity:
          params.intensity !== undefined
            ? Math.max(0.1, Math.min(3.0, params.intensity))
            : state.sunlight.intensity,
        color: params.color !== undefined ? params.color : state.sunlight.color,
      };

      try {
        const ws = useWorldStore.getState();
        if (ws.sceneGraph?.atmosphere && params.color) {
          ws.patchSceneGraph({
            atmosphere: {
              ...ws.sceneGraph.atmosphere,
              sunColor: params.color,
            },
          });
        }
      } catch {
        // ignore
      }

      return {
        sunlight: updated,
        tuningParams: {
          ...state.tuningParams,
          sunAngle: updated.elevation,
        },
      };
    }),

  setMoonlight: (params) =>
    set((state) => {
      const updated: MoonlightParams = {
        elevation:
          params.elevation !== undefined
            ? Math.max(5, Math.min(90, params.elevation))
            : state.moonlight.elevation,
        azimuth:
          params.azimuth !== undefined
            ? ((params.azimuth % 360) + 360) % 360
            : state.moonlight.azimuth,
        intensity:
          params.intensity !== undefined
            ? Math.max(0.05, Math.min(1.5, params.intensity))
            : state.moonlight.intensity,
        color: params.color !== undefined ? params.color : state.moonlight.color,
        starDensity:
          params.starDensity !== undefined
            ? Math.max(0, Math.min(1.0, params.starDensity))
            : state.moonlight.starDensity,
      };

      return {
        moonlight: updated,
      };
    }),

  syncFromSceneGraph: (graph) =>
    set((state) => {
      const updates: Partial<UIState> = {};
      if (graph.world?.weather && graph.world.weather !== state.weather.type) {
        updates.weather = { ...state.weather, type: graph.world.weather };
      }
      if (graph.world?.timeOfDay) {
        const isNightTarget = graph.world.timeOfDay === 'night';
        if (isNightTarget !== state.isNight) {
          updates.isNight = isNightTarget;
        }
      }
      if (graph.atmosphere?.sunColor && graph.atmosphere.sunColor !== state.sunlight.color) {
        updates.sunlight = { ...state.sunlight, color: graph.atmosphere.sunColor };
      }
      if (
        graph.atmosphere?.fogDensity !== undefined &&
        graph.atmosphere.fogDensity !== state.tuningParams.fogDensity
      ) {
        updates.tuningParams = { ...state.tuningParams, fogDensity: graph.atmosphere.fogDensity };
      }
      return Object.keys(updates).length > 0 ? updates : state;
    }),

  applyAtmosphericPreset: (presetName) =>
    set((state) => {
      const key = presetName.toLowerCase().replace(/[\s-_]+/g, '');
      let nextIsNight = state.isNight;
      let nextWeather = { ...state.weather };
      let nextSunlight = { ...state.sunlight };
      let nextMoonlight = { ...state.moonlight };
      let nextFogDensity = state.tuningParams.fogDensity;

      if (key === 'sunnynoon') {
        nextIsNight = false;
        nextWeather = { type: 'clear', intensity: 0.8, windSpeed: 1.0 };
        nextSunlight = { elevation: 75, azimuth: 180, intensity: 1.5, color: '#ffffff' };
        nextMoonlight = { elevation: 30, azimuth: 0, intensity: 0.2, color: '#8ba2cc', starDensity: 0.3 };
        nextFogDensity = 0.008;
      } else if (key === 'goldensunset') {
        nextIsNight = false;
        nextWeather = { type: 'clear', intensity: 0.6, windSpeed: 2.5 };
        nextSunlight = { elevation: 15, azimuth: 260, intensity: 1.6, color: '#f59e0b' };
        nextFogDensity = 0.012;
      } else if (key === 'mistymorning') {
        nextIsNight = false;
        nextWeather = { type: 'fog', intensity: 0.9, windSpeed: 1.2 };
        nextSunlight = { elevation: 25, azimuth: 90, intensity: 0.8, color: '#d6e4ff' };
        nextFogDensity = 0.035;
      } else if (key === 'midnightstars') {
        nextIsNight = true;
        nextWeather = { type: 'clear', intensity: 0.5, windSpeed: 1.5 };
        nextMoonlight = { elevation: 65, azimuth: 320, intensity: 0.35, color: '#d6e4ff', starDensity: 1.0 };
        nextFogDensity = 0.006;
      } else if (key === 'stormynight') {
        nextIsNight = true;
        nextWeather = { type: 'storm', intensity: 1.0, windSpeed: 7.5 };
        nextMoonlight = { elevation: 40, azimuth: 290, intensity: 0.15, color: '#4b6b94', starDensity: 0.1 };
        nextFogDensity = 0.025;
      } else if (key === 'winterblizzard') {
        nextIsNight = false;
        nextWeather = { type: 'snow', intensity: 0.95, windSpeed: 6.0 };
        nextSunlight = { elevation: 35, azimuth: 150, intensity: 0.9, color: '#e2e8f0' };
        nextFogDensity = 0.028;
      }

      const notification: ToastNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        message: `Applied atmospheric preset '${presetName}'`,
        type: 'info',
      };
      const logEntry: IpcLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        text: `[ATMOSPHERE:PRESET] Applied atmospheric preset '${presetName}'`,
        type: 'info',
        timestamp: Date.now(),
      };

      try {
        const ws = useWorldStore.getState();
        if (ws.sceneGraph?.world) {
          ws.patchSceneGraph({
            world: {
              ...ws.sceneGraph.world,
              weather: nextWeather.type,
              timeOfDay: nextIsNight ? 'night' : 'afternoon',
            },
            atmosphere: {
              ...ws.sceneGraph.atmosphere,
              sunColor: nextSunlight.color,
              fogDensity: nextFogDensity,
            },
          });
        }
      } catch {
        // ignore
      }

      return {
        isNight: nextIsNight,
        weather: nextWeather,
        sunlight: nextSunlight,
        moonlight: nextMoonlight,
        tuningParams: {
          ...state.tuningParams,
          fogDensity: nextFogDensity,
          sunAngle: nextSunlight.elevation,
        },
        notifications: [...state.notifications.slice(-4), notification],
        ipcLogs: [...state.ipcLogs.slice(-199), logEntry],
      };
    }),

  setSelectedNode: (selectedNode) => set({ selectedNode }),
  setSceneHierarchy: (sceneHierarchy) => set({ sceneHierarchy }),
  updateSelectedNodePosition: (axis, value) =>
    set((state) => {
      if (!state.selectedNode) return state;
      const pos: [number, number, number] = [...state.selectedNode.position];
      if (axis === 'x') pos[0] = value;
      else if (axis === 'y') pos[1] = value;
      else if (axis === 'z') pos[2] = value;
      return {
        selectedNode: {
          ...state.selectedNode,
          position: pos,
        },
      };
    }),
  updateSelectedNodeScale: (axis, value) =>
    set((state) => {
      if (!state.selectedNode) return state;
      const scale: [number, number, number] = [...state.selectedNode.scale];
      if (axis === 'x') scale[0] = value;
      else if (axis === 'y') scale[1] = value;
      else if (axis === 'z') scale[2] = value;
      return {
        selectedNode: {
          ...state.selectedNode,
          scale,
        },
      };
    }),

  setTelemetry: (t) =>
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        ...t,
      },
    })),

  setGeneratorMeta: (meta) =>
    set((state) => ({
      generatorMeta: { ...state.generatorMeta, ...meta },
    })),

  addIpcLog: (text, type = 'info') =>
    set((state) => ({
      ipcLogs: [
        ...state.ipcLogs.slice(-99),
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, type, timestamp: Date.now() },
      ],
    })),

  clearIpcLogs: () => set({ ipcLogs: [] }),
}));
