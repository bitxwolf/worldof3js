import electron, { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';

contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SETTINGS),

  saveSettings: (settings: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_SAVE_SETTINGS, settings),

  fetchOpenAIModels: (p: { baseUrl: string; apiKey: string }) =>
    ipcRenderer.invoke('settings:fetch-openai-models', p),

  fetchAnthropicModels: (p: { apiKey: string }) =>
    ipcRenderer.invoke('settings:fetch-anthropic-models', p),

  // LLM
  parseWorld: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_PARSE_WORLD, payload),

  generateCode: (graph: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_GENERATE_CODE, graph),

  updateWorld: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_UPDATE_WORLD, payload),

  npcReply: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_NPC_REPLY, payload),

  // Streaming
  onStreamChunk: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => {
      callback(chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.LLM_STREAM_CHUNK, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LLM_STREAM_CHUNK, handler);
    };
  },

  onStreamEnd: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback();
    };
    ipcRenderer.once(IPC_CHANNELS.LLM_STREAM_END, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LLM_STREAM_END, handler);
    };
  },

  onStreamError: (callback: (message: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string): void => {
      callback(message);
    };
    ipcRenderer.once(IPC_CHANNELS.LLM_STREAM_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LLM_STREAM_ERROR, handler);
    };
  },

  // Files
  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG, filters),

  readFile: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),

  saveWorld: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_WORLD, payload),

  loadWorld: () =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_LOAD_WORLD),

  exportHtml: (graph: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_HTML, graph),

  autoSaveWorld: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_AUTOSAVE_WORLD, payload),

  // WebUtils for path resolution of dropped / picked files
  webUtils: {
    getPathForFile: (file: File): string => {
      try {
        const mod = electron as unknown as { webUtils?: { getPathForFile: (f: File) => string } };
        if (mod.webUtils?.getPathForFile) {
          return mod.webUtils.getPathForFile(file);
        }
        return (file as unknown as { path?: string }).path || '';
      } catch {
        return (file as unknown as { path?: string }).path || '';
      }
    },
  },

  // Images
  processImage: (base64: string, mimeType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMAGE_PROCESS, { base64, mimeType }),

  // Orchestrator & Graph
  orchestrate: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_GENERATE, payload),
  editSelection: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_EDIT_SELECTION, payload),
  queryRadius: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.GRAPH_QUERY_RADIUS, payload),
  onOrchestratorProgress: (cb: (evt: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, evt: unknown) => cb(evt);
    ipcRenderer.on(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, handler);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, handler); };
  },

  // Polyfork Asset Integration
  polyfork: {
    searchAssets: (opts?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_SEARCH, opts),
    listCached: () => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_LIST_CACHED),
    downloadAsset: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_DOWNLOAD, id),
    getKits: () => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_GET_KITS),
    getClips: () => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_GET_CLIPS),
    getAssetUrl: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_GET_ASSET_URL, id),
    deleteAsset: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.POLYFORK_DELETE_ASSET, id),
  },
});
