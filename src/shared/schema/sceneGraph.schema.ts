import { z } from 'zod';

const Vector3Tuple = z.tuple([z.number(), z.number(), z.number()]);

export const WorldMetaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  biome: z.enum(['forest', 'desert', 'urban', 'dungeon', 'ocean', 'tundra', 'custom']),
  timeOfDay: z.enum(['dawn', 'morning', 'afternoon', 'dusk', 'night']),
  weather: z.enum(['clear', 'fog', 'rain', 'snow', 'storm']),
  scale: z.enum(['small', 'medium', 'large']),
});

export const PlayerConfigSchema = z.object({
  spawn: Vector3Tuple.default([0, 1.7, 0]),
  startPosition: Vector3Tuple.optional(), // v1 compat alias
  movementSpeed: z.number().positive().default(4.0),
  jumpHeight: z.number().nonnegative().default(1.5),
});

export const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bounds: z.object({
    center: Vector3Tuple,
    radius: z.number().positive(),
  }),
  description: z.string().optional(),
});

export const CharacterSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Character id must be snake_case'),
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  personality: z.string().min(1),
  secrets: z.array(z.string()).default([]),
  knowledge: z.array(z.string()).default([]),
  position: Vector3Tuple,
  behavior: z.enum(['idle', 'patrol', 'sit', 'wander']).default('idle'),
  patrolPath: z.array(Vector3Tuple).optional(),
  assetUrl: z.string().optional(),
  dialogueSeed: z.string().optional(),
});

export const WorldObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  position: Vector3Tuple,
  rotation: Vector3Tuple.optional(),
  scale: Vector3Tuple.optional(),
  collidable: z.boolean().default(true),
  interactable: z.boolean().default(false),
  interactId: z.string().optional(),
  pickable: z.boolean().default(false),
  locked: z.boolean().default(false),
});

export const LightConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['ambient', 'directional', 'point', 'spot']),
  color: z.string().min(1),
  intensity: z.number().nonnegative(),
  position: Vector3Tuple.optional(),
  target: Vector3Tuple.optional(),
  castShadow: z.boolean().default(false),
});

export const EventActionSchema = z.object({
  type: z.enum([
    'start_dialogue',
    'set_flag',
    'show_text',
    'play_cutscene',
    'add_item',
    'update_world',
    'unlock',
    'teleport_player',
  ]),
  payload: z.record(z.unknown()).default({}),
});

export const EventTriggerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['proximity', 'interaction', 'item_use', 'flag', 'time']),
  target: z.string().min(1),
  range: z.number().positive().optional(),
  requiredFlag: z.string().optional(),
  requiredItem: z.string().optional(),
  condition: z.string().optional(),
  action: EventActionSchema,
});

export const SkyboxConfigSchema = z.object({
  type: z.enum(['color', 'gradient', 'procedural']).default('gradient'),
  topColor: z.string().optional(),
  bottomColor: z.string().optional(),
  sunPosition: Vector3Tuple.optional(),
});

export const AtmosphereConfigSchema = z.object({
  fogDensity: z.number().nonnegative().default(0.015),
  fogColor: z.union([z.string(), z.number()]).default('#1a1a2e'),
  ambientIntensity: z.number().nonnegative().default(0.5),
  sunColor: z.string().default('#fff4e0'),
});

export const SceneGraphSchema = z.object({
  version: z.string().default('1.0'),
  world: WorldMetaSchema,
  player: PlayerConfigSchema.default({
    startPosition: [0, 1.7, 0],
    movementSpeed: 4.0,
    jumpHeight: 1.5,
  }),
  zones: z.array(ZoneSchema).default([]),
  characters: z.array(CharacterSchema).default([]),
  objects: z.array(WorldObjectSchema).default([]),
  lights: z.array(LightConfigSchema).default([]),
  events: z.array(EventTriggerSchema).default([]),
  skybox: SkyboxConfigSchema.default({ type: 'gradient', topColor: '#0a0a1a', bottomColor: '#2a2a4a' }),
  atmosphere: AtmosphereConfigSchema.default({
    fogDensity: 0.015,
    fogColor: '#1a1a2e',
    ambientIntensity: 0.5,
    sunColor: '#fff4e0',
  }),
  flags: z.record(z.boolean()).default({}),
});

export type SceneGraph = z.infer<typeof SceneGraphSchema>;
export type WorldMeta = z.infer<typeof WorldMetaSchema>;
export type PlayerConfig = z.infer<typeof PlayerConfigSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type WorldObject = z.infer<typeof WorldObjectSchema>;
export type LightConfig = z.infer<typeof LightConfigSchema>;
export type EventTrigger = z.infer<typeof EventTriggerSchema>;
export type EventAction = z.infer<typeof EventActionSchema>;
export type SkyboxConfig = z.infer<typeof SkyboxConfigSchema>;
export type AtmosphereConfig = z.infer<typeof AtmosphereConfigSchema>;
