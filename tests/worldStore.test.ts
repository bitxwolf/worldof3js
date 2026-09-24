import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { useUIStore } from '../src/renderer/store/uiStore';
import type { SceneGraph } from '../src/shared/schema/sceneGraph.schema';
import type { NPCReplyPayload } from '../src/shared/ipc.types';

describe('worldStore patchSceneGraph ID reconciliation', () => {
  const initialSceneGraph: SceneGraph = {
    version: '1.0',
    world: {
      name: 'Initial World',
      description: 'A test world',
      biome: 'forest',
      timeOfDay: 'morning',
      weather: 'clear',
      scale: 'medium',
    },
    player: {
      spawn: [0, 1.7, 0],
      startPosition: [0, 1.7, 0],
      movementSpeed: 4.0,
      jumpHeight: 1.5,
    },
    zones: [
      { id: 'zone_1', name: 'Start Zone', bounds: { center: [0, 0, 0], radius: 10 } },
      { id: 'zone_2', name: 'Old Forest', bounds: { center: [10, 0, 10], radius: 5 } },
    ],
    characters: [
      {
        id: 'char_1',
        name: 'Old Bob',
        description: 'A villager',
        personality: 'Friendly',
        secrets: [],
        knowledge: [],
        position: [1, 0, 1],
        behavior: 'idle',
      },
    ],
    objects: [
      {
        id: 'obj_1',
        name: 'Rock',
        type: 'prop',
        position: [2, 0, 2],
        collidable: true,
        interactable: false,
        pickable: false,
        locked: false,
      },
    ],
    lights: [
      { id: 'light_1', type: 'ambient', color: '#ffffff', intensity: 0.5, castShadow: false },
      { id: 'light_2', type: 'point', color: '#ff0000', intensity: 1.0, castShadow: false },
    ],
    events: [
      {
        id: 'event_1',
        type: 'proximity',
        target: 'obj_1',
        action: { type: 'show_text', payload: { text: 'Hello' } },
      },
    ],
    skybox: { type: 'gradient', topColor: '#000', bottomColor: '#111' },
    atmosphere: {
      fogDensity: 0.015,
      fogColor: '#1a1a2e',
      ambientIntensity: 0.5,
      sunColor: '#fff4e0',
    },
    flags: {},
  };

  beforeEach(() => {
    useWorldStore.getState().resetWorld();
    useWorldStore.getState().setSceneGraph(structuredClone(initialSceneGraph));
  });

  it('reconciles zones by ID (updates existing, adds new, keeps untouched)', () => {
    useWorldStore.getState().patchSceneGraph({
      zones: [
        { id: 'zone_1', name: 'Updated Start Zone', bounds: { center: [0, 0, 0], radius: 15 } },
        { id: 'zone_3', name: 'New Mountain', bounds: { center: [30, 0, 30], radius: 20 } },
      ],
    });

    const zones = useWorldStore.getState().sceneGraph?.zones;
    expect(zones).toBeDefined();
    expect(zones?.length).toBe(3);

    // Kept zone_2
    const zone2 = zones?.find((z) => z.id === 'zone_2');
    expect(zone2).toBeDefined();
    expect(zone2?.name).toBe('Old Forest');

    // Updated zone_1
    const zone1 = zones?.find((z) => z.id === 'zone_1');
    expect(zone1).toBeDefined();
    expect(zone1?.name).toBe('Updated Start Zone');
    expect(zone1?.bounds.radius).toBe(15);

    // Added zone_3
    const zone3 = zones?.find((z) => z.id === 'zone_3');
    expect(zone3).toBeDefined();
    expect(zone3?.name).toBe('New Mountain');
  });

  it('reconciles lights by ID (updates existing, adds new, keeps untouched)', () => {
    useWorldStore.getState().patchSceneGraph({
      lights: [
        { id: 'light_1', type: 'ambient', color: '#fffaaa', intensity: 0.8, castShadow: false },
        { id: 'light_3', type: 'spot', color: '#00ff00', intensity: 2.0, castShadow: true },
      ],
    });

    const lights = useWorldStore.getState().sceneGraph?.lights;
    expect(lights).toBeDefined();
    expect(lights?.length).toBe(3);

    // Kept light_2
    const light2 = lights?.find((l) => l.id === 'light_2');
    expect(light2).toBeDefined();
    expect(light2?.color).toBe('#ff0000');

    // Updated light_1
    const light1 = lights?.find((l) => l.id === 'light_1');
    expect(light1?.intensity).toBe(0.8);
    expect(light1?.color).toBe('#fffaaa');

    // Added light_3
    const light3 = lights?.find((l) => l.id === 'light_3');
    expect(light3?.type).toBe('spot');
  });

  it('reconciles events by ID (updates existing, adds new, keeps untouched)', () => {
    useWorldStore.getState().patchSceneGraph({
      events: [
        {
          id: 'event_1',
          type: 'proximity',
          target: 'obj_1',
          action: { type: 'show_text', payload: { text: 'Updated Text' } },
        },
        {
          id: 'event_2',
          type: 'interaction',
          target: 'chest',
          action: { type: 'unlock', payload: { targetId: 'chest' } },
        },
      ],
    });

    const events = useWorldStore.getState().sceneGraph?.events;
    expect(events?.length).toBe(2);

    const event1 = events?.find((e) => e.id === 'event_1');
    expect(event1?.action.payload).toEqual({ text: 'Updated Text' });

    const event2 = events?.find((e) => e.id === 'event_2');
    expect(event2?.target).toBe('chest');
  });

  it('reconciles objects and characters by ID', () => {
    useWorldStore.getState().patchSceneGraph({
      objects: [
        {
          id: 'obj_1',
          name: 'Glowing Rock',
          type: 'prop',
          position: [2, 1, 2],
          collidable: true,
          interactable: true,
          pickable: false,
          locked: false,
        },
        {
          id: 'obj_2',
          name: 'Tree',
          type: 'foliage',
          position: [5, 0, 5],
          collidable: true,
          interactable: false,
          pickable: false,
          locked: false,
        },
      ],
      characters: [
        {
          id: 'char_2',
          name: 'Alice',
          description: 'A knight',
          personality: 'Brave',
          secrets: ['traitor'],
          knowledge: ['castle_map'],
          position: [3, 0, 3],
          behavior: 'patrol',
        },
      ],
    });

    const sg = useWorldStore.getState().sceneGraph;
    expect(sg?.objects.length).toBe(2);
    expect(sg?.objects.find((o) => o.id === 'obj_1')?.name).toBe('Glowing Rock');
    expect(sg?.objects.find((o) => o.id === 'obj_2')?.name).toBe('Tree');

    expect(sg?.characters.length).toBe(2);
    expect(sg?.characters.find((c) => c.id === 'char_1')?.name).toBe('Old Bob');
    expect(sg?.characters.find((c) => c.id === 'char_2')?.name).toBe('Alice');
  });

  it('preserves existing zones, lights, and events when partial does not specify them', () => {
    useWorldStore.getState().patchSceneGraph({
      world: {
        ...initialSceneGraph.world,
        name: 'Renamed World',
      },
    });

    const sg = useWorldStore.getState().sceneGraph;
    expect(sg?.world.name).toBe('Renamed World');
    expect(sg?.zones.length).toBe(2);
    expect(sg?.lights.length).toBe(2);
    expect(sg?.events.length).toBe(1);
    expect(sg?.characters.length).toBe(1);
    expect(sg?.objects.length).toBe(1);
  });
});

