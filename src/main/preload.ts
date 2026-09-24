import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';

contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SETTINGS),

  saveSettings: (settings: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_SAVE_SETTINGS, settings),

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

  // Images
  processImage: (base64: string, mimeType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMAGE_PROCESS, { base64, mimeType }),
});
