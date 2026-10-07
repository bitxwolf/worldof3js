import { z } from 'zod';

export const WorldRequestSchema = z.object({
  prompt: z.string(),
  theme: z.string().optional(),
  worldSize: z.number().optional(),
});

export const StoryOutputSchema = z.object({
  title: z.string(),
  lore: z.string(),
  factions: z.array(z.string()),
});

export const CharacterOutputSchema = z.object({
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    faction: z.string().optional(),
  })),
});

export const WorldOutputSchema = z.object({
  regions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    biome: z.enum(['pine', 'cyber', 'canyon', 'alien', 'ruins']),
    elevation_amplitude: z.number().min(0).max(20),
  })),
  landmarks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    regionId: z.string(),
  })),
});

export const NPCOutputSchema = z.object({
  npcs: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    regionId: z.string().optional(),
  })),
});

export const QuestOutputSchema = z.object({
  quests: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    giverId: z.string().optional(),
  })),
});

export const DialogueOutputSchema = z.object({
  dialogueTree: z.object({
    id: z.string(),
    nodes: z.array(z.object({
      id: z.string(),
      text: z.string(),
    })),
  }),
});