describe('uiStore generationError typing and reset', () => {
  it('resets generationError to null when setGenerating is called', () => {
    const store = useUIStore.getState();
    store.setGenerationError('Failed to generate world');
    expect(useUIStore.getState().generationError).toBe('Failed to generate world');
    expect(useUIStore.getState().isGenerating).toBe(false);

    useUIStore.getState().setGenerating(true, 'Synthesizing scene...');
    expect(useUIStore.getState().generationError).toBeNull();
    expect(useUIStore.getState().isGenerating).toBe(true);
    expect(useUIStore.getState().generationStep).toBe('Synthesizing scene...');
  });
});

describe('NPCReplyPayload types', () => {
  it('allows payload with character metadata and dialogue history', () => {
    const payload: NPCReplyPayload = {
      npcId: 'npc_merchant',
      playerMessage: 'What are you selling?',
      character: {
        name: 'Merchant Joe',
        personality: 'Greedy and cunning',
        backstory: 'Exiled from the capital',
        secrets: ['Stole the goods'],
        dialogueStyle: 'Speaks in whispers',
      },
      worldContext: 'A dark medieval fantasy dungeon',
      history: [
        { sender: 'player', text: 'Hello' },
        { sender: 'npc', text: 'Greetings traveler' },
      ],
    };

    expect(payload.character?.name).toBe('Merchant Joe');
    expect(payload.history?.length).toBe(2);
    expect(payload.worldContext).toBe('A dark medieval fantasy dungeon');
  });
});

describe('worldStore setGeneratedCode', () => {
  it('allows setting generatedCode to string and clearing it with null', () => {
    useWorldStore.getState().setGeneratedCode('const scene = new THREE.Scene();');
    expect(useWorldStore.getState().generatedCode).toBe('const scene = new THREE.Scene();');

    useWorldStore.getState().setGeneratedCode(null);
    expect(useWorldStore.getState().generatedCode).toBeNull();
  });
});
