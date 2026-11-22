import type {
  IPCResult,
  AppSettings,
  ParseWorldPayload,
  UpdateWorldPayload,
  NPCReplyPayload,
  SavedWorld,
  ProcessedImage,
  OrchestratorGeneratePayload,
  OrchestratorEditPayload,
  GraphQueryRadiusPayload,
  GraphQueryRadiusResult,
  CompiledWorldResult,
  PolyforkAsset,
  PolyforkKit,
  PolyforkSearchOptions,
  PolyforkRawClip,
} from '../shared/ipc.types';
import type { OrchestratorProgressEvent } from '../shared/agents/agentTypes';
import type { SceneGraph } from '../shared/schema/sceneGraph.schema';

declare global {
  interface Window {
    electronAPI: {
      // App
      getVersion: () => Promise<string>;
      getSettings: () => Promise<IPCResult<AppSettings>>;
      saveSettings: (s: Partial<AppSettings>) => Promise<IPCResult<void>>;
      fetchOpenAIModels: (p: { baseUrl: string; apiKey: string }) => Promise<{ success: boolean; data?: { models: string[] }; error?: { message: string } }>;
      fetchAnthropicModels: (p: { apiKey: string }) => Promise<{ success: boolean; data?: { models: string[] }; error?: { message: string } }>;

      // LLM
      parseWorld: (p: ParseWorldPayload) => Promise<IPCResult<SceneGraph>>;
      generateCode: (g: SceneGraph) => Promise<IPCResult<string>>;
      updateWorld: (p: UpdateWorldPayload) => Promise<IPCResult<Partial<SceneGraph>>>;
      enrichWorld?: (g: SceneGraph) => Promise<IPCResult<unknown>>;
      npcReply: (p: NPCReplyPayload) => Promise<IPCResult<void>>;

      // Streaming
      onStreamChunk: (cb: (chunk: string) => void) => () => void;
      onStreamEnd: (cb: () => void) => () => void;
      onStreamError: (cb: (msg: string) => void) => () => void;

      // NPC Dialogue
      onNPCReplyChunk: (cb: (chunk: string) => void) => () => void;
      sendNPCMessage: (payload: { characterId: string; message: string }) => Promise<IPCResult<void>>;

      // Files
      openFileDialog: (filters?: { name: string; extensions: string[] }[]) =>
        Promise<IPCResult<string | null>>;
      readFile: (path: string) => Promise<IPCResult<string>>;
      saveWorld: (w: SavedWorld) => Promise<IPCResult<string>>;
      loadWorld: () => Promise<IPCResult<SavedWorld>>;
      exportHtml: (g: SceneGraph) => Promise<IPCResult<string>>;
      autoSaveWorld: (payload: unknown) => Promise<IPCResult<string>>;

      // Images
      processImage: (b64: string, mime: string) => Promise<IPCResult<ProcessedImage>>;

      // Orchestrator & Graph
      orchestrate: (p: OrchestratorGeneratePayload) => Promise<IPCResult<CompiledWorldResult>>;
      editSelection: (p: OrchestratorEditPayload) => Promise<IPCResult<CompiledWorldResult>>;
      queryRadius: (p: GraphQueryRadiusPayload) => Promise<IPCResult<GraphQueryRadiusResult>>;
      onOrchestratorProgress: (cb: (evt: OrchestratorProgressEvent) => void) => () => void;

      // WebUtils
      webUtils?: {
        getPathForFile?: (file: File) => string;
      };

      // Polyfork Asset Integration
      polyfork?: {
        searchAssets: (opts?: PolyforkSearchOptions) => Promise<IPCResult<PolyforkAsset[]>>;
        listCached: () => Promise<IPCResult<PolyforkAsset[]>>;
        downloadAsset: (id: string) => Promise<IPCResult<PolyforkAsset>>;
        getKits: () => Promise<IPCResult<PolyforkKit[]>>;
        getClips: () => Promise<IPCResult<Record<string, PolyforkRawClip>>>;
        getAssetUrl: (id: string) => Promise<IPCResult<string>>;
        deleteAsset: (id: string) => Promise<IPCResult<boolean>>;
      };
    };
  }
}

export {};
