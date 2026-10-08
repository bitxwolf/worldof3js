import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGraphStore } from '../src/shared/storage/InMemoryAdapters';
import { WorldGraph } from '../src/main/memory/WorldGraph';
import type {
  GraphNodeRecord,
  GraphEdgeRecord,
  StoryAttrs,
  FactionAttrs,
  CharacterAttrs,
  RegionAttrs,
  NPCAttrs,
} from '../src/shared/graph/graphTypes';
import type { AgentId } from '../src/shared/agents/agentTypes';

describe('WorldGraph and InMemoryGraphStore', () => {
  let store: InMemoryGraphStore;
  let graph: WorldGraph;
  const SESSION_ID = 'session_test_world';

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

  function createEdge(
    id: string,
    source: string,
    target: string,
    type: GraphEdgeRecord['type'],
    createdBy: AgentId = 'parent',
    attrs?: Record<string, unknown>
  ): GraphEdgeRecord {
    return {
      id,
      source,
      target,
      type,
      attrs,
      createdBy,
    };
  }

  beforeEach(() => {
    store = new InMemoryGraphStore();
    graph = new WorldGraph(store);
    graph.reset(SESSION_ID);
  });

  describe('Node Upsertion', () => {
    it('upserts story, faction, character, region, and npc nodes', async () => {
      const storyAttrs: StoryAttrs = {
        genre: 'Dark Fantasy',
        tone: 'grim and foreboding',
        themes: ['corruption', 'survival'],
        history: 'An ancient kingdom fell into shadow.',
        centralConflict: 'The Crimson Order fights against the shadowy blight.',
      };
      const storyNode = createNode('story_1', 'story', storyAttrs, { x: 0, y: 0, z: 0 }, 'story');

      const factionAttrs: FactionAttrs = {
        name: 'Crimson Order',
        ideology: 'Zealous crusaders against decay',
        territory: 'Northern Valleys',
      };
      const factionNode = createNode('faction_crimson', 'faction', factionAttrs, { x: 10, y: 0, z: 20 }, 'story');

      const regionAttrs: RegionAttrs = {
        name: 'Whispering Pines',
        biome: 'pine',
        climate: 'Temperate mist',
        dominantFactionId: 'faction_crimson',
        description: 'Tall pine trees blanketed in silver fog.',
        elevationAmplitude: 8,
        compassCell: 'N',
        size: 'large',
      };
      const regionNode = createNode('reg_pines', 'region', regionAttrs, { x: 0, y: 0, z: 50 }, 'world');

      const charAttrs: CharacterAttrs = {
        name: 'Lord Ronald',
        role: 'protagonist',
        factionId: 'faction_crimson',
        personality: 'Stoic and resolute',
        motivation: 'Reclaim his ancestral fortress',
        physicalDescription: 'Tall knight clad in weathered silver plate',
        arcSummary: 'Overcomes his guilt to lead the order to victory',
      };
      const charNode = createNode('char_ronald', 'character', charAttrs, { x: 5, y: 1.7, z: 52 }, 'character');

      const npcAttrs: NPCAttrs = {
        name: 'Mira the Merchant',
        type: 'vendor',
        regionId: 'reg_pines',
        factionId: 'faction_crimson',
        wanderRadius: 15,
        dialogueSeed: 'Looking to trade?',
        behaviorFlags: { stationary: true, barters: true },
      };
      const npcNode = createNode('npc_mira', 'npc', npcAttrs, { x: 12, y: 1.7, z: 48 }, 'npc');

      await graph.upsertNode(storyNode);
      await graph.upsertNodes([factionNode, regionNode, charNode, npcNode]);

      expect(graph.nodeCount).toBe(5);

      const fetchedStory = graph.getNode('story_1');
      expect(fetchedStory).not.toBeNull();
      expect(fetchedStory?.type).toBe('story');
      expect((fetchedStory?.attrs as StoryAttrs).genre).toBe('Dark Fantasy');

      const fetchedFaction = graph.getNode('faction_crimson');
      expect(fetchedFaction).not.toBeNull();
      expect(fetchedFaction?.type).toBe('faction');
      expect((fetchedFaction?.attrs as FactionAttrs).name).toBe('Crimson Order');

      const fetchedRegion = graph.getNode('reg_pines');
      expect(fetchedRegion).not.toBeNull();
      expect(fetchedRegion?.type).toBe('region');
      expect(fetchedRegion?.z).toBe(50);

      const fetchedChar = graph.getNode('char_ronald');
      expect(fetchedChar).not.toBeNull();
      expect(fetchedChar?.type).toBe('character');
      expect((fetchedChar?.attrs as CharacterAttrs).factionId).toBe('faction_crimson');

      const fetchedNpc = graph.getNode('npc_mira');
      expect(fetchedNpc).not.toBeNull();
      expect(fetchedNpc?.type).toBe('npc');
      expect((fetchedNpc?.attrs as NPCAttrs).type).toBe('vendor');
    });

    it('retrieves nodes filtered by GraphNodeType', async () => {
      const npc1 = createNode('npc_1', 'npc', { name: 'Guard 1' } as any, { x: 0, z: 0 }, 'npc');
      const npc2 = createNode('npc_2', 'npc', { name: 'Guard 2' } as any, { x: 5, z: 5 }, 'npc');
      const region = createNode('reg_1', 'region', { name: 'Fortress' } as any, { x: 0, z: 0 }, 'world');

      await graph.upsertNodes([npc1, npc2, region]);

      const npcs = graph.getNodesByType('npc');
      expect(npcs).toHaveLength(2);
      expect(npcs.map((n) => n.id).sort()).toEqual(['npc_1', 'npc_2']);

      const regions = graph.getNodesByType('region');
      expect(regions).toHaveLength(1);
      expect(regions[0].id).toBe('reg_1');

      const factions = graph.getNodesByType('faction');
      expect(factions).toHaveLength(0);
    });

    it('updates an existing node on subsequent upsert without duplicating', async () => {
      const char = createNode('char_1', 'character', { name: 'Eldrin', role: 'protagonist' } as any, { x: 10, z: 10 }, 'character');
      await graph.upsertNode(char);
      expect(graph.nodeCount).toBe(1);

      const updatedChar = createNode(
        'char_1',
        'character',
        { name: 'Eldrin the Archmage', role: 'protagonist' } as any,
        { x: 25, z: 35 },
        'character'
      );
      await graph.upsertNode(updatedChar);

      expect(graph.nodeCount).toBe(1);
      const retrieved = graph.getNode('char_1');
      expect(retrieved?.x).toBe(25);
      expect(retrieved?.z).toBe(35);
      expect((retrieved?.attrs as any).name).toBe('Eldrin the Archmage');
    });
  });

  describe('Directed Edge Upsertion', () => {
    it('upserts directed edges MEMBER_OF, LOCATED_IN, and GIVES_QUEST', async () => {
      const factionNode = createNode('faction_order', 'faction', { name: 'The Order' } as any, {}, 'story');
      const charNode = createNode('char_galahad', 'character', { name: 'Galahad' } as any, {}, 'character');
      const regionNode = createNode('reg_valley', 'region', { name: 'Valley' } as any, {}, 'world');
      const npcNode = createNode('npc_questgiver', 'npc', { name: 'Old Man' } as any, {}, 'npc');
      const questNode = createNode('quest_relic', 'quest', { title: 'Find Relic' } as any, {}, 'quest');

      await graph.upsertNodes([factionNode, charNode, regionNode, npcNode, questNode]);

      const edgeMemberOf = createEdge('e_member_1', 'char_galahad', 'faction_order', 'MEMBER_OF', 'character');
      const edgeLocatedIn = createEdge('e_located_1', 'npc_questgiver', 'reg_valley', 'LOCATED_IN', 'npc');
      const edgeGivesQuest = createEdge('e_gives_1', 'npc_questgiver', 'quest_relic', 'GIVES_QUEST', 'quest');

      await graph.upsertEdges([edgeMemberOf, edgeLocatedIn, edgeGivesQuest]);

      expect(graph.edgeCount).toBe(3);

      const charEdges = graph.getEdges('char_galahad');
      expect(charEdges).toHaveLength(1);
      expect(charEdges[0].type).toBe('MEMBER_OF');
      expect(charEdges[0].target).toBe('faction_order');

      const npcAllEdges = graph.getEdges('npc_questgiver');
      expect(npcAllEdges).toHaveLength(2);

      const specificEdge = graph.getEdges('npc_questgiver', 'quest_relic');
      expect(specificEdge).toHaveLength(1);
      expect(specificEdge[0].type).toBe('GIVES_QUEST');

      const nonExistentEdge = graph.getEdges('char_galahad', 'reg_valley');
      expect(nonExistentEdge).toHaveLength(0);
    });
  });

  describe('Spatial Radius Queries', () => {
    it('returns nodes within the queried radius and excludes out-of-range nodes', async () => {
      // (0, 0) -> distance 0
      const centerNode = createNode('node_center', 'npc', { name: 'Center' } as any, { x: 0, z: 0 }, 'npc');
      // (3, 4) -> distance = sqrt(3^2 + 4^2) = 5
      const nearNode = createNode('node_near', 'npc', { name: 'Near' } as any, { x: 3, z: 4 }, 'npc');
      // (10, 0) -> distance = 10
      const midNode = createNode('node_mid', 'region', { name: 'Mid' } as any, { x: 10, z: 0 }, 'world');
      // (50, 50) -> distance = sqrt(5000) ~ 70.7
      const farNode = createNode('node_far', 'npc', { name: 'Far' } as any, { x: 50, z: 50 }, 'npc');

      await graph.upsertNodes([centerNode, nearNode, midNode, farNode]);

      // Radius 5: should include center (0) and near (5), excluding mid (10) and far (70.7)
      const queryAt5 = graph.queryRadius(0, 0, 5);
      expect(queryAt5).toHaveLength(2);
      const idsAt5 = queryAt5.map((n) => n.id).sort();
      expect(idsAt5).toEqual(['node_center', 'node_near']);

      // Radius 10: should include center (0), near (5), mid (10)
      const queryAt10 = graph.queryRadius(0, 0, 10);
      expect(queryAt10).toHaveLength(3);
      const idsAt10 = queryAt10.map((n) => n.id).sort();
      expect(idsAt10).toEqual(['node_center', 'node_mid', 'node_near']);

      // Radius 2: should only include center
      const queryAt2 = graph.queryRadius(0, 0, 2);
      expect(queryAt2).toHaveLength(1);
      expect(queryAt2[0].id).toBe('node_center');
    });

    it('filters spatial queries by GraphNodeType', async () => {
      const npcNear = createNode('npc_near', 'npc', { name: 'Guard' } as any, { x: 2, z: 2 }, 'npc');
      const regionNear = createNode('reg_near', 'region', { name: 'Plaza' } as any, { x: 3, z: 3 }, 'world');
      const landmarkNear = createNode('lm_near', 'landmark', { name: 'Fountain' } as any, { x: 1, z: 1 }, 'world');

      await graph.upsertNodes([npcNear, regionNear, landmarkNear]);

      // Query radius 10, filtering only 'npc'
      const onlyNpcs = graph.queryRadius(0, 0, 10, ['npc']);
      expect(onlyNpcs).toHaveLength(1);
      expect(onlyNpcs[0].id).toBe('npc_near');
      expect(onlyNpcs[0].type).toBe('npc');

      // Query radius 10, filtering 'region' and 'landmark'
      const places = graph.queryRadius(0, 0, 10, ['region', 'landmark']);
      expect(places).toHaveLength(2);
      const placeIds = places.map((p) => p.id).sort();
      expect(placeIds).toEqual(['lm_near', 'reg_near']);
    });
  });

  describe('Cascade Deletion', () => {
    it('deleting a node removes it and its incident edges in graph and store', async () => {
      const nodeA = createNode('node_a', 'character', { name: 'A' } as any, { x: 0, z: 0 }, 'character');
      const nodeB = createNode('node_b', 'region', { name: 'B' } as any, { x: 10, z: 10 }, 'world');
      const nodeC = createNode('node_c', 'npc', { name: 'C' } as any, { x: 20, z: 20 }, 'npc');

      await graph.upsertNodes([nodeA, nodeB, nodeC]);

      // A -> B, B -> A, B -> C
      const edgeAB = createEdge('e_ab', 'node_a', 'node_b', 'LOCATED_IN');
      const edgeBA = createEdge('e_ba', 'node_b', 'node_a', 'TARGETS');
      const edgeBC = createEdge('e_bc', 'node_b', 'node_c', 'MEMBER_OF');

      await graph.upsertEdges([edgeAB, edgeBA, edgeBC]);

      expect(graph.nodeCount).toBe(3);
      expect(graph.edgeCount).toBe(3);

      // Delete node A
      await graph.deleteNodes(['node_a']);

      // In-memory verification
      expect(graph.nodeCount).toBe(2);
      expect(graph.getNode('node_a')).toBeNull();
      expect(graph.getNode('node_b')).not.toBeNull();
      expect(graph.getNode('node_c')).not.toBeNull();

      // Both e_ab and e_ba should be dropped; only e_bc remains
      expect(graph.edgeCount).toBe(1);
      expect(graph.getEdges('node_a')).toEqual([]);
      expect(graph.getEdges('node_b')).toHaveLength(1);
      expect(graph.getEdges('node_b')[0].id).toBe('e_bc');

      // Backing store verification
      const stored = await store.loadSession(SESSION_ID);
      expect(stored.nodes.map((n) => n.id).sort()).toEqual(['node_b', 'node_c']);
      expect(stored.edges.map((e) => e.id)).toEqual(['e_bc']);
    });

    it('supports deleting multiple nodes simultaneously', async () => {
      const n1 = createNode('n1', 'npc', { name: '1' } as any);
      const n2 = createNode('n2', 'npc', { name: '2' } as any);
      const n3 = createNode('n3', 'npc', { name: '3' } as any);

      await graph.upsertNodes([n1, n2, n3]);
      const e12 = createEdge('e12', 'n1', 'n2', 'SPEAKS');
      const e23 = createEdge('e23', 'n2', 'n3', 'SPEAKS');
      await graph.upsertEdges([e12, e23]);

      await graph.deleteNodes(['n1', 'n2']);

      expect(graph.nodeCount).toBe(1);
      expect(graph.edgeCount).toBe(0);
      expect(graph.getNode('n3')).not.toBeNull();

      const stored = await store.loadSession(SESSION_ID);
      expect(stored.nodes).toHaveLength(1);
      expect(stored.edges).toHaveLength(0);
    });
  });

  describe('Session Hydration & Persistence Round-Trip', () => {
    it('persists graph updates and hydrates cleanly into a fresh WorldGraph instance', async () => {
      const storyNode = createNode('story_main', 'story', { genre: 'Cyberpunk' } as any, { x: 0, z: 0 }, 'story');
      const factionNode = createNode('faction_corp', 'faction', { name: 'Megacorp' } as any, { x: 10, z: 10 }, 'story');
      const charNode = createNode('char_hacker', 'character', { name: 'Zero' } as any, { x: 20, z: 20 }, 'character');

      await graph.upsertNodes([storyNode, factionNode, charNode]);

      const edge = createEdge('edge_membership', 'char_hacker', 'faction_corp', 'HOSTILE_TO', 'character');
      await graph.upsertEdges([edge]);

      // Hydrate into an entirely new WorldGraph instance
      const freshGraph = new WorldGraph(store);
      await freshGraph.hydrate(SESSION_ID);

      expect(freshGraph.currentSessionId).toBe(SESSION_ID);
      expect(freshGraph.nodeCount).toBe(3);
      expect(freshGraph.edgeCount).toBe(1);

      const loadedStory = freshGraph.getNode('story_main');
      expect(loadedStory).not.toBeNull();
      expect((loadedStory?.attrs as any).genre).toBe('Cyberpunk');

      const loadedEdges = freshGraph.getEdges('char_hacker', 'faction_corp');
      expect(loadedEdges).toHaveLength(1);
      expect(loadedEdges[0].type).toBe('HOSTILE_TO');
    });

    it('isolates data between distinct session IDs', async () => {
      const nodeAlpha = createNode('node_alpha', 'region', { name: 'Alpha City' } as any);
      await graph.upsertNode(nodeAlpha);

      // Secondary session
      const graphBeta = new WorldGraph(store);
      graphBeta.reset('session_beta');
      const nodeBeta = createNode('node_beta', 'region', { name: 'Beta Ruins' } as any);
      await graphBeta.upsertNode(nodeBeta);

      // Hydrate alpha into a clean graph
      const loadedAlpha = new WorldGraph(store);
      await loadedAlpha.hydrate(SESSION_ID);

      expect(loadedAlpha.nodeCount).toBe(1);
      expect(loadedAlpha.getNode('node_alpha')).not.toBeNull();
      expect(loadedAlpha.getNode('node_beta')).toBeNull();

      // Hydrate beta into a clean graph
      const loadedBeta = new WorldGraph(store);
      await loadedBeta.hydrate('session_beta');

      expect(loadedBeta.nodeCount).toBe(1);
      expect(loadedBeta.getNode('node_beta')).not.toBeNull();
      expect(loadedBeta.getNode('node_alpha')).toBeNull();
    });
  });
});
