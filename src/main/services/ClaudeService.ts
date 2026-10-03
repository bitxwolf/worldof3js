import Anthropic from '@anthropic-ai/sdk';
import type { IStoreService } from './StoreService';
import type {
  UpdateWorldPayload,
  NPCReplyPayload,
} from '../../shared/ipc.types';
import {
  SceneGraphSchema,
  type SceneGraph,
} from '../../shared/schema/sceneGraph.schema';
import {
  APIKeyMissingError,
  LLMParseError,
  ValidationError,
} from '../../shared/errors';
import {
  MAX_PROMPT_LENGTH,
  MAX_NPC_CONVERSATION_TURNS,
} from '../../shared/constants';
import {
  WORLD_PARSER_SYSTEM,
  buildWorldParserUser,
} from '../../shared/prompts/world-parser.prompt';
import type { ParseWorldPayload } from '../../shared/prompts/world-parser.prompt';
import {
  buildCodegenUser,
  buildCodegenSystemWithExample,
} from '../../shared/prompts/codegen.prompt';
import type { EnrichedSceneGraph } from '../../shared/prompts/codegen.prompt';
import { enrichSceneGraph } from '../../shared/WorldEnricher';

function extractJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export class ClaudeService {
  constructor(private readonly storeService: IStoreService) {}

  private isOpenRouter(): boolean {
    const settings = this.storeService.getSettings();
    if (settings.activeProvider) {
      return settings.activeProvider === 'openai';
    }
    const apiKey = (this.storeService.getApiKey() || settings.apiKey || '').trim();
    return apiKey.startsWith('sk-or-') || apiKey.includes('openrouter');
  }

  private getModel(): string {
    const settings = this.storeService.getSettings();
    const isAnthropic = settings.activeProvider
      ? settings.activeProvider === 'anthropic'
      : !this.isOpenRouter();
    const model = isAnthropic
      ? (settings.anthropicModel || settings.model || '')
      : (settings.openaiModel || settings.model || '');
    
    if (!isAnthropic) {
      // If it's already an OpenRouter-style model with '/', use it directly
      if (model.includes('/')) return model;
      // Map known aliases
      if (model === 'claude-opus-5') return 'anthropic/claude-3-opus';
      return model || 'anthropic/claude-3.5-sonnet';
    }
    
    // Direct Anthropic SDK — reject OpenRouter model identifiers
    if (model.includes('/')) {
      // OpenRouter model ID stored but using Anthropic key — use default
      return 'claude-3-7-sonnet-20250219';
    }
    if (model === 'claude-opus-5') return 'claude-3-opus-20240229';
    return model || 'claude-3-7-sonnet-20250219';
  }

  private async executeChat(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 4096,
    signal?: AbortSignal
  ): Promise<string> {
    const settings = this.storeService.getSettings();
    const isAnthropic = settings.activeProvider
      ? settings.activeProvider === 'anthropic'
      : !this.isOpenRouter();

    const apiKey = isAnthropic
      ? (settings.anthropicApiKey || this.storeService.getApiKey())
      : (settings.openaiApiKey || this.storeService.getApiKey());
    const model = isAnthropic
      ? (settings.anthropicModel || this.getModel())
      : (settings.openaiModel || this.getModel());
    const baseUrl = isAnthropic ? 'https://api.anthropic.com' : (settings.openaiBaseUrl || 'https://openrouter.ai/api/v1');

    if (!apiKey || !apiKey.trim()) {
      throw new APIKeyMissingError();
    }

    const cappedTokens = Math.min(Math.max(1, maxTokens), 8192);

    if (!isAnthropic) {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://orbis.app',
          'X-Title': 'Orbis',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: cappedTokens,
          temperature: 0.7,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new LLMParseError('OpenRouter returned an empty response', '');
      }
      return content.trim();
    }

    // Direct Anthropic SDK
    const client = new Anthropic({ apiKey: apiKey.trim() });
    const response = await client.messages.create(
      {
        model,
        max_tokens: cappedTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal }
    );

    const firstBlock = response.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      throw new LLMParseError('Empty or invalid response from Claude API', '');
    }
    return firstBlock.text.trim();
  }

  async parseWorld(payload: ParseWorldPayload): Promise<SceneGraph> {
    if (payload.text && payload.text.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Input prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    try {
      const userPrompt = buildWorldParserUser(payload);
      const rawText = await this.executeChat(
        WORLD_PARSER_SYSTEM,
        userPrompt,
        4096,
        controller.signal
      );

      const cleaned = extractJson(rawText);

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        throw new LLMParseError(
          `Failed to parse LLM response as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          rawText
        );
      }

      const validated = SceneGraphSchema.safeParse(parsed);
      if (!validated.success) {
        throw new ValidationError(
          'Scene graph failed schema validation',
          validated.error.issues
        );
      }

      return validated.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async enrichWorld(graph: SceneGraph): Promise<EnrichedSceneGraph> {
    const claudeCall = async (system: string, user: string): Promise<string> => {
      return this.executeChat(system, user, 1024);
    };
    return enrichSceneGraph(graph, claudeCall);
  }

  async generateCode(graph: SceneGraph | EnrichedSceneGraph): Promise<string> {
    if (graph.world?.description && graph.world.description.length > MAX_PROMPT_LENGTH) {
      graph.world.description = graph.world.description.slice(0, MAX_PROMPT_LENGTH);
    }
    const rawPrompt = (graph as any).prompt || (graph as any).text;
    if (rawPrompt && typeof rawPrompt === 'string' && rawPrompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Input prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
      const enriched = graph as EnrichedSceneGraph;
      const biome = enriched.world?.biome ?? 'forest';
      const systemPrompt = buildCodegenSystemWithExample(biome);
      const userPrompt = buildCodegenUser(enriched);
      const quality = this.storeService.getSettings()?.quality ?? 'fast';
      const codegenTokens = quality === 'quality' ? 8192 : 4096;
      let code = await this.executeChat(
        systemPrompt,
        userPrompt,
        codegenTokens,
        controller.signal
      );

      // Strip out code block fences if present
      if (code.startsWith('```')) {
        code = code.replace(/^```(?:javascript|js)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      return code;
    } finally {
      clearTimeout(timer);
    }
  }

  async updateWorld(payload: UpdateWorldPayload): Promise<Partial<SceneGraph>> {
    if (payload.updatePrompt && payload.updatePrompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Update prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    try {
      const prompt = `CURRENT SCENE GRAPH:\n${JSON.stringify(payload.currentGraph, null, 2)}
\nUPDATE REQUEST:\n${payload.updatePrompt}
\nTASK: Return ONLY the JSON fragment containing modified or newly added entities (e.g. objects, characters, lights, events, atmosphere). Preserve existing IDs when modifying. Output raw JSON only.`;

      const rawText = await this.executeChat(
        WORLD_PARSER_SYSTEM,
        prompt,
        4096,
        controller.signal
      );

      const cleaned = extractJson(rawText);

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        throw new LLMParseError(
          `Failed to parse LLM update response as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          rawText
        );
      }

      const validated = SceneGraphSchema.partial().safeParse(parsed);
      if (!validated.success) {
        const issuesSummary = validated.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ');
        throw new LLMParseError(
          `Update world failed schema validation: ${issuesSummary}`,
          rawText
        );
      }

      return validated.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async npcReplyStream(
    payload: NPCReplyPayload,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const settings = this.storeService.getSettings();
    const isAnthropic = settings.activeProvider
      ? settings.activeProvider === 'anthropic'
      : !this.isOpenRouter();

    const apiKey = isAnthropic
      ? (settings.anthropicApiKey || this.storeService.getApiKey())
      : (settings.openaiApiKey || this.storeService.getApiKey());
    const model = isAnthropic
      ? (settings.anthropicModel || this.getModel())
      : (settings.openaiModel || this.getModel());
    const baseUrl = isAnthropic ? 'https://api.anthropic.com' : (settings.openaiBaseUrl || 'https://openrouter.ai/api/v1');

    if (!apiKey || !apiKey.trim()) {
      throw new APIKeyMissingError();
    }

    if (payload.playerMessage && payload.playerMessage.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Player message exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
      let systemPrompt = `You are an NPC in an interactive Three.js world. Stay in character, speak in first person, and keep answers to 2-3 sentences.`;
      if (payload.character) {
        systemPrompt += `\nYour name is ${payload.character.name}.`;
        systemPrompt += `\nPersonality: ${payload.character.personality}`;
        if (payload.character.backstory) {
          systemPrompt += `\nBackstory: ${payload.character.backstory}`;
        }
        if (payload.character.knowledge && payload.character.knowledge.length > 0) {
          systemPrompt += `\nKnowledge: ${payload.character.knowledge.join('; ')}`;
        }
        if (payload.character.secrets && payload.character.secrets.length > 0) {
          systemPrompt += `\nGuarded Secrets: ${payload.character.secrets.join('; ')} (Only reveal hints if the player is clever or persistent)`;
        }
        if (payload.character.dialogueStyle) {
          systemPrompt += `\nDialogue Style: ${payload.character.dialogueStyle}`;
        }
      }
      if (payload.worldLore) {
        systemPrompt += `\nWorld Lore: ${payload.worldLore}`;
      }

      const history = payload.dialogueHistory
        ? payload.dialogueHistory.slice(-MAX_NPC_CONVERSATION_TURNS)
        : [];
      const messages = [...history, { role: 'user' as const, content: payload.playerMessage }];

      if (!isAnthropic) {
        const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://orbis.app',
            'X-Title': 'Orbis',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages,
            ],
            max_tokens: 512,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text();
          throw new Error(`OpenRouter streaming error (${response.status}): ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
          while (true) {
            if (controller.signal.aborted) {
              throw new Error('NPC reply stream timed out after 60 seconds');
            }
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':')) continue;
              if (trimmed === 'data: [DONE]') return;
              if (trimmed.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(trimmed.slice(6));
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    onChunk(delta);
                  }
                } catch {
                  // ignore partial chunk json errors
                }
              }
            }
          }
        } catch (streamErr: unknown) {
          if (controller.signal.aborted) {
            throw new Error('NPC reply stream timed out after 60 seconds');
          }
          throw streamErr;
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // ignore release lock issues
          }
        }
        return;
      }

      // Direct Anthropic SDK
      const client = new Anthropic({ apiKey: apiKey.trim() });
      const stream = await client.messages.stream(
        {
          model,
          max_tokens: 512,
          system: systemPrompt,
          messages: messages as Anthropic.MessageParam[],
        },
        { signal: controller.signal }
      );

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          onChunk(event.delta.text);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
