import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EventSystem } from '../src/renderer/engine/EventSystem';
import { useInventoryStore } from '../src/renderer/store/inventoryStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { useUIStore } from '../src/renderer/store/uiStore';
import type { EventTrigger } from '../src/shared/schema/sceneGraph.schema';
import {
  compressThumbnail,
  downscaleCanvasToThumbnail,
  STORAGE_KEY,
} from '../src/renderer/components/WorldLibrary/WorldLibraryModal';

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

  it('maintains index stability when removing item at index 0 while slot 2 is selected (Bug 14/18)', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'item_0', name: 'Item 0' });
    store.addItem({ id: 'item_1', name: 'Item 1' });
    store.addItem({ id: 'item_2', name: 'Item 2' });
    store.addItem({ id: 'item_3', name: 'Item 3' });

    // Select slot 2 (pointing to item_2)
    store.selectSlot(2);
    expect(useInventoryStore.getState().selectedSlot).toBe(2);
    expect(useInventoryStore.getState().getSelectedItem()?.id).toBe('item_2');

    // Remove item at index 0
    store.removeItem('item_0');

    // Items array shifted left: item_2 is now at index 1
    const state = useInventoryStore.getState();
    expect(state.items.length).toBe(3);
    expect(state.selectedSlot).toBe(1);
    expect(state.getSelectedItem()?.id).toBe('item_2');
    expect(state.getSelectedItem()?.name).toBe('Item 2');
  });

  it('clears selectedSlot to null if the selected item itself is removed', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'item_0', name: 'Item 0' });
    store.addItem({ id: 'item_1', name: 'Item 1' });
    store.addItem({ id: 'item_2', name: 'Item 2' });

    store.selectSlot(1);
    expect(useInventoryStore.getState().selectedSlot).toBe(1);
    expect(useInventoryStore.getState().getSelectedItem()?.id).toBe('item_1');

    store.removeItem('item_1');
    expect(useInventoryStore.getState().selectedSlot).toBeNull();
    expect(useInventoryStore.getState().getSelectedItem()).toBeNull();
  });

  it('keeps selectedSlot unchanged when removing an item at an index after selectedSlot', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'item_0', name: 'Item 0' });
    store.addItem({ id: 'item_1', name: 'Item 1' });
    store.addItem({ id: 'item_2', name: 'Item 2' });

    store.selectSlot(0);
    expect(useInventoryStore.getState().selectedSlot).toBe(0);
    expect(useInventoryStore.getState().getSelectedItem()?.id).toBe('item_0');

    // Remove item_2 at index 2 (after selectedSlot 0)
    store.removeItem('item_2');
    expect(useInventoryStore.getState().selectedSlot).toBe(0);
    expect(useInventoryStore.getState().getSelectedItem()?.id).toBe('item_0');
  });

  it('resets selectedSlot to null when inventory becomes empty or slot is out of bounds', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'single_item', name: 'Single Item' });
    store.selectSlot(0);

    store.removeItem('single_item');
    expect(useInventoryStore.getState().items.length).toBe(0);
    expect(useInventoryStore.getState().selectedSlot).toBeNull();
  });

  it('handles removing non-existent item gracefully without modifying selectedSlot', () => {
    const store = useInventoryStore.getState();
    store.addItem({ id: 'item_0', name: 'Item 0' });
    store.selectSlot(0);

    store.removeItem('does_not_exist');
    expect(useInventoryStore.getState().items.length).toBe(1);
    expect(useInventoryStore.getState().selectedSlot).toBe(0);
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

describe('WorldLibraryModal Thumbnail Compression & Storage Quota', () => {
  it('exports STORAGE_KEY as orbis_saved_worlds', () => {
    expect(STORAGE_KEY).toBe('orbis_saved_worlds');
  });

  it('gracefully handles non-image or invalid strings in compressThumbnail', async () => {
    const emptyResult = await compressThumbnail('');
    expect(emptyResult).toBe('');

    const textResult = await compressThumbnail('not-a-data-url');
    expect(textResult).toBe('not-a-data-url');
  });

  it('handles downscaleCanvasToThumbnail for empty canvas dimensions', () => {
    const dummyCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
    expect(downscaleCanvasToThumbnail(dummyCanvas)).toBeUndefined();
  });
});
