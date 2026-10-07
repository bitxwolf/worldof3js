export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'openai-compatible';
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
}

export interface AgentModelConfig {
  parentAgent?: ModelConfig;
  storyAgent?: ModelConfig;
  characterAgent?: ModelConfig;
  worldAgent?: ModelConfig;
  npcAgent?: ModelConfig;
  questAgent?: ModelConfig;
  dialogueAgent?: ModelConfig;
}
