import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeService } from '../src/main/services/ClaudeService';
import type { IStoreService } from '../src/main/services/StoreService';
import { LLMParseError } from '../src/shared/errors';
import { MAX_PROMPT_LENGTH, MAX_NPC_CONVERSATION_TURNS } from '../src/shared/constants';
import * as fs from 'fs';
import * as path from 'path';

// Mock Anthropic SDK
const mockStream = vi.fn();
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      };
    },
  };
});

describe('LLM Service Resilience & Vulnerability Fixes (#11, #14, #15, #16)', () => {
  let mockStore: IStoreService;
  let claude: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {
      getApiKey: vi.fn().mockReturnValue('sk-ant-test-key-12345'),
      setApiKey: vi.fn(),
      getSettings: vi.fn().mockReturnValue({
        apiKey: 'sk-ant-test-key-12345',
        model: 'claude-3-7-sonnet-20250219',
        quality: 'fast',
      }),
      setSettings: vi.fn(),
    };
    claude = new ClaudeService(mockStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 11: Schema Validation in updateWorld', () => {
    const currentGraph = {
      version: '1.0',
      world: {
        name: 'Test World',
        description: 'A test world',
        biome: 'forest' as const,
        timeOfDay: 'morning' as const,
        weather: 'clear' as const,
        scale: 'medium' as const,
      },
      player: {
        spawn: [0, 1.7, 0] as [number, number, number],
        movementSpeed: 4.0,
        jumpHeight: 1.5,
      },
      zones: [],
      characters: [],
      objects: [],
      lights: [],
      events: [],
      skybox: { type: 'gradient' as const, topColor: '#0a0a1a', bottomColor: '#2a2a4a' },
      atmosphere: { fogDensity: 0.015, fogColor: '#1a1a2e', ambientIntensity: 0.5, sunColor: '#fff4e0' },
      flags: {},
    };

    it('returns validated partial SceneGraph on valid LLM response', async () => {
      const validUpdate = {
        world: {
          name: 'Updated World Name',
          description: 'Updated description',
          biome: 'desert',
          timeOfDay: 'dusk',
          weather: 'clear',
          scale: 'large',
        },
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(validUpdate) }],
      });

      const result = await claude.updateWorld({
        currentGraph,
        updatePrompt: 'Change the biome to desert at dusk',
      });

      expect(result.world?.biome).toBe('desert');
      expect(result.world?.timeOfDay).toBe('dusk');
    });

    it('throws LLMParseError when LLM returns invalid JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'This is definitely not JSON' }],
      });

      await expect(
        claude.updateWorld({
          currentGraph,
          updatePrompt: 'Add a castle',
        })
      ).rejects.toThrow(LLMParseError);
    });

    it('throws LLMParseError when LLM response fails SceneGraphSchema validation', async () => {
      const invalidUpdate = {
        world: {
          biome: 'invalid_biome_not_in_enum',
        },
      };

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(invalidUpdate) }],
      });

      await expect(
        claude.updateWorld({
          currentGraph,
          updatePrompt: 'Make it lava biome',
        })
      ).rejects.toThrow(LLMParseError);
    });
  });

  describe('Task 14: Input Length and History Turn Caps', () => {
    it('throws error when parseWorld prompt exceeds MAX_PROMPT_LENGTH', async () => {
      const longText = 'A'.repeat(MAX_PROMPT_LENGTH + 1);
      await expect(
        claude.parseWorld({
          text: longText,
        })
      ).rejects.toThrow(/Input prompt exceeds maximum allowed length/);
    });

    it('throws error when updateWorld prompt exceeds MAX_PROMPT_LENGTH', async () => {
      const longPrompt = 'B'.repeat(MAX_PROMPT_LENGTH + 1);
      await expect(
        claude.updateWorld({
          currentGraph: {} as any,
          updatePrompt: longPrompt,
        })
      ).rejects.toThrow(/Update prompt exceeds maximum allowed length/);
    });

    it('throws error when npcReplyStream playerMessage exceeds MAX_PROMPT_LENGTH', async () => {
      const longMessage = 'C'.repeat(MAX_PROMPT_LENGTH + 1);
      await expect(
        claude.npcReplyStream(
          {
            npcId: 'npc_1',
            playerMessage: longMessage,
          },
          vi.fn()
        )
      ).rejects.toThrow(/Player message exceeds maximum allowed length/);
    });

    it('caps dialogueHistory to MAX_NPC_CONVERSATION_TURNS in npcReplyStream', async () => {
      const turns = Array.from({ length: 25 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Turn ${i}`,
      }));

      // Async iterable for stream
      mockStream.mockImplementationOnce(async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } };
      });

      const chunks: string[] = [];
      await claude.npcReplyStream(
        {
          npcId: 'npc_1',
          playerMessage: 'Hi there',
          dialogueHistory: turns,
        },
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toEqual(['Hello!']);
      expect(mockStream).toHaveBeenCalledTimes(1);
      const callArgs = mockStream.mock.calls[0][0];
      // Expected messages: last MAX_NPC_CONVERSATION_TURNS from history + 1 user playerMessage
      expect(callArgs.messages.length).toBe(MAX_NPC_CONVERSATION_TURNS + 1);
      // Verify it took the LAST turns (turn 15 to 24)
      expect(callArgs.messages[0].content).toBe('Turn 15');
      expect(callArgs.messages[MAX_NPC_CONVERSATION_TURNS - 1].content).toBe('Turn 24');
      expect(callArgs.messages[MAX_NPC_CONVERSATION_TURNS].content).toBe('Hi there');
    });
  });

  describe('Task 15: Streaming Timeout & Signal Propagation', () => {
    it('passes abort signal to Anthropic stream call', async () => {
      mockStream.mockImplementationOnce(async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } };
      });

      await claude.npcReplyStream(
        {
          npcId: 'npc_1',
          playerMessage: 'Hello',
        },
        vi.fn()
      );

      expect(mockStream).toHaveBeenCalledTimes(1);
      const streamOptions = mockStream.mock.calls[0][1];
      expect(streamOptions).toBeDefined();
      expect(streamOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it('passes abort signal to OpenRouter fetch call and handles stream', async () => {
      (mockStore.getApiKey as any).mockReturnValue('sk-or-v1-testkey');
      claude = new ClaudeService(mockStore);

      const fakeStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"漫}}]\n\ndata: [DONE]\n\n'));
          controller.close();
        },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: fakeStream,
      });
      vi.stubGlobal('fetch', mockFetch);

      const chunks: string[] = [];
      await claude.npcReplyStream(
        {
          npcId: 'npc_1',
          playerMessage: 'Hello OpenRouter',
        },
        (c) => chunks.push(c)
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
      vi.unstubAllGlobals();
    });
  });

  describe('Task 16: Native Dependency Pruning', () => {
    it('ensures sharp and marked are not in package.json dependencies', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies['sharp']).toBeUndefined();
      expect(pkg.dependencies['marked']).toBeUndefined();
      expect(pkg.devDependencies?.['sharp']).toBeUndefined();
      expect(pkg.devDependencies?.['marked']).toBeUndefined();
    });
  });
});
