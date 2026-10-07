import * as THREE from 'three';
import type { Character } from '../../shared/schema/sceneGraph.schema';
import { createDefaultHumanoid } from './DefaultMeshes';
import { imageToGeometry } from './assets/img2threejsAdapter';
import { useWorldStore } from '../store/worldStore';
import type { ResourceRegistry } from './ResourceRegistry';

export interface NPCInstance {
  character: Character;
  group: THREE.Group;
  behavior: Character['behavior'];
  patrolIndex: number;
  wanderTarget: THREE.Vector3 | null;
  wanderTimer: number;
  bobPhase: number;
}

export class NPCSystem {
  private npcs: NPCInstance[] = [];
  private scene: THREE.Scene;
  private registry?: ResourceRegistry;

  private readonly _scratchLook = new THREE.Vector3();
  private readonly _scratchQuat = new THREE.Quaternion();
  private readonly _dummyObj = new THREE.Object3D();

  constructor(scene: THREE.Scene, registry?: ResourceRegistry) {
    this.scene = scene;
    this.registry = registry;
  }

  async spawnAll(characters: Character[]): Promise<void> {
    console.info(`[NPCSystem] Spawning ${characters.length} NPCs`);
    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      console.info(`  → Spawning ${char.name} at [${char.position.join(', ')}]`);
      await this.spawnNPC(char, i);
    }
    console.info('[NPCSystem] All NPCs spawned');
  }

  async spawnNPC(char: Character, index = 0): Promise<THREE.Group> {
    try {
      // Remove any existing NPC with the same ID to prevent duplicates
      const existingIndex = this.npcs.findIndex((n) => n.character.id === char.id);
      if (existingIndex !== -1) {
        this.disposeNPC(this.npcs[existingIndex]);
        this.npcs.splice(existingIndex, 1);
      }

      const portrait = this.findCharacterPortrait(char, index);

      // Create container group locked to ground level (y = 0)
      const group = new THREE.Group();
      group.position.set(char.position[0], 0, char.position[2]);
      group.userData = {
        id: char.id,
        type: 'npc',
        name: char.name,
        interactable: true,
        collidable: true,
        isNPC: true,
      };

      this.scene.add(group);

      const instance: NPCInstance = {
        character: char,
        group,
        behavior: char.behavior ?? 'idle',
        patrolIndex: 0,
        wanderTarget: null,
        wanderTimer: 0,
        bobPhase: Math.random() * Math.PI * 2,
      };
      this.npcs.push(instance);

      if (portrait) {
        try {
          console.info(`[NPCSystem] Spawning custom volumetric avatar for ${char.name} via img2threejsAdapter`);
          const customAvatar = await imageToGeometry(portrait, {
            id: char.id,
            name: char.name,
            registry: this.registry,
          });

          // Mount custom mesh
          while (customAvatar.children.length > 0) {
            const child = customAvatar.children[0];
            customAvatar.remove(child);
            group.add(child);
          }
          group.userData = { ...group.userData, ...customAvatar.userData, isCustomAvatar: true };
          console.info(`[NPCSystem] ✓ Custom avatar spawned for ${char.name}`);
        } catch (convErr) {
          console.warn(`[NPCSystem] Portrait conversion failed for ${char.name}, using fallback humanoid:`, convErr);
          const fallback = createDefaultHumanoid();
          while (fallback.children.length > 0) {
            const child = fallback.children[0];
            fallback.remove(child);
            group.add(child);
          }
        }
      } else {
        // Standard procedural humanoid
        const defaultMesh = createDefaultHumanoid();
        while (defaultMesh.children.length > 0) {
          const child = defaultMesh.children[0];
          defaultMesh.remove(child);
          group.add(child);
        }
      }

      if (this.registry) {
        this.registry.trackObject(group);
      }

      console.info(`[NPCSystem] ✓ Spawned ${char.name}`);
      return group;
    } catch (err) {
      // Emergency fallback — always produces a visible mesh
      console.error(`[NPCSystem] Critical failure spawning ${char.name}:`, err);
      const emergency = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, emissiveIntensity: 0.5 }),
      );
      emergency.position.set(0, 1.0, 0);
      emergency.userData = { id: char.id, name: char.name, type: 'npc_error', interactable: true };
      emergency.castShadow = true;

      const group = new THREE.Group();
      group.position.set(char.position[0], 0, char.position[2]);
      group.add(emergency);
      group.userData = { id: char.id, name: char.name, type: 'npc_error', interactable: true };
      this.scene.add(group);

      this.npcs.push({
        character: char,
        group,
        behavior: 'idle',
        patrolIndex: 0,
        wanderTarget: null,
        wanderTimer: 0,
        bobPhase: 0,
      });

      if (this.registry) {
        this.registry.trackObject(group);
      }

      return group;
    }
  }

  /**
   * Looks up custom character portrait in character.image, character.assetUrl,
   * or worldStore.uploadedImages (tagged 'character').
   */
  findCharacterPortrait(char: Character, index = 0): string | null {
    // 1. Direct character image property
    if (char.image && typeof char.image === 'string' && char.image.trim().length > 0) {
      return char.image.trim();
    }

    // 2. assetUrl if it contains image/base64 data
    if (
      char.assetUrl &&
      (char.assetUrl.startsWith('data:image') ||
        char.assetUrl.startsWith('blob:') ||
        char.assetUrl.length > 50)
    ) {
      return char.assetUrl.trim();
    }

    // 3. worldStore uploadedImages tagged as 'character'
    try {
      const uploadedImages = useWorldStore.getState().uploadedImages;
      if (uploadedImages && uploadedImages.length > 0) {
        const charImages = uploadedImages.filter(
          (img) => (img.tag || '').toLowerCase() === 'character'
        );
        if (charImages.length > 0) {
          // If multiple, map by index or take first
          const target = charImages[index] || charImages[0];
          return target.base64;
        }
      }
    } catch {
      // In headless or test environments where store is empty
    }

    return null;
  }

  tick(delta: number, playerPosition: THREE.Vector3): void {
    for (const npc of this.npcs) {
      // Look at player if within 10 units
      const dist = npc.group.position.distanceTo(playerPosition);
      if (dist > 0.01 && dist < 10) {
        this._scratchLook.set(
          playerPosition.x,
          npc.group.position.y, // don't tilt up/down
          playerPosition.z
        );
        // Smooth look-at with slerp
        this._dummyObj.position.copy(npc.group.position);
        this._dummyObj.lookAt(this._scratchLook);
        this._scratchQuat.copy(this._dummyObj.quaternion);
        npc.group.quaternion.slerp(this._scratchQuat, delta * 3);
      }

      // Run behavior
      switch (npc.behavior) {
        case 'idle':
          this.tickIdle(npc, delta);
          break;
        case 'patrol':
          this.tickPatrol(npc, delta);
          break;
        case 'wander':
          this.tickWander(npc, delta);
          break;
        case 'sit':
          this.tickSit(npc, delta);
          break;
      }
    }
  }

  private tickIdle(npc: NPCInstance, delta: number): void {
    npc.bobPhase += delta * 1.5;

    if (npc.group.userData?.isCustomAvatar) {
      // Subtle floating hover/bob on custom volumetric avatar
      const avatarMesh = npc.group.children[0];
      if (avatarMesh) {
        avatarMesh.position.y = Math.sin(npc.bobPhase) * 0.04;
      }
    } else {
      // Subtle head-bob animation on standard humanoid
      const headChild = npc.group.children[1]; // head is second child
      if (headChild) {
        headChild.position.y = 1.4 + Math.sin(npc.bobPhase) * 0.02;
      }
    }
  }

  private tickPatrol(npc: NPCInstance, delta: number): void {
    const path = npc.character.patrolPath;
    if (!path || path.length < 2) {
      this.tickIdle(npc, delta);
      return;
    }
    const target = new THREE.Vector3(...path[npc.patrolIndex]);
    const pos = npc.group.position;
    const dir = target.clone().sub(pos);
    dir.y = 0;
    const distToTarget = dir.length();
    if (distToTarget < 0.5) {
      npc.patrolIndex = (npc.patrolIndex + 1) % path.length;
    } else {
      dir.normalize().multiplyScalar(1.5 * delta); // patrol speed 1.5 m/s
      pos.add(dir);
    }
  }

  private tickWander(npc: NPCInstance, delta: number): void {
    npc.wanderTimer -= delta;
    if (!npc.wanderTarget || npc.wanderTimer <= 0) {
      // Pick a new random target within 5m of spawn
      const spawn = new THREE.Vector3(...npc.character.position);
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 5;
      npc.wanderTarget = new THREE.Vector3(
        spawn.x + Math.cos(angle) * radius,
        spawn.y,
        spawn.z + Math.sin(angle) * radius
      );
      npc.wanderTimer = 3 + Math.random() * 4; // pause 3-7 seconds between wanders
    }
    const dir = npc.wanderTarget.clone().sub(npc.group.position);
    dir.y = 0;
    if (dir.length() > 0.5) {
      dir.normalize().multiplyScalar(1.0 * delta); // wander speed 1.0 m/s
      npc.group.position.add(dir);
    }
  }

  private tickSit(npc: NPCInstance, delta: number): void {
    // Slight sway
    npc.bobPhase += delta * 0.8;
    npc.group.rotation.z = Math.sin(npc.bobPhase) * 0.02;
  }

  /** Returns the NPC character data if raycaster hits an NPC group. */
  getInteractableNPC(raycaster: THREE.Raycaster): Character | null {
    let closestChar: Character | null = null;
    let minDistance = 4;
    for (const npc of this.npcs) {
      npc.group.updateMatrixWorld(true);
      const hits = raycaster.intersectObject(npc.group, true);
      if (hits.length > 0 && hits[0].distance < minDistance) {
        minDistance = hits[0].distance;
        closestChar = npc.character;
      }
    }
    return closestChar;
  }

  /** Get all NPC groups (for collision or other queries). */
  getAllGroups(): THREE.Group[] {
    return this.npcs.map((n) => n.group);
  }

  /** Get all active NPC instances. */
  getNPCInstances(): NPCInstance[] {
    return this.npcs;
  }

  /** Cleanly dispose an individual NPC and free all its GPU buffers. */
  disposeNPC(npc: NPCInstance): void {
    npc.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : child.material
          ? [child.material]
          : [];
        mats.forEach((m) => {
          m.dispose();
          for (const key of [
            'map',
            'normalMap',
            'roughnessMap',
            'metalnessMap',
            'aoMap',
            'emissiveMap',
            'bumpMap',
            'displacementMap',
            'alphaMap',
          ]) {
            const val = (m as unknown as Record<string, unknown>)[key];
            if (
              val &&
              typeof val === 'object' &&
              'isTexture' in val &&
              (val as { isTexture: boolean }).isTexture
            ) {
              (val as THREE.Texture).dispose();
            }
          }
        });
      }
    });
    npc.group.clear();
    this.scene.remove(npc.group);
  }

  dispose(): void {
    for (const npc of this.npcs) {
      this.disposeNPC(npc);
    }
    this.npcs = [];
  }
}
