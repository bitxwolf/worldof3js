import type { AgentId } from '../agents/agentTypes';

export type LLMProvider = 'anthropic' | 'openai' | 'openai-compatible';

export interface ModelConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;   // for openai-compatible providers (Ollama, Groq, Mistral, etc.)
  model: string;      // e.g. 'claude-3-7-sonnet-20250219', 'gpt-4o', 'mistral-large'
  maxTokens?: number; // defaults to 4096
}

// Optional per-agent model overrides. If not set, falls back to global ModelConfig.
export type AgentModelConfig = Partial<Record<AgentId, Partial<ModelConfig>>>;

// Frontier model hints displayed in the UI (never used as runtime defaults)
export const FRONTIER_MODEL_HINTS = {
  anthropic: [
    'claude-opus-4-5',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  complex_task_note:
    'For parent orchestrator and complex world tasks (novels, deep faction trees), frontier models like Claude 3.5/3.7 or GPT-4o are strongly recommended.',
} as const;

export class ModelNotConfiguredError extends Error {
  constructor(agentId: string) {
    super(`No model configured for agent '${agentId}'. Set a model in Settings.`);
    this.name = 'ModelNotConfiguredError';
  }
}
