import * as THREE from 'three';
import { presetRegistry } from './presets/PresetRegistry';

/**
 * Creates a high-fidelity 3D volumetric character archetype from the preset registry,
 * completely replacing the legacy cylinder/sphere primitive placeholder.
 */
export function createDefaultHumanoid(_color: number = 0x886644): THREE.Group {
  return presetRegistry.spawn('npc_cyber_cyborg');
}

/**
 * Creates any specified NPC archetype preset from the catalog.
 */
export function createPresetNPC(
  archetypeId:
    | 'npc_cyber_cyborg'
    | 'npc_arcane_mystic'
    | 'npc_desert_scavenger'
    | 'npc_forest_guardian'
    | 'npc_steam_alchemist' = 'npc_cyber_cyborg'
): THREE.Group {
  return presetRegistry.spawn(archetypeId);
}
