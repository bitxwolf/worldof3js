import { describe, it, expect } from 'vitest';
import { SceneGraphSchema, type SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('SceneGraphSchema Validation', () => {
  // ── 10 VALID CASES ──────────────────────────────────────────────────────────

  it('1. should validate a minimal valid scene graph', () => {
    const minimal: SceneGraph = {
      version: '1.0',
      world: {
        name: 'Minimal Plain',
        description: 'A flat expanse with nothing on it.',
        biome: 'forest',
        timeOfDay: 'morning',
        weather: 'clear',
        scale: 'small',
      },
      player: {
        spawn: [0, 1.7, 0],
        startPosition: [0, 1.7, 0],
        movementSpeed: 4.0,
        jumpHeight: 1.5,
      },
      zones: [],
      characters: [],
      objects: [],
      lights: [],
      events: [],
      skybox: { type: 'color' },
      atmosphere: {
        fogDensity: 0.01,
        fogColor: '#ffffff',
        ambientIntensity: 0.5,
        sunColor: '#fff4e0',
      },
      flags: {},
    };

    const result = SceneGraphSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('2. should validate a forest biome with a witch and hut', () => {
    const data = {
      world: {
        name: 'Blackwood Forest',
        description: 'Dense canopy and creeping mist.',
        biome: 'forest',
        timeOfDay: 'dusk',
        weather: 'fog',
        scale: 'medium',
      },
      characters: [
        {
          id: 'old_witch',
          name: 'Mira the Blind',
          description: 'A hunched elder wrapped in wool.',
          personality: 'Cryptic and cautious.',
          secrets: ['The well drinks memories'],
          knowledge: ['Herbs', 'Curses'],
          position: [5, 0, -10],
          behavior: 'idle',
        },
      ],
      objects: [
        {
          id: 'witch_cabin',
          name: 'Crooked Cabin',
          type: 'building',
          position: [5, 0, -12],
          collidable: true,
        },
      ],
      lights: [
        {
          id: 'moon',
          type: 'directional',
          color: '#8ab4f8',
          intensity: 0.8,
          position: [10, 30, 10],
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('3. should validate a desert canyon world', () => {
    const data = {
      world: {
        name: 'Searing Canyons',
        description: 'Red sandstone gorges under blinding heat.',
        biome: 'desert',
        timeOfDay: 'afternoon',
        weather: 'clear',
        scale: 'large',
      },
      objects: [
        {
          id: 'ancient_pillar',
          name: 'Sun Pillar',
          type: 'structure',
          position: [0, 0, 0],
          scale: [2, 10, 2],
        },
      ],
      lights: [
        {
          id: 'harsh_sun',
          type: 'directional',
          color: '#fff3cc',
          intensity: 2.0,
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('4. should validate an urban cyberpunk alley with interaction events', () => {
    const data = {
      world: {
        name: 'Neon Backstreet',
        description: 'Steam vents and flickering holograms.',
        biome: 'urban',
        timeOfDay: 'night',
        weather: 'rain',
        scale: 'small',
      },
      objects: [
        {
          id: 'security_terminal',
          name: 'Keypad Console',
          type: 'prop',
          position: [2, 1, -4],
          interactable: true,
          interactId: 'hack_door',
        },
      ],
      events: [
        {
          id: 'hack_door',
          type: 'interaction',
          target: 'security_terminal',
          action: {
            type: 'set_flag',
            payload: { door_unlocked: true },
          },
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('5. should validate a dungeon with torches and proximity trigger', () => {
    const data = {
      world: {
        name: 'Catacombs of Ash',
        description: 'Underground crypts filled with bone dust.',
        biome: 'dungeon',
        timeOfDay: 'night',
        weather: 'clear',
        scale: 'small',
      },
      lights: [
        {
          id: 'wall_torch',
          type: 'point',
          color: '#ff8822',
          intensity: 1.5,
          position: [0, 2, -3],
        },
      ],
      events: [
        {
          id: 'crypt_creak',
          type: 'proximity',
          target: 'sarcophagus_01',
          range: 3.5,
          action: {
            type: 'show_text',
            payload: { text: 'You hear stones grinding together ahead.' },
          },
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('6. should validate an ocean island with boat prop', () => {
    const data = {
      world: {
        name: 'Coral Atoll',
        description: 'Turquoise water surrounding a white sandbar.',
        biome: 'ocean',
        timeOfDay: 'morning',
        weather: 'clear',
        scale: 'medium',
      },
      objects: [
        {
          id: 'skiff_01',
          name: 'Rowing Boat',
          type: 'item',
          position: [0, 0, 10],
          pickable: false,
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('7. should validate a tundra snowy outpost', () => {
    const data = {
      world: {
        name: 'Frostbite Ridge',
        description: 'Sub-zero blizzards howling over pine trees.',
        biome: 'tundra',
        timeOfDay: 'dawn',
        weather: 'snow',
        scale: 'large',
      },
      atmosphere: {
        fogDensity: 0.04,
        fogColor: '#d6e4f0',
        ambientIntensity: 0.3,
        sunColor: '#e0eaff',
      },
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('8. should validate a custom biome with named zones', () => {
    const data = {
      world: {
        name: 'Floating Shards',
        description: 'Gravity-defying crystal islands.',
        biome: 'custom',
        timeOfDay: 'dusk',
        weather: 'clear',
        scale: 'medium',
      },
      zones: [
        {
          id: 'crystal_spire_zone',
          name: 'The Spire Platform',
          bounds: { center: [0, 10, 0], radius: 25 },
          description: 'A platform surrounded by humming geodes.',
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('9. should validate character patrol paths and multiple dialogue seeds', () => {
    const data = {
      world: {
        name: 'Village Square',
        description: 'Bustling cobblestone plaza.',
        biome: 'urban',
        timeOfDay: 'afternoon',
        weather: 'clear',
        scale: 'small',
      },
      characters: [
        {
          id: 'guard_patrol',
          name: 'Town Watchman',
          description: 'Heavily armored guard.',
          personality: 'Suspicious and dutiful.',
          position: [0, 0, 0],
          behavior: 'patrol',
          patrolPath: [
            [0, 0, 0],
            [10, 0, 0],
            [10, 0, 10],
            [0, 0, 10],
          ],
          dialogueSeed: 'Halt, citizen. State your business in the square.',
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('10. should validate complex flags, items, and unlock events', () => {
    const data = {
      world: {
        name: 'Ruined Vault',
        description: 'An ancient iron vault sunken into the earth.',
        biome: 'dungeon',
        timeOfDay: 'night',
        weather: 'clear',
        scale: 'small',
      },
      objects: [
        {
          id: 'rusty_key',
          name: 'Iron Key',
          type: 'item',
          position: [1, 0, 2],
          pickable: true,
        },
        {
          id: 'iron_door',
          name: 'Vault Gate',
          type: 'structure',
          position: [0, 0, 15],
          collidable: true,
          interactable: true,
          interactId: 'door_unlock_event',
        },
      ],
      events: [
        {
          id: 'door_unlock_event',
          type: 'item_use',
          target: 'iron_door',
          requiredItem: 'rusty_key',
          action: {
            type: 'unlock',
            payload: { doorId: 'iron_door' },
          },
        },
      ],
      flags: {
        has_key: false,
        door_open: false,
      },
    };

    const result = SceneGraphSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // ── 5 INVALID CASES ────────────────────────────────────────────────────────

  it('1. should reject when world metadata is completely missing', () => {
    const invalid = {
      version: '1.0',
      characters: [],
    };

    const result = SceneGraphSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('2. should reject an invalid biome value', () => {
    const invalid = {
      world: {
        name: 'Space Station',
        description: 'Orbiting Earth',
        biome: 'deep_space', // Invalid enum value
        timeOfDay: 'night',
        weather: 'clear',
        scale: 'medium',
      },
    };

    const result = SceneGraphSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('biome'))).toBe(true);
    }
  });

  it('3. should reject a character ID that is not snake_case', () => {
    const invalid = {
      world: {
        name: 'Town',
        description: 'Peaceful town',
        biome: 'forest',
        timeOfDay: 'morning',
        weather: 'clear',
        scale: 'small',
      },
      characters: [
        {
          id: 'Mira The Witch!', // Invalid: spaces, capitals, exclamation
          name: 'Mira',
          description: 'Elderly lady',
          personality: 'Wise',
          position: [0, 0, 0],
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('id'))).toBe(true);
    }
  });

  it('4. should reject a position vector with fewer than 3 coordinates', () => {
    const invalid = {
      world: {
        name: 'Town',
        description: 'Town',
        biome: 'forest',
        timeOfDay: 'morning',
        weather: 'clear',
        scale: 'small',
      },
      objects: [
        {
          id: 'broken_barrel',
          name: 'Barrel',
          type: 'prop',
          position: [10, 20], // Invalid: tuple requires 3 numbers
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('position'))).toBe(true);
    }
  });

  it('5. should reject an invalid event action type', () => {
    const invalid = {
      world: {
        name: 'Town',
        description: 'Town',
        biome: 'forest',
        timeOfDay: 'morning',
        weather: 'clear',
        scale: 'small',
      },
      events: [
        {
          id: 'bad_event',
          type: 'proximity',
          target: 'door',
          action: {
            type: 'explode_universe', // Invalid enum
            payload: {},
          },
        },
      ],
    };

    const result = SceneGraphSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('action'))).toBe(true);
    }
  });
});
