export type AgentId = 'parent' | 'story' | 'character' | 'world' | 'npc' | 'quest' | 'dialogue';

export interface WorldRequest {
  prompt: string;
  theme?: string;
  worldSize?: number;
}

export interface SelectionContext {
  center: { x: number; z: number };
  radiusWorldUnits: number;
  regions?: string[];
  npcs?: string[];
  landmarks?: string[];
  activeQuests?: string[];
  biome?: string;
}

export interface AgentSummary {
  agentId: AgentId;
  nodesCreated: number;
  edgesCreated: number;
  status: string;
}

export interface ConflictEntry {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export type OrchestratorProgressEvent = {
  agentId: AgentId;
  status: 'starting' | 'running' | 'completed' | 'failed';
  step: number;
  totalSteps: number;
  message: string;
  summary?: AgentSummary;
};
