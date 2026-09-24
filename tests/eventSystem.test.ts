import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EventSystem } from '../src/renderer/engine/EventSystem';
import { useInventoryStore } from '../src/renderer/store/inventoryStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { useUIStore } from '../src/renderer/store/uiStore';
import type { EventTrigger } from '../src/shared/schema/sceneGraph.schema';

describe('InventoryStore', () => {
  beforeEach(() => {
    useInventoryStore.getState().clearInventory();
  });

  it('adds items up to max capacity', () => {
    const store = useInventoryStore.getState();
    const added = store.addItem({ id: 'key_1', name: 'Golden Key', icon: '🗝️' });
    expect(added).toBe(true);
    expect(useInventoryStore.getState().items.length).toBe(1);

    // Adding same id does not duplicate
    store.addItem({ id: 'key_1', name: 'Golden Key', icon: '🗝️' });
    expect(useInventoryStore.getState().items.length).toBe(1);
  });

  it('selects and deselects slots', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'gem_1', name: 'Ruby', icon: '💎' });
    store.selectSlot(0);
    expect(useInventoryStore.getState().selectedSlot).toBe(0);
    expect(useInventoryStore.getState().getSelectedItem()?.name).toBe('Ruby');

    // Clicking same slot toggles to null
    store.selectSlot(0);
    expect(useInventoryStore.getState().selectedSlot).toBeNull();
  });

  it('removes item and clears selection if removed', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'potion', name: 'Health Potion' });
    store.selectSlot(0);
    store.removeItem('potion');
    expect(useInventoryStore.getState().items.length).toBe(0);
    expect(useInventoryStore.getState().selectedSlot).toBeNull();
  });
});

describe('EventSystem', () => {
  let eventSystem: EventSystem;
  let scene: THREE.Scene;

  beforeEach(() => {
    useWorldStore.getState().resetWorld();
    useInventoryStore.getState().clearInventory();
    scene = new THREE.Scene();
    eventSystem = new EventSystem();
  });

  it('handles proximity triggers when player is within range', () => {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    door.position.set(0, 0, 5);
    door.userData = { id: 'dungeon_door', locked: true, collidable: true };
    scene.add(door);

    const trigger: EventTrigger = {
      id: 'door_proximity',
      type: 'proximity',
      target: 'dungeon_door',
      range: 3.0,
      action: {
        type: 'show_text',
        payload: { text: 'You hear a cold wind behind the iron door.' },
      },
    };

    eventSystem.registerAll([trigger]);

    // Player far away (at 0, 0, 15) -> shouldn't trigger
    eventSystem.tick(0.016, new THREE.Vector3(0, 0, 15), scene);
    expect(useUIStore.getState().notifications.length).toBe(0);

    // Player walks close (at 0, 0, 6) -> distance = 1 < 3.0 -> triggers!
    eventSystem.tick(0.016, new THREE.Vector3(0, 0, 6), scene);
    expect(useUIStore.getState().notifications.length).toBe(1);
    expect(useUIStore.getState().notifications[0].message).toContain('cold wind');

    // Second tick does not duplicate once-only event
    eventSystem.tick(0.016, new THREE.Vector3(0, 0, 6), scene);
    expect(useUIStore.getState().notifications.length).toBe(1);
  });

  it('handles item_use triggers on interaction', () => {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    chest.position.set(2, 0, 0);
    chest.userData = { id: 'ancient_chest', locked: true };
    scene.add(chest);

    const trigger: EventTrigger = {
      id: 'unlock_chest',
      type: 'item_use',
      target: 'ancient_chest',
      requiredItem: 'skeleton_key',
      action: {
        type: 'unlock',
        payload: { targetId: 'ancient_chest', text: 'The ancient chest clicks open!' },
      },
    };

    eventSystem.registerAll([trigger]);

    // Interact without key -> false
    const wrongItemResult = eventSystem.handleInteraction('ancient_chest', 'wrong_key', scene);
    expect(wrongItemResult).toBe(false);
    expect(chest.userData.locked).toBe(true);

    // Interact with correct key -> true, unlocks chest
    const correctResult = eventSystem.handleInteraction('ancient_chest', 'skeleton_key', scene);
    expect(correctResult).toBe(true);
    expect(chest.userData.locked).toBe(false);
  });

  it('handles set_flag and add_item actions', () => {
    const trigger: EventTrigger = {
      id: 'pickup_gem',
      type: 'interaction',
      target: 'gem_altar',
      action: {
        type: 'add_item',
        payload: { id: 'altar_gem', name: 'Star Sapphire', icon: '💎' },
      },
    };

    eventSystem.registerAll([trigger]);
    eventSystem.handleInteraction('gem_altar', undefined, scene);

    expect(useInventoryStore.getState().items.length).toBe(1);
    expect(useInventoryStore.getState().items[0].name).toBe('Star Sapphire');
  });
});
