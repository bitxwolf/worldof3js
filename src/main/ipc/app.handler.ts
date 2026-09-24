import { ipcMain } from 'electron';
import { IPC_CHANNELS, APP_VERSION } from '../../shared/constants';
import type { IPCResult, AppSettings } from '../../shared/ipc.types';
import { StoreService } from '../services/StoreService';

export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return APP_VERSION;
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_SETTINGS,
    async (): Promise<IPCResult<AppSettings>> => {
      try {
        const settings = StoreService.getSettings();
        return { success: true, data: settings };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SAVE_SETTINGS,
    async (_event, settings: Partial<AppSettings>): Promise<IPCResult<void>> => {
      try {
        StoreService.setSettings(settings);
        return { success: true, data: undefined };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );
}
