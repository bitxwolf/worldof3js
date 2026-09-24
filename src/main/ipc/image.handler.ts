import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, ProcessedImage } from '../../shared/ipc.types';

export function registerImageHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_PROCESS,
    async (_event, _payload: { base64: string; mimeType: string }): Promise<IPCResult<ProcessedImage>> => {
      // Placeholder for Phase 3 img2threejs processing
      return {
        success: true,
        data: {
          dimensions: { width: 512, height: 512 },
          colors: ['#228B22', '#8B4513'],
        },
      };
    }
  );
}
