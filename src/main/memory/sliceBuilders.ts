import type { WorldGraph } from './WorldGraph';
import type { StoryAttrs, FactionAttrs, CharacterAttrs, RegionAttrs, NPCAttrs, QuestAttrs } from '../../shared/graph/graphTypes';

const MAX_HISTORY_CHARS = 800;
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function buildStorySlice(_graph: WorldGraph): Record<string, unknown> {
  // Story runs first — no prior graph data needed
  return { note: 'You are generating the foundational story. No prior context exists.' };
}

export function buildCharacterSlice(graph: WorldGraph): Record<string, unknown> {
  const story = graph.getNodesByType('story')[0];
  const factions = graph.getNodesByType('faction');
  return {
    story: story ? {
      genre: (story.attrs as StoryAttrs).genre,
      tone: (story.attrs as StoryAttrs).tone,
      themes: (story.attrs as StoryAttrs).themes,
      centralConflict: (story.attrs as StoryAttrs).centralConflict,
    } : null,
    factions: factions.map((f) => ({
      id: f.id,
      name: (f.attrs as FactionAttrs).name,
      ideology: (f.attrs as FactionAttrs).ideology,
    })),
  };
}

export function buildWorldSlice(graph: WorldGraph): Record<string, unknown> {
  const story = graph.getNodesByType('story')[0];
  const factions = graph.getNodesByType('faction');
  return {
    story: story ? {
      genre: (story.attrs as StoryAttrs).genre,
      tone: (story.attrs as StoryAttrs).tone,
      themes: (story.attrs as StoryAttrs).themes,
      history: truncate((story.attrs as StoryAttrs).history, MAX_HISTORY_CHARS),
    } : null,
    factions: factions.map((f) => ({ id: f.id, name: (f.attrs as FactionAttrs).name })),
  };
}

export function buildNpcSlice(graph: WorldGraph): Record<string, unknown> {
  const factions = graph.getNodesByType('faction');
  const characters = graph.getNodesByType('character');
  const regions = graph.getNodesByType('region');
  return {
    factions: factions.map((f) => ({ id: f.id, name: (f.attrs as FactionAttrs).name })),
    regions: regions.map((r) => ({ id: r.id, name: (r.attrs as RegionAttrs).name, biome: (r.attrs as RegionAttrs).biome })),
    mainCharacters: characters.slice(0, 6).map((c) => ({ id: c.id, name: (c.attrs as CharacterAttrs).name, factionId: (c.attrs as CharacterAttrs).factionId })),
  };
}

export function buildQuestSlice(graph: WorldGraph): Record<string, unknown> {
  const regions = graph.getNodesByType('region');
  const npcs = graph.getNodesByType('npc');
  const story = graph.getNodesByType('story')[0];
  return {
    centralConflict: story ? (story.attrs as StoryAttrs).centralConflict : '',
    regions: regions.map((r) => ({ id: r.id, name: (r.attrs as RegionAttrs).name })),
    questGiverCandidates: npcs.filter((n) => (n.attrs as NPCAttrs).type === 'quest_giver').map((n) => ({ id: n.id, name: (n.attrs as NPCAttrs).name, regionId: (n.attrs as NPCAttrs).regionId })),
  };
}

export function buildDialogueSlice(graph: WorldGraph): Record<string, unknown> {
  const story = graph.getNodesByType('story')[0];
  const npcs = graph.getNodesByType('npc');
  const quests = graph.getNodesByType('quest');
  return {
    tone: story ? (story.attrs as StoryAttrs).tone : '',
    themes: story ? (story.attrs as StoryAttrs).themes : [],
    npcs: npcs.map((n) => ({ id: n.id, name: (n.attrs as NPCAttrs).name, type: (n.attrs as NPCAttrs).type, factionId: (n.attrs as NPCAttrs).factionId, dialogueSeed: (n.attrs as NPCAttrs).dialogueSeed })),
    quests: quests.map((q) => ({ id: q.id, title: (q.attrs as QuestAttrs).title, giverNpcId: (q.attrs as QuestAttrs).giverNpcId })),
  };
}
