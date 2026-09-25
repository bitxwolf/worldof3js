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
  apiKey: string;
  model: string;
  quality: 'fast' | 'quality';
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
  flags: Record<string, boolean>;
  playerPosition: [number, number, number];
}

export interface ProcessedImage {
  geometryData?: unknown;
  colors?: string[];
  dimensions: { width: number; height: number };
}
