import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock localStorage and sessionStorage for Node/Vitest test environment
function createMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

const mockLocalStorage = createMockStorage();
const mockSessionStorage = createMockStorage();

// Set globals before importing transport
(globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;
(globalThis as unknown as { sessionStorage: typeof mockSessionStorage }).sessionStorage = mockSessionStorage;

import { transport } from '../src/shared/transport';

describe('Vulnerabilities #4, #5, #6: Security & Configuration', () => {
  describe('Task 4 & Browser Fallback Secret Storage (transport.ts)', () => {
    beforeEach(() => {
      mockLocalStorage.clear();
      mockSessionStorage.clear();
    });

    it('does not persist plaintext API keys permanently to localStorage', async () => {
      await transport.saveSettings({
        apiKey: 'secret-test-key-12345',
        model: 'custom-model',
        quality: 'quality',
      });

      // Verify localStorage content
      const storedInLocal = mockLocalStorage.getItem('orbis-settings');
      expect(storedInLocal).not.toBeNull();
      const parsedLocal = JSON.parse(storedInLocal!);

      // Plaintext API key must NOT be in localStorage
      expect(parsedLocal.apiKey).toBeUndefined();
      expect(parsedLocal.model).toBe('custom-model');
      expect(parsedLocal.quality).toBe('quality');

      // But getSettings() should retrieve the key from session / in-memory
      const settingsRes = await transport.getSettings();
      expect(settingsRes.success).toBe(true);
      if (settingsRes.success) {
        expect(settingsRes.data.apiKey).toBe('secret-test-key-12345');
        expect(settingsRes.data.model).toBe('custom-model');
      }
    });

    it('purges legacy plaintext API keys from localStorage on load', async () => {
      // Simulate legacy insecure state where apiKey was stored in localStorage
      mockLocalStorage.setItem(
        'story-engine-settings',
        JSON.stringify({
          apiKey: 'legacy-leaked-key',
          model: 'test-model',
          quality: 'fast',
        })
      );

      const settingsRes = await transport.getSettings();
      expect(settingsRes.success).toBe(true);
      if (settingsRes.success) {
        expect(settingsRes.data.apiKey).toBe('legacy-leaked-key');
      }

      // After loading, localStorage should be cleansed of the plaintext apiKey
      const storedInLocal = mockLocalStorage.getItem('orbis-settings');
      const parsedLocal = JSON.parse(storedInLocal!);
      expect(parsedLocal.apiKey).toBeUndefined();
    });
  });

  describe('Task 5: Environment & Packaging Sanitization', () => {
    const LEAKED_KEY_PATTERN = /sk-or-v1-[0-9a-f]{32,}/i;

    it('sanitizes .env and ensures active secret key is removed', () => {
      const envPath = path.resolve(__dirname, '../.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        expect(content).not.toMatch(LEAKED_KEY_PATTERN);
        expect(content).toContain('your-openrouter-api-key-here');
      }
    });

    it('provides .env.example with placeholder variables', () => {
      const examplePath = path.resolve(__dirname, '../.env.example');
      expect(fs.existsSync(examplePath)).toBe(true);

      const content = fs.readFileSync(examplePath, 'utf-8');
      expect(content).not.toMatch(LEAKED_KEY_PATTERN);
      expect(content).toContain('OPENROUTER_API_KEY');
      expect(content).toContain('your-openrouter-api-key-here');
    });

    it('configures electron-builder.yml to exclude secrets and tests from app.asar', () => {
      const builderPath = path.resolve(__dirname, '../electron-builder.yml');
      expect(fs.existsSync(builderPath)).toBe(true);

      const content = fs.readFileSync(builderPath, 'utf-8');
      expect(content).toMatch(/!\*\*\/\.env/);
      expect(content).toMatch(/!tests\//);
      expect(content).toContain('asar: true');
    });
  });

  describe('Task 6 & Task 4: StoreService Configuration Integrity', () => {
    it('does not use process.cwd() for .env and sets apiKey default to empty string', () => {
      const storeServicePath = path.resolve(__dirname, '../src/main/services/StoreService.ts');
      const content = fs.readFileSync(storeServicePath, 'utf-8');

      // Task 6: CWD-dependent environment ingestion must be removed
      expect(content).not.toContain('process.cwd()');
      expect(content).toContain('getAppPath()');
      expect(content).toContain('isPackaged');

      // Task 4: Store defaults must set apiKey: ''
      expect(content).toMatch(/defaults:\s*\{\s*apiKey:\s*['"]['"]/);
      expect(content).not.toMatch(/defaults:\s*\{\s*apiKey:\s*initialApiKey/);
    });
  });
});
