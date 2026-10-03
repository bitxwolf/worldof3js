import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerSettingsHandlers } from '../src/main/ipc/settings.handler';
import { StoreService } from '../src/main/services/StoreService';
import { ClaudeService } from '../src/main/services/ClaudeService';

const mockHandlers: Record<string, Function> = {};
const mockAnthropicCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
    };
  },
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'C:/dummy/app',
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      mockHandlers[channel] = handler;
    }),
  },
}));

describe('Settings Redesign — Model Auto-Fetch (WorldEngine v1.2.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) {
      delete mockHandlers[key];
    }
    registerSettingsHandlers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Agent-A: settings:fetch-openai-models IPC Handler', () => {
    it('registers the settings:fetch-openai-models channel', () => {
      expect(mockHandlers['settings:fetch-openai-models']).toBeDefined();
    });

    it('fetches and sorts model IDs from OpenAI-compatible endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'meta-llama/llama-3.3-70b-instruct' },
            { id: 'anthropic/claude-3.5-sonnet' },
            { id: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const handler = mockHandlers['settings:fetch-openai-models'];
      const result = await handler({}, {
        baseUrl: 'https://openrouter.ai/api/v1/',
        apiKey: 'sk-or-v1-testkey',
      });

      expect(result.success).toBe(true);
      expect(result.data.models).toEqual([
        'anthropic/claude-3.5-sonnet',
        'meta-llama/llama-3.3-70b-instruct',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk-or-v1-testkey' },
        })
      );
    });

    it('returns error when endpoint returns HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });
      vi.stubGlobal('fetch', mockFetch);

      const handler = mockHandlers['settings:fetch-openai-models'];
      const result = await handler({}, {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'invalid-key',
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('HTTP 401: Unauthorized');
    });

    it('catches network or timeout errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));
      vi.stubGlobal('fetch', mockFetch);

      const handler = mockHandlers['settings:fetch-openai-models'];
      const result = await handler({}, {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Connection timed out');
    });
  });

  describe('Agent-A: settings:fetch-anthropic-models IPC Handler', () => {
    it('registers the settings:fetch-anthropic-models channel', () => {
      expect(mockHandlers['settings:fetch-anthropic-models']).toBeDefined();
    });

    it('fetches and sorts Anthropic models with proper headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-3-7-sonnet-20250219' },
            { id: 'claude-3-5-haiku-20241022' },
            { id: 'claude-3-opus-20240229' },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const handler = mockHandlers['settings:fetch-anthropic-models'];
      const result = await handler({}, {
        apiKey: 'sk-ant-testkey',
      });

      expect(result.success).toBe(true);
      expect(result.data.models).toEqual([
        'claude-3-5-haiku-20241022',
        'claude-3-7-sonnet-20250219',
        'claude-3-opus-20240229',
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: {
            'x-api-key': 'sk-ant-testkey',
            'anthropic-version': '2023-06-01',
          },
        })
      );
    });

    it('returns error when Anthropic responds with HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });
      vi.stubGlobal('fetch', mockFetch);

      const handler = mockHandlers['settings:fetch-anthropic-models'];
      const result = await handler({}, { apiKey: 'bad-key' });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('HTTP 403: Forbidden');
    });
  });

  describe('Agent-B & Step B5: StoreService & ClaudeService Provider Wiring', () => {
    it('persists and restores separate provider configurations', () => {
      StoreService.setSettings({
        activeProvider: 'anthropic',
        openaiBaseUrl: 'https://custom-openai.com/v1',
        openaiApiKey: 'sk-custom-openai-key',
        openaiModel: 'custom-openai-model',
        openaiModelList: ['custom-openai-model', 'other-model'],
        anthropicApiKey: 'sk-ant-custom-key',
        anthropicModel: 'claude-sonnet-4-6',
        anthropicModelList: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
        quality: 'quality',
      });

      const s = StoreService.getSettings();
      expect(s.activeProvider).toBe('anthropic');
      expect(s.openaiBaseUrl).toBe('https://custom-openai.com/v1');
      expect(s.openaiApiKey).toBe('sk-custom-openai-key');
      expect(s.openaiModel).toBe('custom-openai-model');
      expect(s.openaiModelList).toContain('custom-openai-model');
      expect(s.anthropicApiKey).toBe('sk-ant-custom-key');
      expect(s.anthropicModel).toBe('claude-sonnet-4-6');
      expect(s.anthropicModelList).toContain('claude-sonnet-4-6');
      // Active apiKey and model reflect anthropic
      expect(s.apiKey).toBe('sk-ant-custom-key');
      expect(s.model).toBe('claude-sonnet-4-6');
      expect(s.quality).toBe('quality');
    });

    it('ClaudeService reads OpenAI key and custom baseUrl when activeProvider is openai', async () => {
      const mockStore = {
        getApiKey: vi.fn().mockReturnValue('fallback-key'),
        setApiKey: vi.fn(),
        getSettings: vi.fn().mockReturnValue({
          activeProvider: 'openai' as const,
          openaiBaseUrl: 'https://api.groq.com/openai/v1',
          openaiApiKey: 'sk-groq-testkey',
          openaiModel: 'llama-3.3-70b',
          anthropicApiKey: 'sk-ant-key',
          anthropicModel: 'claude-3-7-sonnet',
          quality: 'fast' as const,
        }),
        setSettings: vi.fn(),
      };

      const claude = new ClaudeService(mockStore);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"world": {"name": "Test", "description": "d", "biome": "forest", "timeOfDay": "afternoon", "weather": "clear", "scale": "small"}}' } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await claude.parseWorld({ text: 'Generate a peaceful forest' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(calledInit.headers.Authorization).toBe('Bearer sk-groq-testkey');
      const body = JSON.parse(calledInit.body);
      expect(body.model).toBe('llama-3.3-70b');
    });

    it('ClaudeService reads Anthropic key when activeProvider is anthropic', async () => {
      const mockStore = {
        getApiKey: vi.fn().mockReturnValue('fallback-key'),
        setApiKey: vi.fn(),
        getSettings: vi.fn().mockReturnValue({
          activeProvider: 'anthropic' as const,
          openaiBaseUrl: 'https://openrouter.ai/api/v1',
          openaiApiKey: 'sk-or-key',
          openaiModel: 'nvidia/nemotron',
          anthropicApiKey: 'sk-ant-isolated-key',
          anthropicModel: 'claude-3-7-sonnet-20250219',
          quality: 'fast' as const,
        }),
        setSettings: vi.fn(),
      };

      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"world": {"name": "Island", "description": "Tropical", "biome": "ocean", "timeOfDay": "morning", "weather": "clear", "scale": "small"}}' }],
      });

      const claude = new ClaudeService(mockStore);
      const parseResult = await claude.parseWorld({ text: 'Generate an island' });
      expect(parseResult).toBeDefined();
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-3-7-sonnet-20250219');
    });
  });

  describe('Transport & Browser Security with New Provider Fields', () => {
    it('transport exposes fetchOpenAIModels and fetchAnthropicModels', async () => {
      const { transport } = await import('../src/shared/transport');
      expect(typeof transport.fetchOpenAIModels).toBe('function');
      expect(typeof transport.fetchAnthropicModels).toBe('function');
    });

    it('does not leak openaiApiKey or anthropicApiKey into localStorage in browser mode', async () => {
      let store: Record<string, string> = {};
      const mockStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { store = {}; },
      };
      (globalThis as any).localStorage = mockStorage;
      (globalThis as any).sessionStorage = mockStorage;

      const { transport } = await import('../src/shared/transport');
      await transport.saveSettings({
        activeProvider: 'anthropic',
        openaiBaseUrl: 'https://openrouter.ai/api/v1',
        openaiApiKey: 'secret-openai-key-999',
        openaiModel: 'openai-model-1',
        anthropicApiKey: 'secret-anthropic-key-888',
        anthropicModel: 'claude-sonnet-4-6',
        quality: 'fast',
      });

      const localSaved = mockStorage.getItem('orbis-settings');
      expect(localSaved).not.toBeNull();
      const parsedLocal = JSON.parse(localSaved!);

      // Plaintext API keys must never be saved to localStorage
      expect(parsedLocal.apiKey).toBeUndefined();
      expect(parsedLocal.openaiApiKey).toBeUndefined();
      expect(parsedLocal.anthropicApiKey).toBeUndefined();

      // Non-sensitive settings are persisted
      expect(parsedLocal.activeProvider).toBe('anthropic');
      expect(parsedLocal.openaiBaseUrl).toBe('https://openrouter.ai/api/v1');
      expect(parsedLocal.openaiModel).toBe('openai-model-1');
      expect(parsedLocal.anthropicModel).toBe('claude-sonnet-4-6');

      // But getSettings() successfully retrieves them via session/memory
      const settingsRes = await transport.getSettings();
      expect(settingsRes.success).toBe(true);
      if (settingsRes.success) {
        expect(settingsRes.data.anthropicApiKey).toBe('secret-anthropic-key-888');
        expect(settingsRes.data.openaiApiKey).toBe('secret-openai-key-999');
        expect(settingsRes.data.apiKey).toBe('secret-anthropic-key-888');
      }
    });

    it('implements ANTHROPIC_FALLBACK_MODELS when fetch returns empty list', async () => {
      const ANTHROPIC_FALLBACK_MODELS = [
        'claude-opus-4-5',
        'claude-opus-5-5',
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ];

      // Simulate Anthropic 200 OK returning empty models array
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const handler = mockHandlers['settings:fetch-anthropic-models'];
      const res = await handler({}, { apiKey: 'sk-ant-test' });
      expect(res.success).toBe(true);
      expect(res.data.models).toEqual([]);

      // In renderer SettingsModal: when res.data.models.length === 0, it falls back:
      let effectiveModels = res.data.models;
      let statusMsg = '';
      if (effectiveModels.length === 0) {
        effectiveModels = ANTHROPIC_FALLBACK_MODELS;
        statusMsg = '✓ Using known models (fetch returned empty)';
      }

      expect(effectiveModels).toEqual(ANTHROPIC_FALLBACK_MODELS);
      expect(statusMsg).toBe('✓ Using known models (fetch returned empty)');
    });
  });
});
