import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { NPCSystem } from '../src/renderer/engine/NPCSystem';
import { ResourceRegistry } from '../src/renderer/engine/ResourceRegistry';
import { useWorldStore } from '../src/renderer/store/worldStore';
import type { Character } from '../src/shared/schema/sceneGraph.schema';

describe('NPCSystem (Phase 3 Integration)', () => {
  let scene: THREE.Scene;
  let registry: ResourceRegistry;
  let npcSystem: NPCSystem;

  const sampleCharacter: Character = {
    id: 'char_ranger',
    name: 'Eldrin Ranger',
    description: 'A vigilant scout of the forest.',
    personality: 'Stealthy, observant, and quiet.',
    secrets: ['Knows the secret grove'],
    knowledge: ['Forest navigation'],
    position: [5, 10, -8], // Notice LLM Y is 10, must be grounded at 0
    behavior: 'idle',
  };

  const sampleBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  beforeEach(() => {
    scene = new THREE.Scene();
    registry = new ResourceRegistry();
    npcSystem = new NPCSystem(scene, registry);
    useWorldStore.getState().resetWorld();
  });

  afterEach(() => {
    npcSystem.dispose();
    registry.disposeAll();
  });

  it('detects custom portrait from character.image', () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      image: sampleBase64,
    };
    const portrait = npcSystem.findCharacterPortrait(charWithImage);
    expect(portrait).toBe(sampleBase64);
  });

  it('detects custom portrait from worldStore.uploadedImages tagged character', () => {
    useWorldStore.getState().setUploadedImages([
      { base64: sampleBase64, mimeType: 'image/png', tag: 'character' },
    ]);

    const portrait = npcSystem.findCharacterPortrait(sampleCharacter);
    expect(portrait).toBe(sampleBase64);
  });

  it('spawns a volumetric extruded avatar when a custom portrait is provided', async () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      image: sampleBase64,
    };

    const group = await npcSystem.spawnNPC(charWithImage);

    expect(group).toBeDefined();
    expect(scene.children).toContain(group);

    // Pivot grounding: Y locked to ground level (0) despite char.position[1] being 10
    expect(group.position.y).toBe(0);
    expect(group.position.x).toBe(5);
    expect(group.position.z).toBe(-8);

    // Marked as custom avatar
    expect(group.userData.isCustomAvatar).toBe(true);
    expect(group.userData.interactable).toBe(true);
    expect(group.userData.type).toBe('npc');

    // Has extruded mesh child with multi-materials
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(Array.isArray(mesh.material)).toBe(true);
  });

  it('smoothly turns to face player when player is within 10 units', async () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      position: [0, 0, 0],
      image: sampleBase64,
    };

    const group = await npcSystem.spawnNPC(charWithImage);
    const initialQuat = group.quaternion.clone();

    // Player at distance 5 (within 10m range)
    const playerPos = new THREE.Vector3(5, 1.7, 0);
    npcSystem.tick(0.5, playerPos);

    // Quaternion should have rotated towards player
    expect(group.quaternion.equals(initialQuat)).toBe(false);
  });

  it('performs idle hovering bob on custom extruded avatar', async () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      image: sampleBase64,
    };

    const group = await npcSystem.spawnNPC(charWithImage);
    const avatarMesh = group.children[0];

    // Tick forward in time
    npcSystem.tick(1.0, new THREE.Vector3(100, 0, 100)); // Far player
    expect(avatarMesh.position.y).not.toBe(0); // Bob has moved slightly
    expect(Math.abs(avatarMesh.position.y)).toBeLessThanOrEqual(0.06);
  });

  it('detects interaction via raycasting and returns character data for [E] dialogue prompt', async () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      position: [0, 0, 2],
      image: sampleBase64,
    };

    await npcSystem.spawnNPC(charWithImage);

    // Raycast towards NPC at [0, 0, 2] from origin [0, 1, 0]
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1).normalize(),
      0.1,
      10
    );

    const hitChar = npcSystem.getInteractableNPC(raycaster);
    expect(hitChar).toBeDefined();
    expect(hitChar?.id).toBe('char_ranger');
    expect(hitChar?.name).toBe('Eldrin Ranger');
  });

  it('tracks all NPC GPU resources in ResourceRegistry and cleans up on dispose', async () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      image: sampleBase64,
    };

    await npcSystem.spawnNPC(charWithImage);
    expect(registry.stats.geometries).toBeGreaterThan(0);
    expect(registry.stats.materials).toBeGreaterThan(0);

    npcSystem.dispose();
    expect(scene.children.length).toBe(0);
    expect(npcSystem.getNPCInstances().length).toBe(0);
  });

  it('prevents duplicate NPCs when spawnNPC is called multiple times for the same character', async () => {
    const charWithImage: Character = {
      ...sampleCharacter,
      image: sampleBase64,
    };

    await npcSystem.spawnNPC(charWithImage);
    expect(npcSystem.getNPCInstances().length).toBe(1);
    expect(scene.children.length).toBe(1);

    // Call spawnNPC again with same character ID
    await npcSystem.spawnNPC(charWithImage);
    expect(npcSystem.getNPCInstances().length).toBe(1);
    expect(scene.children.length).toBe(1);
  });
});
