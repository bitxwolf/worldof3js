import type { AgentId, ViewportBiomeType } from '../agents/agentTypes';

export type GraphNodeType =
  | 'story'
  | 'faction'
  | 'character'
  | 'region'
  | 'landmark'
  | 'npc'
  | 'quest'
  | 'dialogue_tree'
  | 'conflict_flag';

export type GraphEdgeType =
  | 'MEMBER_OF'
  | 'LOCATED_IN'
  | 'CONTROLS'
  | 'GIVES_QUEST'
  | 'TARGETS'
  | 'UNLOCKS'
  | 'ALLIED_WITH'
  | 'HOSTILE_TO'
  | 'RIVAL_OF'
  | 'FAMILY_OF'
  | 'NEUTRAL_TO'
  | 'SPEAKS';

// Attribute bags per node type
export interface StoryAttrs {
  genre: string;
  tone: string;
  themes: string[];
  history: string;
  centralConflict: string;
}

export interface FactionAttrs {
  name: string;
  ideology: string;
  territory?: string;
}

export interface CharacterAttrs {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting';
  factionId: string;
  personality: string;
  motivation: string;
  physicalDescription: string;
  arcSummary: string;
}

export interface RegionAttrs {
  name: string;
  biome: ViewportBiomeType;
  climate: string;
  dominantFactionId: string;
  description: string;
  elevationAmplitude: number; // 0–20
  compassCell: string; // e.g. 'N', 'SW', 'center'
  size: 'small' | 'medium' | 'large';
}

export interface LandmarkAttrs {
  name: string;
  regionId: string;
  significance: string;
  assetId?: string;
  assetTag?: string;
}

export interface NPCAttrs {
  name: string;
  type: 'vendor' | 'guard' | 'quest_giver' | 'ambient';
  regionId: string;
  factionId: string;
  wanderRadius: number;
  dialogueSeed: string;
  behaviorFlags: Record<string, boolean>;
  modelId?: string;
  archetype?: string;
}

export interface QuestAttrs {
  title: string;
  giverNpcId: string;
  objectiveType: string;
  targetRegionId: string;
  reward: string;
  branchConditions: string[];
}

export interface DialogueTreeAttrs {
  npcId: string;
  greeting: string[];
  questDialogue: Record<string, string[]>; // questId → lines
  ambientLines: string[];
  completionLines: string[];
}

export interface ConflictFlagAttrs {
  description: string;
  resolvedBy?: AgentId;
}

export type NodeAttrs =
  | StoryAttrs
  | FactionAttrs
  | CharacterAttrs
  | RegionAttrs
  | LandmarkAttrs
  | NPCAttrs
  | QuestAttrs
  | DialogueTreeAttrs
  | ConflictFlagAttrs;

export interface GraphNodeRecord {
  id: string;
  type: GraphNodeType;
  attrs: NodeAttrs;
  x: number;
  y: number;
  z: number;
  createdBy: AgentId;
  version: number;
  updatedAt: number;
}

export interface GraphEdgeRecord {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  attrs?: Record<string, unknown>;
  createdBy: AgentId;
}

export interface AgentRunRecord {
  id: string;
  sessionId: string;
  agentId: AgentId;
  startedAt: number;
  finishedAt: number;
  status: 'success' | 'failed' | 'retried';
  inputSlice: string; // JSON string of slice sent to LLM
  rawOutput: string;  // raw LLM text response
  summary: string;
  error?: string;
}
