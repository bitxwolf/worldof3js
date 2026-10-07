import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, ProcessedImage } from '../../shared/ipc.types';
import { ImageService } from '../services/ImageService';

const imageService = new ImageService();

export function registerImageHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_PROCESS,
    async (_event, payload: { base64: string; mimeType: string }): Promise<IPCResult<ProcessedImage>> => {
      try {
        const result = await imageService.processImage(payload?.base64 || '', payload?.mimeType);
        return {
          success: true,
          data: result,
        };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.warn('[image.handler] Image processing error:', e);
        return {
          success: false,
          error: {
            name: e.name || 'ImageProcessError',
            message: e.message || 'Failed to process image',
          },
        };
      }
    }
  );
}
