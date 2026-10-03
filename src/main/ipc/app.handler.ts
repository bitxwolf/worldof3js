import { ipcMain } from 'electron';
import { IPC_CHANNELS, APP_VERSION } from '../../shared/constants';
import type { IPCResult, AppSettings } from '../../shared/ipc.types';
import { AppSettingsSchema } from '../../shared/schema/sceneGraph.schema';
import { StoreService } from '../services/StoreService';

function hasPrototypePollution(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const dangerKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of dangerKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return true;
    }
  }
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (dangerKeys.includes(key)) {
      return true;
    }
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (typeof val === 'object' && val !== null && hasPrototypePollution(val)) {
      return true;
    }
  }
  return false;
}

/** Mask an API key, keeping only the last 4 characters visible. */
function maskApiKey(key: string | undefined): string {
  if (!key) return key ?? '';
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return APP_VERSION;
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_SETTINGS,
    async (): Promise<IPCResult<AppSettings>> => {
      try {
        const settings = StoreService.getSettings();
        // Mask API keys before sending across IPC to the renderer process.
        // The renderer only needs masked keys for display; all LLM API calls
        // happen in the main process which accesses raw keys directly via StoreService.
        const maskedSettings: AppSettings = {
          ...settings,
          apiKey: maskApiKey(settings.apiKey),
          openaiApiKey: maskApiKey(settings.openaiApiKey),
          anthropicApiKey: maskApiKey(settings.anthropicApiKey),
        };
        return { success: true, data: maskedSettings };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SAVE_SETTINGS,
    async (_event, settings: unknown): Promise<IPCResult<void>> => {
      try {
        if (hasPrototypePollution(settings)) {
          return {
            success: false,
            error: { name: 'ValidationError', message: 'Invalid settings format' },
          };
        }

        const parseResult = AppSettingsSchema.partial().safeParse(settings);
        if (!parseResult.success) {
          return {
            success: false,
            error: { name: 'ValidationError', message: 'Invalid settings format' },
          };
        }

        StoreService.setSettings(parseResult.data);
        return { success: true, data: undefined };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );
}
