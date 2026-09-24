import { safeStorage } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings } from '../../shared/ipc.types';

function readEnvFile(): Record<string, string> {
  const envVars: Record<string, string> = {};
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
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
    } catch (e) {
      console.warn('[StoreService] Could not read .env file:', e);
    }
  }
  return envVars;
}

const env = readEnvFile();

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


const store = new Store<AppSettings>({
  name: 'story-engine-config',
  clearInvalidConfig: true,
  defaults: {
    apiKey: initialApiKey,
    model: initialModel,
    quality: 'fast',
  },
});

export const StoreService = {
  getApiKey: (): string => {
    let stored = store.get('apiKey', '');
    if (stored && stored.trim()) {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          // Try to decrypt assuming it was encrypted and stored as base64
          stored = safeStorage.decryptString(Buffer.from(stored, 'base64'));
        } catch (e) {
          // If decryption fails, it might be an old plaintext value or corrupted.
          // We'll just fall back to the raw stored value.
        }
      }
      if (stored && stored.trim()) return stored.trim();
    }
    return (
      env['OPENROUTER_API_KEY'] ||
      env['ANTHROPIC_API_KEY'] ||
      process.env['OPENROUTER_API_KEY'] ||
      process.env['ANTHROPIC_API_KEY'] ||
      ''
    ).trim();
  },
  setApiKey: (key: string): void => {
    let toStore = key;
    if (key && safeStorage.isEncryptionAvailable()) {
      toStore = safeStorage.encryptString(key).toString('base64');
    }
    store.set('apiKey', toStore);
  },
  getSettings: (): AppSettings => {
    const s = store.store;
    const model = (s.model && s.model.trim()) ? s.model : (initialModel || 'nvidia/nemotron-3-ultra-550b-a55b:free');
    const apiKey = StoreService.getApiKey();
    return { ...s, apiKey, model };
  },
  setSettings: (s: Partial<AppSettings>): void => {
    if (s.apiKey !== undefined) {
      StoreService.setApiKey(s.apiKey);
      const { apiKey, ...rest } = s;
      if (Object.keys(rest).length > 0) {
        store.set(rest);
      }
    } else {
      store.set(s);
    }
  },
};

export type IStoreService = typeof StoreService;
