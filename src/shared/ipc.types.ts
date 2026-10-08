import type { SceneGraph } from './schema/sceneGraph.schema';

export type IPCSuccess<T> = {
  readonly success: true;
  readonly data: T;
};

export type IPCError = {
  readonly success: false;
  readonly error: {
    readonly name: string;
    readonly message: string;
  };
};

export type IPCResult<T> = IPCSuccess<T> | IPCError;

export function isOk<T>(result: IPCResult<T>): result is IPCSuccess<T> {
  return result.success === true;
}

export function unwrap<T>(result: IPCResult<T>): T {
  if (isOk(result)) return result.data;
  throw new Error(`[IPC ${result.error.name}] ${result.error.message}`);
}

export interface AppSettings {
  apiKey?: string;
  model?: string;
  quality: 'fast' | 'quality';
  activeProvider?: 'openai' | 'anthropic';
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiModelList?: string[];
  anthropicModelList?: string[];
  agentModelOverrides?: import('./config/modelConfig').AgentModelConfig;
  generationMode?: 'detailed' | 'quick';
}

export interface ParseWorldPayload {
  text?: string;
  images?: Array<{ base64: string; mimeType: string; tag: 'character' | 'scene' | 'texture' }>;
  imageDescriptions?: Array<{ tag: 'character' | 'scene' | 'texture' | 'map'; description: string }>;
  document?: string;
  existingGraph?: unknown;
}

export interface UpdateWorldPayload {
  currentGraph: SceneGraph;
  updatePrompt: string;
  screenshot?: string;
}

export interface NPCReplyPayload {
  npcId: string;
  playerMessage: string;
  character?: {
    name: string;
    personality?: string;
    backstory?: string;
    secrets?: string[];
    dialogueStyle?: string;
    knowledge?: string[];
  };
  worldContext?: string;
  worldLore?: string;
  history?: Array<{ sender: 'player' | 'npc'; text: string }>;
  dialogueHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface SavedWorld {
  name: string;
  timestamp: number;
  sceneGraph: SceneGraph;
  generatedCode?: string | null;
  flags: Record<string, boolean>;
  playerPosition: [number, number, number];
}

export interface ProcessedImage {
  geometryData?: unknown;
  colors?: string[];
  dimensions: { width: number; height: number };
  contour?: Array<[number, number]>;
  cleanBase64?: string;
  alphaBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  aspectRatio?: number;
}


// Added for v2
import type { WorldRequest, SelectionContext, OrchestratorProgressEvent, RegionElevation } from './agents/agentTypes';

export interface OrchestratorGeneratePayload extends WorldRequest {}

export interface OrchestratorEditPayload {
  sessionId: string;
  selection: SelectionContext;
  updateRequest: string;
}

export interface OrchestratorProgressPayload extends OrchestratorProgressEvent {}

export interface GraphQueryRadiusPayload {
  sessionId: string;
  x: number;
  z: number;
  radius: number;
  types?: string[];
}

export interface GraphQueryRadiusResult {
  nodes: Array<{ id: string; type: string; attrs: Record<string, unknown>; x: number; z: number }>;
}

export interface CompiledWorldResult {
  sceneGraph: import('./schema/sceneGraph.schema').SceneGraph;
  activeBiome: import('./agents/agentTypes').ViewportBiomeType;
  regionElevations: RegionElevation[];
  sessionId: string;
}
