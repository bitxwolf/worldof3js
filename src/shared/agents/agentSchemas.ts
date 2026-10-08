import { z } from 'zod';

// --- WorldRequest schema (what Parent receives from user) ---
export const WorldRequestSchema = z.object({
  sessionId: z.string().min(1),
  rawPrompt: z.string().min(1).max(8000),
  mode: z.enum(['detailed', 'quick']),
  imageDescriptions: z.array(z.object({
    tag: z.enum(['character', 'scene', 'texture', 'map']),
    description: z.string(),
  })).optional(),
  document: z.string().optional(),
});

// --- Story Agent output ---
export const StoryOutputSchema = z.object({
  genre: z.string().min(1),
  tone: z.string().min(1),
  themes: z.array(z.string()).min(1).max(8),
  history: z.string().min(10).max(2000),
  centralConflict: z.string().min(10).max(500),
  factions: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    ideology: z.string().min(1),
    territory: z.string().optional(),
  })).min(1).max(6),
});

// --- Character Agent output ---
export const CharacterOutputSchema = z.object({
  characters: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1).max(80),
    role: z.enum(['protagonist', 'antagonist', 'supporting']),
    factionId: z.string().min(1),
    personality: z.string().min(1).max(300),
    motivation: z.string().min(1).max(300),
    physicalDescription: z.string().min(1).max(300),
    arcSummary: z.string().min(1).max(500),
  })).min(1).max(12),
  relationships: z.array(z.object({
    fromId: z.string(),
    toId: z.string(),
    type: z.enum(['ALLIED_WITH', 'HOSTILE_TO', 'RIVAL_OF', 'FAMILY_OF', 'NEUTRAL_TO']),
  })),
});

// --- World Agent output ---
export const WorldOutputSchema = z.object({
  regions: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    biome: z.enum(['pine', 'cyber', 'canyon', 'alien', 'ruins']),
    climate: z.string().min(1),
    dominantFactionId: z.string().min(1),
    description: z.string().min(1).max(500),
    elevationAmplitude: z.number().int().min(0).max(20),
    compassCell: z.string().min(1), // 'N', 'NE', 'center', etc.
    size: z.enum(['small', 'medium', 'large']),
  })).min(1).max(8),
  landmarks: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    regionId: z.string().min(1),
    significance: z.string().min(1).max(300),
  })).max(20),
});

// --- NPC Agent output ---
export const NPCOutputSchema = z.object({
  npcs: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1).max(80),
    type: z.enum(['vendor', 'guard', 'quest_giver', 'ambient']),
    regionId: z.string().min(1),
    factionId: z.string().min(1),
    wanderRadius: z.number().positive().max(200),
    dialogueSeed: z.string().min(1).max(200),
    behaviorFlags: z.record(z.boolean()).default({}),
  })).min(1).max(30),
});

// --- Quest Agent output ---
export const QuestOutputSchema = z.object({
  quests: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    title: z.string().min(1).max(100),
    giverNpcId: z.string().min(1),
    objectiveType: z.string().min(1),
    targetRegionId: z.string().min(1),
    reward: z.string().min(1).max(200),
    branchConditions: z.array(z.string()).max(4),
    unlocksQuestId: z.string().optional(), // for quest chains
  })).min(1).max(10),
});

// --- Dialogue Agent output ---
export const DialogueOutputSchema = z.object({
  dialogueTrees: z.array(z.object({
    npcId: z.string().min(1),
    greeting: z.array(z.string().max(120)).min(1).max(4),
    questDialogue: z.record(z.array(z.string().max(120))),
    ambientLines: z.array(z.string().max(120)).max(6),
    completionLines: z.array(z.string().max(120)).max(4),
  })),
});

export type StoryOutput = z.infer<typeof StoryOutputSchema>;
export type CharacterOutput = z.infer<typeof CharacterOutputSchema>;
export type WorldOutput = z.infer<typeof WorldOutputSchema>;
export type NPCOutput = z.infer<typeof NPCOutputSchema>;
export type QuestOutput = z.infer<typeof QuestOutputSchema>;
export type DialogueOutput = z.infer<typeof DialogueOutputSchema>;
