import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  PolyforkAsset,
  PolyforkKit,
  PolyforkSearchOptions,
  PolyforkRawClip,
} from '../../shared/ipc.types';
import { polyforkService } from '../services/PolyforkService';

export function registerPolyforkHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_SEARCH,
    async (_event, opts?: PolyforkSearchOptions): Promise<IPCResult<PolyforkAsset[]>> => {
      try {
        const assets = await polyforkService.searchAssets(opts || {});
        return { success: true, data: assets };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.warn('[polyfork.handler] Search failed:', e);
        return {
          success: false,
          error: { name: 'PolyforkSearchError', message: e.message },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_LIST_CACHED,
    async (): Promise<IPCResult<PolyforkAsset[]>> => {
      try {
        const assets = await polyforkService.listCachedAssets();
        return { success: true, data: assets };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.warn('[polyfork.handler] List cached failed:', e);
        return {
          success: false,
          error: { name: 'PolyforkListError', message: e.message },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_DOWNLOAD,
    async (_event, id: string): Promise<IPCResult<PolyforkAsset>> => {
      try {
        if (!id || typeof id !== 'string') {
          throw new Error('Asset ID must be a non-empty string');
        }
        const asset = await polyforkService.fetchAsset(id);
        return { success: true, data: asset };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.warn(`[polyfork.handler] Download failed for ${id}:`, e);
        return {
          success: false,
          error: { name: 'PolyforkDownloadError', message: e.message },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_GET_KITS,
    async (): Promise<IPCResult<PolyforkKit[]>> => {
      try {
        const kits = await polyforkService.getKits();
        return { success: true, data: kits };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return {
          success: false,
          error: { name: 'PolyforkKitsError', message: e.message },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_GET_CLIPS,
    async (): Promise<IPCResult<Record<string, PolyforkRawClip>>> => {
      try {
        const clips = await polyforkService.getClips();
        return { success: true, data: clips };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return {
          success: false,
          error: { name: 'PolyforkClipsError', message: e.message },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_GET_ASSET_URL,
    async (_event, id: string): Promise<IPCResult<string>> => {
      try {
        const url = polyforkService.getAssetUrl(id);
        return { success: true, data: url };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return {
          success: false,
          error: { name: 'PolyforkUrlError', message: e.message },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.POLYFORK_DELETE_ASSET,
    async (_event, id: string): Promise<IPCResult<boolean>> => {
      try {
        const deleted = await polyforkService.deleteAsset(id);
        return { success: true, data: deleted };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return {
          success: false,
          error: { name: 'PolyforkDeleteError', message: e.message },
        };
      }
    }
  );
}
