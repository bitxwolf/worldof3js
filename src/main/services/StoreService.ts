import { app, safeStorage } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings } from '../../shared/ipc.types';

function getElectronApp(): { isPackaged: boolean; getAppPath: () => string } | null {
  try {
    if (typeof app !== 'undefined' && app && typeof app.getAppPath === 'function') {
      return app;
    }
  } catch {
    // Static app import is not accessible
  }

  try {
    if (typeof require !== 'undefined') {
      const electron = require('electron');
      if (electron && electron.app && typeof electron.app.getAppPath === 'function') {
        return electron.app;
      }
    }
  } catch {
    // Dynamic require failed or not supported
  }

  return null;
}

function isEncryptionAvailable(): boolean {
  try {
    return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function readEnvFile(): Record<string, string> {
  const envVars: Record<string, string> = {};

  const electronApp = getElectronApp();
  // Only load .env when in development mode (!app.isPackaged)
  if (!electronApp || electronApp.isPackaged) {
    return envVars;
  }

  try {
    const envPath = path.resolve(electronApp.getAppPath(), '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          envVars[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn('[StoreService] Could not read .env file:', e);
  }

  return envVars;
}

const env = readEnvFile();

// Keep initial env/process fallback in memory only (never written to plaintext defaults in store)
const initialApiKey =
  env['OPENROUTER_API_KEY'] ||
  env['ANTHROPIC_API_KEY'] ||
  process.env['OPENROUTER_API_KEY'] ||
  process.env['ANTHROPIC_API_KEY'] ||
  '';

const initialModel =
  env['OPENROUTER_MODEL'] ||
  env['MODEL'] ||
  process.env['OPENROUTER_MODEL'] ||
  'nvidia/nemotron-3-ultra-550b-a55b:free';

// Store defaults: NEVER put plaintext secrets (like initialApiKey) in store defaults,
// as electron-store writes defaults to orbis-config.json in plaintext on disk.
const store = new Store<AppSettings>({
  name: 'orbis-config',
  clearInvalidConfig: true,
  defaults: {
    apiKey: '',
    model: initialModel,
    quality: 'fast',
    activeProvider: 'openai',
    openaiBaseUrl: 'https://openrouter.ai/api/v1',
    openaiApiKey: '',
    openaiModel: '',
    anthropicApiKey: '',
    anthropicModel: '',
    openaiModelList: [],
    anthropicModelList: [],
  },
});

export const StoreService = {
  getApiKey: (): string => {
    let stored = store.get('apiKey', '');
    if (stored && stored.trim()) {
      if (isEncryptionAvailable()) {
        try {
          // Try to decrypt assuming it was encrypted and stored as base64
          const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'));
          if (decrypted && decrypted.trim()) {
            return decrypted.trim();
          }
        } catch {
          // If decryption fails, it might be an old plaintext value or corrupted.
          // Fall back to the raw stored value.
        }
      }
      if (stored && stored.trim()) return stored.trim();
    }

    // Fall back to in-memory initialApiKey or process.env if store is empty
    return (
      initialApiKey ||
      process.env['OPENROUTER_API_KEY'] ||
      process.env['ANTHROPIC_API_KEY'] ||
      ''
    ).trim();
  },

  setApiKey: (key: string): void => {
    let toStore = key;
    if (key && isEncryptionAvailable()) {
      try {
        toStore = safeStorage.encryptString(key).toString('base64');
      } catch (e) {
        console.warn('[StoreService] safeStorage encryption failed, storing raw:', e);
      }
    }
    store.set('apiKey', toStore);
  },

  getOpenaiApiKey: (): string => {
    let stored = store.get('openaiApiKey', '');
    if (stored && stored.trim()) {
      if (isEncryptionAvailable()) {
        try {
          const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'));
          if (decrypted && decrypted.trim()) {
            return decrypted.trim();
          }
        } catch {
          // Fall back to raw stored
        }
      }
      if (stored && stored.trim()) return stored.trim();
    }

    return (
      env['OPENROUTER_API_KEY'] ||
      process.env['OPENROUTER_API_KEY'] ||
      (StoreService.getApiKey().startsWith('sk-or-') ? StoreService.getApiKey() : '')
    ).trim();
  },

  setOpenaiApiKey: (key: string): void => {
    let toStore = key;
    if (key && isEncryptionAvailable()) {
      try {
        toStore = safeStorage.encryptString(key).toString('base64');
      } catch (e) {
        console.warn('[StoreService] safeStorage encryption failed for openaiApiKey:', e);
      }
    }
    store.set('openaiApiKey', toStore);
  },

  getAnthropicApiKey: (): string => {
    let stored = store.get('anthropicApiKey', '');
    if (stored && stored.trim()) {
      if (isEncryptionAvailable()) {
        try {
          const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'));
          if (decrypted && decrypted.trim()) {
            return decrypted.trim();
          }
        } catch {
          // Fall back to raw stored
        }
      }
      if (stored && stored.trim()) return stored.trim();
    }

    return (
      env['ANTHROPIC_API_KEY'] ||
      process.env['ANTHROPIC_API_KEY'] ||
      (StoreService.getApiKey().startsWith('sk-ant-') ? StoreService.getApiKey() : '')
    ).trim();
  },

  setAnthropicApiKey: (key: string): void => {
    let toStore = key;
    if (key && isEncryptionAvailable()) {
      try {
        toStore = safeStorage.encryptString(key).toString('base64');
      } catch (e) {
        console.warn('[StoreService] safeStorage encryption failed for anthropicApiKey:', e);
      }
    }
    store.set('anthropicApiKey', toStore);
  },

  getSettings: (): AppSettings => {
    const s = store.store;
    const activeProvider = s.activeProvider || 'openai';
    const openaiApiKey = StoreService.getOpenaiApiKey();
    const anthropicApiKey = StoreService.getAnthropicApiKey();
    const openaiModel = s.openaiModel || (s.model || initialModel || 'nvidia/nemotron-3-ultra-550b-a55b:free');
    const anthropicModel = s.anthropicModel || '';
    const openaiBaseUrl = s.openaiBaseUrl || 'https://openrouter.ai/api/v1';

    // Active key & model
    const isAnthropic = activeProvider === 'anthropic';
    const apiKey = isAnthropic ? (anthropicApiKey || StoreService.getApiKey()) : (openaiApiKey || StoreService.getApiKey());
    const model = isAnthropic ? (anthropicModel || s.model || '') : (openaiModel || s.model || '');

    return {
      ...s,
      apiKey,
      model,
      activeProvider,
      openaiBaseUrl,
      openaiApiKey,
      openaiModel,
      anthropicApiKey,
      anthropicModel,
      openaiModelList: s.openaiModelList || [],
      anthropicModelList: s.anthropicModelList || [],
    };
  },

  setSettings: (s: Partial<AppSettings>): void => {
    const toSave: Record<string, unknown> = { ...s };

    if (s.apiKey !== undefined) {
      StoreService.setApiKey(s.apiKey);
      delete toSave.apiKey;
    }
    if (s.openaiApiKey !== undefined) {
      StoreService.setOpenaiApiKey(s.openaiApiKey);
      delete toSave.openaiApiKey;
    }
    if (s.anthropicApiKey !== undefined) {
      StoreService.setAnthropicApiKey(s.anthropicApiKey);
      delete toSave.anthropicApiKey;
    }

    if (Object.keys(toSave).length > 0) {
      store.set(toSave);
    }
  },
};

export interface IStoreService {
  getApiKey: () => string;
  setApiKey: (key: string) => void;
  getSettings: () => AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  getOpenaiApiKey?: () => string;
  setOpenaiApiKey?: (key: string) => void;
  getAnthropicApiKey?: () => string;
  setAnthropicApiKey?: (key: string) => void;
}
