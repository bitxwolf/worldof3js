import { create } from 'zustand';

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

interface UIState {
  viewMode: 'editor' | 'world';
  isSettingsOpen: boolean;
  isLibraryOpen: boolean;
  isGenerating: boolean;
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

  // Biome & Procedural Tuning
  seed: number;
  activeBiome: BiomeType;
  tuningParams: TuningParams;

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
  setGenerating: (isGenerating: boolean, step?: string | null) => void;
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

  setSeed: (seed: number) => void;
  reseed: () => void;
  setActiveBiome: (biome: BiomeType) => void;
  setTuningParam: <K extends keyof TuningParams>(key: K, value: TuningParams[K]) => void;

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
  isGenerating: false,
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
  setGenerating: (isGenerating, step = null) =>
    set({ isGenerating, generationStep: step, generationError: null }),
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

  setSeed: (seed) => set({ seed }),
  reseed: () =>
    set({ seed: Math.floor(Math.random() * 900000) + 100000 }),
  setActiveBiome: (activeBiome) => set({ activeBiome }),
  setTuningParam: (key, value) =>
    set((state) => ({
      tuningParams: {
        ...state.tuningParams,
        [key]: value,
      },
    })),

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
