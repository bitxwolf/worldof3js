import type {
  IPCResult,
  AppSettings,
  ParseWorldPayload,
  UpdateWorldPayload,
  NPCReplyPayload,
  SavedWorld,
  ProcessedImage,
} from '../shared/ipc.types';
import type { SceneGraph } from '../shared/schema/sceneGraph.schema';

declare global {
  interface Window {
    electronAPI: {
      // App
      getVersion: () => Promise<string>;
      getSettings: () => Promise<IPCResult<AppSettings>>;
      saveSettings: (s: Partial<AppSettings>) => Promise<IPCResult<void>>;

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

      // WebUtils
      webUtils?: {
        getPathForFile?: (file: File) => string;
      };
    };
  }
}

export {};
