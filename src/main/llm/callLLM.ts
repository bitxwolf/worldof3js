import type { AgentId } from '../../shared/agents/agentTypes';
import type { ModelConfig, AgentModelConfig } from '../../shared/config/modelConfig';
import { ModelNotConfiguredError } from '../../shared/config/modelConfig';
import type { AppSettings } from '../../shared/ipc.types';
import type { IStoreService } from '../services/StoreService';

/**
 * Resolves the effective ModelConfig for a given agent.
 * Resolution order: per-agent override → global AppSettings.
 */
export function resolveModelConfig(
  agentId: AgentId,
  settings: AppSettings
): ModelConfig {
  const overrides: AgentModelConfig = settings.agentModelOverrides ?? {};
  const agentOverride = overrides[agentId];

  // Derive global config from AppSettings
  const isAnthropic = (settings.activeProvider ?? 'openai') === 'anthropic';
  const globalProvider = isAnthropic ? 'anthropic' : 'openai-compatible';
  const globalApiKey = isAnthropic
    ? (settings.anthropicApiKey ?? settings.apiKey ?? '')
    : (settings.openaiApiKey ?? settings.apiKey ?? '');
  const globalModel = isAnthropic
    ? (settings.anthropicModel ?? settings.model ?? '')
    : (settings.openaiModel ?? settings.model ?? '');
  const globalBaseUrl = settings.openaiBaseUrl ?? 'https://openrouter.ai/api/v1';

  const global: ModelConfig = {
    provider: globalProvider,
    apiKey: globalApiKey,
    baseUrl: isAnthropic ? 'https://api.anthropic.com' : globalBaseUrl,
    model: globalModel,
    maxTokens: 4096,
  };

  if (!agentOverride) return global;

  // Merge per-agent override on top of global
  return {
    provider: agentOverride.provider ?? global.provider,
    apiKey: agentOverride.apiKey ?? global.apiKey,
    baseUrl: agentOverride.baseUrl ?? global.baseUrl,
    model: agentOverride.model ?? global.model,
    maxTokens: agentOverride.maxTokens ?? global.maxTokens,
  };
}

export interface CallLLMParams {
  systemPrompt: string;
  userMessage: string;
  agentId: AgentId;
  maxTokens?: number;
  signal?: AbortSignal;
  storeService: IStoreService;
}

/**
 * Single LLM abstraction layer. Handles both Anthropic and OpenAI-compatible APIs.
 * Never returns void — always returns the assistant text or throws.
 * Never has hardcoded model fallbacks — throws ModelNotConfiguredError if unconfigured.
 */
export async function callLLM(params: CallLLMParams): Promise<string> {
  const { systemPrompt, userMessage, agentId, signal, storeService } = params;
  const settings = storeService.getSettings();
  const config = resolveModelConfig(agentId, settings);

  if (!config.apiKey || !config.apiKey.trim()) {
    throw new ModelNotConfiguredError(agentId);
  }
  if (!config.model || !config.model.trim()) {
    throw new ModelNotConfiguredError(agentId);
  }

  const maxTokens = params.maxTokens ?? config.maxTokens ?? 4096;
  const cappedTokens = Math.min(Math.max(1, maxTokens), 8192);

  if (config.provider === 'anthropic') {
    // Direct Anthropic SDK path
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.apiKey.trim() });
    const response = await client.messages.create(
      {
        model: config.model.trim(),
        max_tokens: cappedTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal }
    );
    const firstBlock = response.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      throw new Error(`[callLLM:${agentId}] Empty or non-text response from Anthropic API`);
    }
    return firstBlock.text.trim();
  }

  // OpenAI-compatible path (openai, openai-compatible)
  const baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://orbis.app',
      'X-Title': 'Orbis',
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: cappedTokens,
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[callLLM:${agentId}] API error (${response.status}): ${errText}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (json.error?.message) {
    throw new Error(`[callLLM:${agentId}] API returned error: ${json.error.message}`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error(`[callLLM:${agentId}] API returned empty response`);
  }

  return content.trim();
}
