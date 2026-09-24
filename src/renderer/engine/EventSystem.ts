import * as THREE from 'three';
import type { EventTrigger, EventAction } from '../../shared/schema/sceneGraph.schema';
import { useWorldStore } from '../store/worldStore';
import { useNPCStore } from '../store/npcStore';
import { useInventoryStore } from '../store/inventoryStore';
import { useUIStore } from '../store/uiStore';

export class EventSystem {
  private events: EventTrigger[] = [];
  private firedEventIds = new Set<string>();
  private elapsedTime = 0;
  private onUpdateWorldCallback?: (prompt: string) => void;
  private onTeleportCallback?: (pos: [number, number, number]) => void;
  
  private objectCache = new Map<string, THREE.Object3D>();
  private readonly _scratchPos = new THREE.Vector3();

  constructor(
    options?: {
      onUpdateWorld?: (prompt: string) => void;
      onTeleport?: (pos: [number, number, number]) => void;
    }
  ) {
    this.onUpdateWorldCallback = options?.onUpdateWorld;
    this.onTeleportCallback = options?.onTeleport;
  }

  registerAll(events: EventTrigger[]): void {
    this.events = [...events];
    this.firedEventIds.clear();
    this.elapsedTime = 0;
    this.clearCache();
  }

  appendEvents(newEvents: EventTrigger[]): void {
    const existingIds = new Set(this.events.map((e) => e.id));
    for (const ev of newEvents) {
      if (!existingIds.has(ev.id)) {
        this.events.push(ev);
      }
    }
    this.clearCache();
  }

  clearCache(): void {
    this.objectCache.clear();
  }

  /**
   * Evaluates active continuous triggers (proximity, time, flag).
   * Called each frame in the render loop.
   */
  tick(delta: number, playerPos: THREE.Vector3, scene: THREE.Scene): void {
    this.elapsedTime += delta;
    const currentFlags = useWorldStore.getState().flags;

    for (const trigger of this.events) {
      if (this.firedEventIds.has(trigger.id)) continue;

      // Check prerequisite flag if specified
      if (trigger.requiredFlag && !currentFlags[trigger.requiredFlag]) {
        continue;
      }

      // Proximity Trigger
      if (trigger.type === 'proximity') {
        const targetObj = this.findObjectById(scene, trigger.target);
        if (targetObj) {
          targetObj.getWorldPosition(this._scratchPos);
          const dist = playerPos.distanceTo(this._scratchPos);
          const range = trigger.range ?? 3.0;

          if (dist <= range) {
            this.executeAction(trigger.action, trigger, scene);
          }
        }
      }

      // Time Trigger
      else if (trigger.type === 'time') {
        const targetSeconds = trigger.range ?? 10.0;
        if (this.elapsedTime >= targetSeconds) {
          this.executeAction(trigger.action, trigger, scene);
        }
      }

      // Flag Trigger
      else if (trigger.type === 'flag' && trigger.condition) {
        if (currentFlags[trigger.condition]) {
          this.executeAction(trigger.action, trigger, scene);
        }
      }
    }
  }

  /**
   * Called when player presses E while looking at an object.
   * Returns true if an interaction event was triggered.
   */
  handleInteraction(targetId: string, currentItemId: string | undefined, scene: THREE.Scene): boolean {
    const currentFlags = useWorldStore.getState().flags;
    let handled = false;

    for (const trigger of this.events) {
      if (this.firedEventIds.has(trigger.id)) continue;

      if (trigger.requiredFlag && !currentFlags[trigger.requiredFlag]) {
        continue;
      }

      // Check standard interaction trigger
      if (trigger.type === 'interaction' && trigger.target === targetId) {
        this.executeAction(trigger.action, trigger, scene);
        handled = true;
        break;
      }

      // Check item use trigger
      if (
        trigger.type === 'item_use' &&
        trigger.target === targetId &&
        trigger.requiredItem &&
        trigger.requiredItem === currentItemId
      ) {
        this.executeAction(trigger.action, trigger, scene);
        handled = true;
        break;
      }
    }

    return handled;
  }

  private executeAction(action: EventAction, trigger: EventTrigger, scene: THREE.Scene): void {
    this.firedEventIds.add(trigger.id);
    const payload = action.payload as Record<string, unknown>;

    switch (action.type) {
      case 'show_text': {
        const text = (payload.text as string) || (payload.message as string) || 'An event occurred.';
        const duration = (payload.duration as number) || 4000;
        useUIStore.getState().showNotification(text, duration, 'info');
        break;
      }

      case 'set_flag': {
        const key = (payload.key as string) || trigger.target;
        const val = payload.value !== undefined ? Boolean(payload.value) : true;
        useWorldStore.getState().setFlag(key, val);
        break;
      }

      case 'start_dialogue': {
        const npcId = (payload.npcId as string) || trigger.target;
        const graph = useWorldStore.getState().sceneGraph;
        const char = graph?.characters?.find((c) => c.id === npcId);
        if (char) {
          useNPCStore.getState().setActiveNPC(char);
          document.exitPointerLock();
        }
        break;
      }

      case 'add_item': {
        const itemId = (payload.id as string) || (payload.itemId as string) || `item_${Date.now()}`;
        const name = (payload.name as string) || 'Special Item';
        const description = (payload.description as string) || '';
        const icon = (payload.icon as string) || '📦';

        useInventoryStore.getState().addItem({ id: itemId, name, description, icon });
        useUIStore.getState().showNotification(`Acquired: ${name}`, 3500, 'success');
        break;
      }

      case 'unlock': {
        const targetId = (payload.targetId as string) || trigger.target;
        const obj = this.findObjectById(scene, targetId);
        if (obj) {
          obj.userData.locked = false;
          obj.userData.collidable = false; // Player can now walk through the unlocked doorway/gate
          // Subtle unlock visual swing
          obj.rotation.y += Math.PI / 2;
        }
        useUIStore.getState().showNotification(
          (payload.text as string) || 'Mechanism unlocked.',
          3500,
          'success'
        );
        break;
      }

      case 'teleport_player': {
        const pos = payload.position as [number, number, number];
        if (Array.isArray(pos) && pos.length === 3) {
          if (this.onTeleportCallback) {
            this.onTeleportCallback(pos);
          }
          useUIStore.getState().showNotification('Teleported!', 2500, 'info');
        }
        break;
      }

      case 'update_world': {
        const prompt = (payload.prompt as string) || 'Refine the surrounding world.';
        if (this.onUpdateWorldCallback) {
          this.onUpdateWorldCallback(prompt);
        }
        break;
      }

      default:
        console.debug(`[EventSystem] Unhandled action type: ${action.type}`, action);
    }
  }

  private findObjectById(scene: THREE.Scene, id: string): THREE.Object3D | null {
    if (this.objectCache.has(id)) {
      return this.objectCache.get(id) || null;
    }
    let found: THREE.Object3D | null = null;
    scene.traverse((child) => {
      if (found) return;
      if (child.userData?.id === id || child.name === id) {
        found = child;
      }
    });
    if (found) {
      this.objectCache.set(id, found);
    }
    return found;
  }

  dispose(): void {
    this.events = [];
    this.firedEventIds.clear();
    this.elapsedTime = 0;
    this.clearCache();
  }
}
