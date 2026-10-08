import type { ConflictEntry, AgentId } from '../../shared/agents/agentTypes';
import type { WorldGraph } from '../memory/WorldGraph';
import type {
  CharacterAttrs, NPCAttrs, QuestAttrs, DialogueTreeAttrs,
  RegionAttrs
} from '../../shared/graph/graphTypes';

export function checkCharacters(graph: WorldGraph): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const factions = new Set(graph.getNodesByType('faction').map(n => n.id));
  const chars = graph.getNodesByType('character');
  const names = new Set<string>();

  for (const c of chars) {
    const attrs = c.attrs as CharacterAttrs;
    if (!factions.has(attrs.factionId)) {
      conflicts.push({
        agentId: 'character',
        type: 'invalid_faction',
        description: `Character '${attrs.name}' belongs to non-existent faction '${attrs.factionId}'.`,
        retryCount: 0
      });
    }
    if (names.has(attrs.name)) {
      conflicts.push({
        agentId: 'character',
        type: 'duplicate_name',
        description: `Character name '${attrs.name}' is duplicated.`,
        retryCount: 0
      });
    }
    names.add(attrs.name);
  }
  return conflicts;
}

export function checkWorld(graph: WorldGraph): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const factions = new Set(graph.getNodesByType('faction').map(n => n.id));
  const regions = graph.getNodesByType('region');
  const regionIds = new Set(regions.map(r => r.id));
  const landmarks = graph.getNodesByType('landmark');

  for (const r of regions) {
    const attrs = r.attrs as RegionAttrs;
    if (attrs.dominantFactionId && !factions.has(attrs.dominantFactionId)) {
      conflicts.push({
        agentId: 'world',
        type: 'invalid_faction',
        description: `Region '${attrs.name}' is dominated by non-existent faction '${attrs.dominantFactionId}'.`,
        retryCount: 0
      });
    }
  }

  for (const l of landmarks) {
    const attrs = l.attrs as any;
    if (!regionIds.has(attrs.regionId)) {
      conflicts.push({
        agentId: 'world',
        type: 'invalid_region',
        description: `Landmark '${attrs.name}' is in non-existent region '${attrs.regionId}'.`,
        retryCount: 0
      });
    }
  }
  return conflicts;
}

export function checkNpcs(graph: WorldGraph): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const regions = new Set(graph.getNodesByType('region').map(n => n.id));
  const factions = new Set(graph.getNodesByType('faction').map(n => n.id));
  const npcs = graph.getNodesByType('npc');
  const names = new Set<string>();

  for (const n of npcs) {
    const attrs = n.attrs as NPCAttrs;
    if (!regions.has(attrs.regionId)) {
      conflicts.push({
        agentId: 'npc',
        type: 'invalid_region',
        description: `NPC '${attrs.name}' is in non-existent region '${attrs.regionId}'.`,
        retryCount: 0
      });
    }
    if (attrs.factionId && !factions.has(attrs.factionId)) {
      conflicts.push({
        agentId: 'npc',
        type: 'invalid_faction',
        description: `NPC '${attrs.name}' belongs to non-existent faction '${attrs.factionId}'.`,
        retryCount: 0
      });
    }
    if (names.has(attrs.name)) {
      conflicts.push({
        agentId: 'npc',
        type: 'duplicate_name',
        description: `NPC name '${attrs.name}' is duplicated.`,
        retryCount: 0
      });
    }
    names.add(attrs.name);
  }
  return conflicts;
}

export function checkQuests(graph: WorldGraph): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const npcs = new Set(graph.getNodesByType('npc').map(n => n.id));
  const regions = new Set(graph.getNodesByType('region').map(n => n.id));
  const quests = graph.getNodesByType('quest');

  for (const q of quests) {
    const attrs = q.attrs as QuestAttrs;
    if (!npcs.has(attrs.giverNpcId)) {
      conflicts.push({
        agentId: 'quest',
        type: 'missing_ref',
        description: `Quest '${attrs.title}' has non-existent giver NPC '${attrs.giverNpcId}'.`,
        retryCount: 0
      });
    }
    if (!regions.has(attrs.targetRegionId)) {
      conflicts.push({
        agentId: 'quest',
        type: 'invalid_region',
        description: `Quest '${attrs.title}' targets non-existent region '${attrs.targetRegionId}'.`,
        retryCount: 0
      });
    }
    const unlocksQuestId = (attrs as any).unlocksQuestId;
    if (unlocksQuestId && !graph.getNode(unlocksQuestId)) {
      conflicts.push({
        agentId: 'quest',
        type: 'missing_ref',
        description: `Quest '${attrs.title}' unlocks non-existent quest '${unlocksQuestId}'.`,
        retryCount: 0
      });
    }
  }
  return conflicts;
}

export function checkDialogue(graph: WorldGraph): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const npcs = graph.getNodesByType('npc');
  const npcIds = new Set(npcs.map(n => n.id));
  const dialogues = graph.getNodesByType('dialogue_tree');
  
  const questGivers = npcs.filter(n => (n.attrs as NPCAttrs).type === 'quest_giver').map(n => n.id);
  const npcsWithDialogue = new Set(dialogues.map(d => (d.attrs as DialogueTreeAttrs).npcId));

  for (const d of dialogues) {
    const attrs = d.attrs as DialogueTreeAttrs;
    if (!npcIds.has(attrs.npcId)) {
      conflicts.push({
        agentId: 'dialogue',
        type: 'missing_ref',
        description: `Dialogue tree references non-existent NPC '${attrs.npcId}'.`,
        retryCount: 0
      });
    }

    const checkLines = (lines: string[] | undefined) => {
      if (!lines) return;
      for (const line of lines) {
        if (line.length > 120) {
          conflicts.push({
            agentId: 'dialogue',
            type: 'dialogue_too_long',
            description: `Dialogue line exceeds 120 characters.`,
            retryCount: 0
          });
        }
      }
    };

    checkLines(attrs.greeting);
    checkLines(attrs.ambientLines);
    checkLines(attrs.completionLines);
  }

  for (const id of questGivers) {
    if (!npcsWithDialogue.has(id)) {
      conflicts.push({
        agentId: 'dialogue',
        type: 'missing_ref',
        description: `Quest giver NPC '${id}' has no dialogue tree.`,
        retryCount: 0
      });
    }
  }

  return conflicts;
}

export function runAllChecks(graph: WorldGraph, agentId: AgentId | 'review'): ConflictEntry[] {
  if (agentId === 'story') return [];
  if (agentId === 'character') return checkCharacters(graph);
  if (agentId === 'world') return checkWorld(graph);
  if (agentId === 'npc') return checkNpcs(graph);
  if (agentId === 'quest') return checkQuests(graph);
  if (agentId === 'dialogue') return checkDialogue(graph);
  if (agentId === 'parent' || agentId === 'review' as any) {
    return [
      ...checkCharacters(graph),
      ...checkWorld(graph),
      ...checkNpcs(graph),
      ...checkQuests(graph),
      ...checkDialogue(graph),
    ];
  }
  return [];
}
