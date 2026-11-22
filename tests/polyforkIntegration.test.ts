import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SceneGraphSchema } from '../src/shared/schema/sceneGraph.schema';
import { ProceduralAssetLibrary } from '../src/renderer/engine/assets/ProceduralAssetLibrary';
import { WorldGraph } from '../src/main/memory/WorldGraph';
import { InMemoryGraphStore } from '../src/shared/storage/InMemoryAdapters';
import { compileSceneGraph } from '../src/main/agents/compileSceneGraph';
import { NPCSystem, setMockClips } from '../src/renderer/engine/NPCSystem';
import { ResourceRegistry } from '../src/renderer/engine/ResourceRegistry';
import { makeNode } from '../src/main/agents/worldAgent';

describe('Polyfork End-to-End Integration', () => {
  let scene: THREE.Scene;

  beforeEach(() => {
    scene = new THREE.Scene();
  });

  afterEach(() => {
    setMockClips(null);
  });

  it('validates scene graph with Polyfork assetId and modelId schema extensions', () => {
    const validGraph = {
      world: {
        name: 'Medieval Realm',
        description: 'A fantasy land of knights and castles.',
        biome: 'forest' as const,
        timeOfDay: 'dusk' as const,
        weather: 'clear' as const,
        scale: 'medium' as const,
      },
      player: {
        spawn: [0, 1.7, 0] as [number, number, number],
      },
      objects: [
        {
          id: 'obj_watchtower',
          name: 'Stone Watchtower',
          type: 'landmark',
          assetId: 'polyfork:medieval_watchtower',
          modelUrl: 'polyfork://medieval_watchtower.glb',
          position: [10, 0, 15] as [number, number, number],
          collidable: true,
          interactable: true,
        },
      ],
      characters: [
        {
          id: 'char_paladin',
          name: 'Sir Gareth',
          description: 'A valiant paladin.',
          personality: 'Righteous and brave.',
          position: [2, 1.7, 4] as [number, number, number],
          modelId: 'polyfork:knight_armored',
          rigged: true,
        },
      ],
    };

    const parsed = SceneGraphSchema.parse(validGraph);
    expect(parsed.objects[0].assetId).toBe('polyfork:medieval_watchtower');
    expect(parsed.objects[0].modelUrl).toBe('polyfork://medieval_watchtower.glb');
    expect(parsed.characters[0].modelId).toBe('polyfork:knight_armored');
    expect(parsed.characters[0].rigged).toBe(true);
  });

  it('ProceduralAssetLibrary.placeModel provides graceful procedural fallback when asset is not loaded', async () => {
    const helpers = new ProceduralAssetLibrary(scene, 123);

    // Place tree model -> should gracefully create procedural tree fallback
    const treeObj = await helpers.placeModel('polyfork:pine_tree_tall', 10, -5, { scale: 1.2 });
    expect(treeObj).toBeDefined();
    expect(scene.children).toContain(treeObj);
    expect(treeObj.position.x).toBe(10);
    expect(treeObj.position.z).toBe(-5);

    // Place rock model -> should gracefully create procedural rock fallback
    const rockObj = await helpers.placeModel('polyfork:boulder_cluster', -15, 20);
    expect(rockObj).toBeDefined();
    expect(scene.children).toContain(rockObj);

    // Place generic prop -> should create fallback prop without throwing
    const propObj = await helpers.placeModel('polyfork:mystery_relic', 0, 0);
    expect(propObj).toBeDefined();
    expect(scene.children).toContain(propObj);
  });

  it('compileSceneGraph resolves landmarks to objects with assetIds and NPCs with modelIds', async () => {
    const store = new InMemoryGraphStore();
    const graph = new WorldGraph(store);
    graph.reset('session-test-polyfork');

    // Add region
    await graph.upsertNode(
      makeNode(
        'region_medieval',
        'region',
        {
          name: 'Crown Highlands',
          biome: 'pine',
          climate: 'Temperate',
          dominantFactionId: 'faction_knights',
          description: 'Lush alpine valleys.',
          elevationAmplitude: 5,
          compassCell: 'center',
          size: 'medium',
        },
        'world'
      )
    );

    // Add landmark with assetId
    await graph.upsertNode(
      makeNode(
        'landmark_keep',
        'landmark',
        {
          name: 'Royal Keep',
          regionId: 'region_medieval',
          significance: 'Center of royal power',
          assetId: 'polyfork:medieval_castle_keep',
        },
        'world'
      )
    );

    // Add guard NPC
    await graph.upsertNode(
      makeNode(
        'npc_guard_1',
        'npc',
        {
          name: 'Gate Sentry',
          type: 'guard',
          regionId: 'region_medieval',
          factionId: 'faction_knights',
          wanderRadius: 15,
          dialogueSeed: 'Halt! Who goes there?',
          behaviorFlags: {},
          modelId: 'polyfork:knight_guard',
        },
        'npc'
      )
    );

    const compiled = compileSceneGraph(graph, 'session-test-polyfork');
    expect(compiled.sceneGraph).toBeDefined();

    // Landmark object resolved with assetId
    const keepObj = compiled.sceneGraph.objects.find((o) => o.id === 'landmark_keep');
    expect(keepObj).toBeDefined();
    expect(keepObj?.assetId).toBe('polyfork:medieval_castle_keep');

    // Guard NPC resolved with modelId
    const guardChar = compiled.sceneGraph.characters.find((c) => c.id === 'npc_guard_1');
    expect(guardChar).toBeDefined();
    expect(guardChar?.modelId).toBe('polyfork:knight_guard');
    expect(guardChar?.rigged).toBe(true);
  });

  it('NPCSystem initializes humanoid and updates without errors', async () => {
    const registry = new ResourceRegistry();
    const npcSystem = new NPCSystem(scene, registry);

    const char = {
      id: 'guard_alec',
      name: 'Alec the Watcher',
      description: 'A sentry',
      personality: 'Alert',
      secrets: [],
      knowledge: [],
      position: [2, 0, 3] as [number, number, number],
      behavior: 'idle' as const,
      modelId: 'polyfork:guard',
      rigged: true,
    };

    const group = await npcSystem.spawnNPC(char);
    expect(group).toBeDefined();
    expect(scene.children).toContain(group);

    // Ticking with player position should update look-at and animation mixer without throwing
    const playerPos = new THREE.Vector3(2, 1.7, 5);
    expect(() => npcSystem.tick(0.016, playerPos)).not.toThrow();

    // Trigger dialogue gesture
    expect(() => npcSystem.playGesture(char.id, 'Agree')).not.toThrow();

    npcSystem.dispose();
    registry.disposeAll();
  });

  it('AssetRegistry.loadModel rejects private/loopback IP SSRF attacks on external model URLs', async () => {
    const { AssetRegistry } = await import('../src/renderer/engine/AssetRegistry');
    const assetRegistry = new AssetRegistry();

    // SSRF attempt to fetch from local loopback
    await expect(assetRegistry.loadModel('http://127.0.0.1:8080/secret_model.glb')).rejects.toThrow(
      'disallowed private/internal network target'
    );

    // SSRF attempt to cloud metadata
    await expect(assetRegistry.loadModel('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      'disallowed private/internal network target'
    );
  });
});
