import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGraphStore } from '../src/shared/storage/InMemoryAdapters';
import { WorldGraph } from '../src/main/memory/WorldGraph';
import {
  checkCharacters,
  checkWorld,
  checkNpcs,
  checkQuests,
  checkDialogue,
  runAllChecks,
} from '../src/main/agents/conflictChecks';
import { compileSceneGraph } from '../src/main/agents/compileSceneGraph';
import { SceneGraphSchema } from '../src/shared/schema/sceneGraph.schema';
import type {
  GraphNodeRecord,
  StoryAttrs,
  FactionAttrs,
  CharacterAttrs,
  RegionAttrs,
  NPCAttrs,
  LandmarkAttrs,
  QuestAttrs,
  DialogueTreeAttrs,
} from '../src/shared/graph/graphTypes';
import type { AgentId } from '../src/shared/agents/agentTypes';

describe('conflictChecks and compileSceneGraph', () => {
  let store: InMemoryGraphStore;
  let graph: WorldGraph;
  const SESSION_ID = 'test-session';

  function createNode(
    id: string,
    type: GraphNodeRecord['type'],
    attrs: unknown,
    coords: { x?: number; y?: number; z?: number } = {},
    createdBy: AgentId = 'story'
  ): GraphNodeRecord {
    return {
      id,
      type,
      attrs: attrs as GraphNodeRecord['attrs'],
      x: coords.x ?? 0,
      y: coords.y ?? 0,
      z: coords.z ?? 0,
      createdBy,
      version: 1,
      updatedAt: Date.now(),
    };
  }

  beforeEach(() => {
    store = new InMemoryGraphStore();
    graph = new WorldGraph(store);
    graph.reset(SESSION_ID);
  });

  describe('conflictChecks', () => {
    it('produces invalid_faction conflict when a character references a non-existent faction', async () => {
      const charAttrs: CharacterAttrs = {
        name: 'Vaelin',
        role: 'protagonist',
        factionId: 'faction_ghost', // Non-existent
        personality: 'Quiet killer',
        motivation: 'Protect the realm',
        physicalDescription: 'Dark cloaked warrior',
        arcSummary: 'Becomes a legend',
      };
      const charNode = createNode('char_vaelin', 'character', charAttrs, {}, 'character');
      await graph.upsertNode(charNode);

      const conflicts = checkCharacters(graph);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('invalid_faction');
      expect(conflicts[0].agentId).toBe('character');
      expect(conflicts[0].description).toContain("faction 'faction_ghost'");
    });

    it('produces invalid_faction conflict when an NPC references a non-existent faction', async () => {
      const regAttrs: RegionAttrs = {
        name: 'Ironwood',
        biome: 'pine',
        climate: 'Cold',
        dominantFactionId: '',
        description: 'Dense woods',
        elevationAmplitude: 5,
        compassCell: 'C',
        size: 'medium',
      };
      await graph.upsertNode(createNode('reg_1', 'region', regAttrs, {}, 'world'));

      const npcAttrs: NPCAttrs = {
        name: 'Boran',
        type: 'guard',
        regionId: 'reg_1',
        factionId: 'non_existent_faction',
        wanderRadius: 10,
        dialogueSeed: 'Halt!',
        behaviorFlags: {},
      };
      await graph.upsertNode(createNode('npc_boran', 'npc', npcAttrs, {}, 'npc'));

      const conflicts = checkNpcs(graph);
      const factionConflicts = conflicts.filter((c) => c.type === 'invalid_faction');
      expect(factionConflicts).toHaveLength(1);
      expect(factionConflicts[0].description).toContain('non_existent_faction');
    });

    it('produces invalid_faction conflict when a region is dominated by a non-existent faction', async () => {
      const regAttrs: RegionAttrs = {
        name: 'Shadow Realm',
        biome: 'ruins',
        climate: 'Frigid',
        dominantFactionId: 'faction_void', // Non-existent
        description: 'A desolate wasteland',
        elevationAmplitude: 10,
        compassCell: 'N',
        size: 'large',
      };
      await graph.upsertNode(createNode('reg_shadow', 'region', regAttrs, {}, 'world'));

      const conflicts = checkWorld(graph);
      const factionConflict = conflicts.find((c) => c.type === 'invalid_faction');
      expect(factionConflict).toBeDefined();
      expect(factionConflict?.agentId).toBe('world');
      expect(factionConflict?.description).toContain('faction_void');
    });

    it('produces dialogue_too_long conflict when a dialogue line exceeds 120 characters', async () => {
      const npcAttrs: NPCAttrs = {
        name: 'Sage Teresa',
        type: 'quest_giver',
        regionId: 'reg_1',
        factionId: '',
        wanderRadius: 5,
        dialogueSeed: 'Greetings.',
        behaviorFlags: {},
      };
      await graph.upsertNode(createNode('npc_teresa', 'npc', npcAttrs, {}, 'npc'));

      const longLine = 'This is an excessively long dialogue line that easily exceeds the strict one hundred and twenty character limit enforced by the conflict checking taxonomy rule in Orbis.';
      expect(longLine.length).toBeGreaterThan(120);

      const dialogueAttrs: DialogueTreeAttrs = {
        npcId: 'npc_teresa',
        greeting: [longLine],
        ambientLines: ['Short line here.'],
        completionLines: [],
        questDialogue: {},
      };
      await graph.upsertNode(createNode('dt_teresa', 'dialogue_tree', dialogueAttrs, {}, 'dialogue'));

      const conflicts = checkDialogue(graph);
      const lengthConflicts = conflicts.filter((c) => c.type === 'dialogue_too_long');
      expect(lengthConflicts).toHaveLength(1);
      expect(lengthConflicts[0].agentId).toBe('dialogue');
      expect(lengthConflicts[0].description).toBe('Dialogue line exceeds 120 characters.');
    });

    it('does not produce dialogue_too_long when dialogue lines are within 120 characters', async () => {
      const npcAttrs: NPCAttrs = {
        name: 'Sage Teresa',
        type: 'quest_giver',
        regionId: 'reg_1',
        factionId: '',
        wanderRadius: 5,
        dialogueSeed: 'Greetings.',
        behaviorFlags: {},
      };
      await graph.upsertNode(createNode('npc_teresa', 'npc', npcAttrs, {}, 'npc'));

      const validLine = 'Welcome, brave wanderer. The ancient road ahead is perilous, but courage will guide your steps safely.';
      expect(validLine.length).toBeLessThanOrEqual(120);

      const dialogueAttrs: DialogueTreeAttrs = {
        npcId: 'npc_teresa',
        greeting: [validLine],
        ambientLines: ['Watch your back.'],
        completionLines: ['Well done.'],
        questDialogue: {},
      };
      await graph.upsertNode(createNode('dt_teresa', 'dialogue_tree', dialogueAttrs, {}, 'dialogue'));

      const conflicts = checkDialogue(graph);
      const lengthConflicts = conflicts.filter((c) => c.type === 'dialogue_too_long');
      expect(lengthConflicts).toHaveLength(0);
    });

    it('produces duplicate_name conflict when two NPCs have the same name', async () => {
      const regAttrs: RegionAttrs = {
        name: 'Capital',
        biome: 'pine',
        climate: 'Mild',
        dominantFactionId: '',
        description: 'Capital city',
        elevationAmplitude: 2,
        compassCell: 'C',
        size: 'small',
      };
      await graph.upsertNode(createNode('reg_cap', 'region', regAttrs, {}, 'world'));

      const npc1: NPCAttrs = {
        name: 'John the Blacksmith',
        type: 'vendor',
        regionId: 'reg_cap',
        factionId: '',
        wanderRadius: 5,
        dialogueSeed: 'Weapons forged here.',
        behaviorFlags: {},
      };
      const npc2: NPCAttrs = {
        name: 'John the Blacksmith',
        type: 'ambient',
        regionId: 'reg_cap',
        factionId: '',
        wanderRadius: 5,
        dialogueSeed: 'Nice day.',
        behaviorFlags: {},
      };

      await graph.upsertNode(createNode('npc_1', 'npc', npc1, {}, 'npc'));
      await graph.upsertNode(createNode('npc_2', 'npc', npc2, {}, 'npc'));

      const conflicts = checkNpcs(graph);
      const dupes = conflicts.filter((c) => c.type === 'duplicate_name');
      expect(dupes).toHaveLength(1);
      expect(dupes[0].agentId).toBe('npc');
      expect(dupes[0].description).toContain('John the Blacksmith');
    });

    it('produces duplicate_name conflict when two characters have the same name', async () => {
      const factionAttrs: FactionAttrs = { name: 'Alliance', ideology: 'Unity' };
      await graph.upsertNode(createNode('fac_1', 'faction', factionAttrs, {}, 'story'));

      const char1: CharacterAttrs = {
        name: 'Aria',
        role: 'protagonist',
        factionId: 'fac_1',
        personality: 'Bold',
        motivation: 'Honor',
        physicalDescription: 'Tall',
        arcSummary: 'Growth',
      };
      const char2: CharacterAttrs = {
        name: 'Aria',
        role: 'supporting',
        factionId: 'fac_1',
        personality: 'Quiet',
        motivation: 'Survival',
        physicalDescription: 'Short',
        arcSummary: 'Loyalty',
      };

      await graph.upsertNode(createNode('char_1', 'character', char1, {}, 'character'));
      await graph.upsertNode(createNode('char_2', 'character', char2, {}, 'character'));

      const conflicts = checkCharacters(graph);
      const dupes = conflicts.filter((c) => c.type === 'duplicate_name');
      expect(dupes).toHaveLength(1);
      expect(dupes[0].agentId).toBe('character');
    });

    it('produces missing_ref and invalid_region conflicts for quest and landmark mismatches', async () => {
      const lmAttrs: LandmarkAttrs = {
        name: 'Monolith',
        regionId: 'reg_ghost',
        significance: 'Mysterious pillar',
      };
      await graph.upsertNode(createNode('lm_1', 'landmark', lmAttrs, {}, 'world'));

      const worldConflicts = checkWorld(graph);
      expect(worldConflicts.some((c) => c.type === 'invalid_region')).toBe(true);

      const questAttrs: QuestAttrs = {
        title: 'Ghost Hunt',
        giverNpcId: 'npc_ghost',
        objectiveType: 'explore',
        targetRegionId: 'reg_ghost',
        reward: 'Gold',
        branchConditions: [],
      };
      await graph.upsertNode(createNode('quest_1', 'quest', questAttrs, {}, 'quest'));

      const questConflicts = checkQuests(graph);
      expect(questConflicts.some((c) => c.type === 'missing_ref')).toBe(true);
      expect(questConflicts.some((c) => c.type === 'invalid_region')).toBe(true);
    });

    it('runAllChecks returns empty for story agent and aggregates for parent agent', async () => {
      expect(runAllChecks(graph, 'story')).toEqual([]);

      const charAttrs: CharacterAttrs = {
        name: 'Lone Wolf',
        role: 'protagonist',
        factionId: 'unknown_fac',
        personality: '',
        motivation: '',
        physicalDescription: '',
        arcSummary: '',
      };
      await graph.upsertNode(createNode('char_lone', 'character', charAttrs, {}, 'character'));

      const characterConflicts = runAllChecks(graph, 'character');
      expect(characterConflicts).toHaveLength(1);

      const parentConflicts = runAllChecks(graph, 'parent');
      expect(parentConflicts.some((c) => c.type === 'invalid_faction')).toBe(true);

      const reviewConflicts = runAllChecks(graph, 'review');
      expect(reviewConflicts.some((c) => c.type === 'invalid_faction')).toBe(true);
    });
  });

  describe('compileSceneGraph', () => {
    it('compiles a populated WorldGraph into a schema-valid SceneGraph', async () => {
      // 1. Story Node
      const storyAttrs: StoryAttrs = {
        genre: 'Eldritch Fantasy',
        tone: 'dark and grim',
        themes: ['forbidden knowledge', 'madness'],
        history: 'A cursed province on the edge of the forgotten abyss.',
        centralConflict: 'The Scholars of Dawn investigate the creeping void.',
      };
      await graph.upsertNode(createNode('story_1', 'story', storyAttrs, {}, 'story'));

      // 2. Factions
      const factionDawn: FactionAttrs = {
        name: 'Scholars of Dawn',
        ideology: 'Seekers of forbidden light',
      };
      await graph.upsertNode(createNode('fac_dawn', 'faction', factionDawn, {}, 'story'));

      // 3. Regions (pine is large -> should dominate activeBiome)
      const regPines: RegionAttrs = {
        name: 'Mistwood Highlands',
        biome: 'pine',
        climate: 'Damp and chilly',
        dominantFactionId: 'fac_dawn',
        description: 'Enchanted pine forest shrouded in dense mist.',
        elevationAmplitude: 14,
        compassCell: 'N',
        size: 'large',
      };
      const regRuins: RegionAttrs = {
        name: 'Sunken Catacombs',
        biome: 'ruins',
        climate: 'Stagnant air',
        dominantFactionId: 'fac_dawn',
        description: 'Ancient sunken halls overgrown with moss.',
        elevationAmplitude: 6,
        compassCell: 'S',
        size: 'medium',
      };
      await graph.upsertNode(createNode('reg_pines', 'region', regPines, { x: 0, z: 0 }, 'world'));
      await graph.upsertNode(createNode('reg_ruins', 'region', regRuins, { x: 100, z: 100 }, 'world'));

      // 4. Characters
      const charEldrin: CharacterAttrs = {
        name: 'Archivist Eldrin',
        role: 'protagonist',
        factionId: 'fac_dawn',
        personality: 'Inquisitive and cautious',
        motivation: 'Decipher the celestial runes before midnight',
        physicalDescription: 'Elderly scholar in sapphire robes with a brass telescope',
        arcSummary: 'Uncovers the truth of the ancient realm',
      };
      await graph.upsertNode(createNode('char_eldrin', 'character', charEldrin, { x: 5, z: 5 }, 'character'));

      // 5. NPCs
      const npcVendor: NPCAttrs = {
        name: 'Kael the Fletcher',
        type: 'vendor',
        regionId: 'reg_pines',
        factionId: 'fac_dawn',
        wanderRadius: 10,
        dialogueSeed: 'Finest arrows in the province.',
        behaviorFlags: { merchant: true },
      };
      const npcQuestGiver: NPCAttrs = {
        name: 'Grand Inquisitor',
        type: 'quest_giver',
        regionId: 'reg_pines',
        factionId: 'fac_dawn',
        wanderRadius: 8,
        dialogueSeed: 'The darkness stirs.',
        behaviorFlags: { stationary: true },
      };
      await graph.upsertNode(createNode('npc_kael', 'npc', npcVendor, { x: 15, z: 20 }, 'npc'));
      await graph.upsertNode(createNode('npc_inquisitor', 'npc', npcQuestGiver, { x: 25, z: 30 }, 'npc'));

      // 6. Landmarks
      const lmShrine: LandmarkAttrs = {
        name: 'Obelisk of Solitude',
        regionId: 'reg_pines',
        significance: 'Focus for ancient ley energies',
      };
      await graph.upsertNode(createNode('lm_obelisk', 'landmark', lmShrine, { x: 40, z: 40 }, 'world'));

      // 7. Quests
      const questVoid: QuestAttrs = {
        title: 'Purge the Shadow Well',
        giverNpcId: 'npc_inquisitor',
        objectiveType: 'cleanse',
        targetRegionId: 'reg_ruins',
        reward: 'Sunstone Amulet',
        branchConditions: ['has_purified_well'],
      };
      await graph.upsertNode(createNode('quest_shadow', 'quest', questVoid, {}, 'quest'));

      // 8. Dialogue Tree for quest giver
      const dtInquisitor: DialogueTreeAttrs = {
        npcId: 'npc_inquisitor',
        greeting: ['Greetings, traveler. Dark omens gather.'],
        ambientLines: ['The stars are watching.'],
        completionLines: ['The balance is restored.'],
        questDialogue: { quest_shadow: ['Enter the catacombs and cleanse the well.'] },
      };
      await graph.upsertNode(createNode('dt_inquisitor', 'dialogue_tree', dtInquisitor, {}, 'dialogue'));

      // Compile graph
      const result = compileSceneGraph(graph, SESSION_ID);

      // Verify returned bundle structure
      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.activeBiome).toBe('pine');
      expect(result.regionElevations).toHaveLength(2);

      // Assert that output sceneGraph validates against SceneGraphSchema
      const validated = SceneGraphSchema.parse(result.sceneGraph);
      expect(validated).toBeDefined();

      // Check world metadata
      expect(validated.world.name).toBe('Eldritch Fantasy: Mistwood Highlands');
      expect(validated.world.biome).toBe('forest'); // 'pine' maps to 'forest' in BIOME_TO_SCHEMA
      expect(validated.world.timeOfDay).toBe('dusk'); // 'dark and grim' tone maps to 'dusk'
      expect(validated.world.scale).toBe('small'); // 2 regions -> 'small'

      // Check zones
      expect(validated.zones).toHaveLength(2);
      const pineZone = validated.zones.find((z) => z.id === 'reg_pines');
      expect(pineZone).toBeDefined();
      expect(pineZone?.bounds.radius).toBe(160); // 'large' size -> radius 160

      // Check characters and NPCs
      expect(validated.characters).toHaveLength(3); // 1 character + 2 NPCs
      const inquisitorChar = validated.characters.find((c) => c.id === 'npc_inquisitor');
      expect(inquisitorChar).toBeDefined();
      expect(inquisitorChar?.dialogueSeed).toBe('Greetings, traveler. Dark omens gather.');

      // Check objects (landmarks)
      expect(validated.objects).toHaveLength(1);
      expect(validated.objects[0].id).toBe('lm_obelisk');
      expect(validated.objects[0].type).toBe('landmark');

      // Check events (quest proximity and complete events)
      expect(validated.events).toHaveLength(2);
      const startEvent = validated.events.find((e) => e.id === 'quest_shadow_start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.type).toBe('proximity');
      expect(startEvent?.target).toBe('npc_inquisitor');

      // Check atmosphere and skybox
      expect(validated.skybox.type).toBe('gradient');
      expect(validated.skybox.topColor).toBe('#0a1a0a'); // Pine top color
      expect(validated.atmosphere.fogDensity).toBe(0.012); // Pine fog density
    });

    it('handles minimal graph fallback gracefully and passes SceneGraphSchema validation', async () => {
      // Graph with no nodes at all
      const result = compileSceneGraph(graph, 'empty-session');

      expect(result.sessionId).toBe('empty-session');
      expect(result.activeBiome).toBe('pine'); // default fallback

      const validated = SceneGraphSchema.parse(result.sceneGraph);
      expect(validated).toBeDefined();
      expect(validated.world.name).toBe('Fantasy: Unknown');
      expect(validated.world.timeOfDay).toBe('afternoon');
      expect(validated.world.weather).toBe('clear');
      expect(validated.zones).toEqual([]);
      expect(validated.characters).toEqual([]);
      expect(validated.objects).toEqual([]);
    });

    it('derives weather and time of day from tone correctly', async () => {
      const storyAttrs: StoryAttrs = {
        genre: 'Sci-Fi',
        tone: 'bright and stormy apocalypse',
        themes: [],
        history: 'A hopeful world battling storms.',
        centralConflict: 'Survive the Tempest',
      };
      const regAttrs: RegionAttrs = {
        name: 'Neo Apex',
        biome: 'cyber',
        climate: 'Electric rain',
        dominantFactionId: '',
        description: 'Neon metropolis',
        elevationAmplitude: 5,
        compassCell: 'C',
        size: 'small',
      };

      await graph.upsertNode(createNode('story_scifi', 'story', storyAttrs, {}, 'story'));
      await graph.upsertNode(createNode('reg_cyber', 'region', regAttrs, {}, 'world'));

      const result = compileSceneGraph(graph, 'session_tone_test');
      expect(result.sceneGraph.world.timeOfDay).toBe('morning'); // 'bright' tone -> 'morning'
      expect(result.sceneGraph.world.weather).toBe('storm'); // 'storm' tone -> 'storm'
      expect(result.activeBiome).toBe('cyber');
      expect(result.sceneGraph.world.biome).toBe('urban');

      expect(SceneGraphSchema.parse(result.sceneGraph)).toBeDefined();
    });
  });
});
