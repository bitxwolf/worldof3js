import * as THREE from 'three';
import type { Character } from '../../shared/schema/sceneGraph.schema';
import { createDefaultHumanoid } from './DefaultMeshes';

interface NPCInstance {
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

  private readonly _scratchLook = new THREE.Vector3();
  private readonly _scratchQuat = new THREE.Quaternion();
  private readonly _dummyObj = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnAll(characters: Character[]): void {
    console.info(`[NPCSystem] Spawning ${characters.length} NPCs`);
    for (const char of characters) {
      console.info(`  → Spawning ${char.name} at [${char.position.join(', ')}]`);
      this.spawnNPC(char);
    }
    console.info('[NPCSystem] All NPCs spawned');
  }

  private spawnNPC(char: Character): void {
    try {
      const group = createDefaultHumanoid();
      // Lock Y to ground level — LLM Y values (char.position[1]) are often wrong
      group.position.set(char.position[0], 0, char.position[2]);
      group.userData = {
        id: char.id,
        type: 'npc',
        name: char.name,
        interactable: true,
        collidable: false,
      };

      this.scene.add(group);

      this.npcs.push({
        character: char,
        group,
        behavior: char.behavior ?? 'idle',
        patrolIndex: 0,
        wanderTarget: null,
        wanderTimer: 0,
        bobPhase: Math.random() * Math.PI * 2,
      });

      console.info(`[NPCSystem] ✓ Spawned ${char.name}`);
    } catch (err) {
      // Emergency fallback — always produces a visible mesh
      console.error(`[NPCSystem] Critical failure spawning ${char.name}:`, err);
      const emergency = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, emissiveIntensity: 0.5 }),
      );
      emergency.position.set(char.position[0], 1.0, char.position[2]);
      emergency.userData = { id: char.id, name: char.name, type: 'npc_error', interactable: true };
      emergency.castShadow = true;
      this.scene.add(emergency);

      this.npcs.push({
        character: char,
        group: new THREE.Group().add(emergency) as unknown as THREE.Group,
        behavior: 'idle',
        patrolIndex: 0,
        wanderTarget: null,
        wanderTimer: 0,
        bobPhase: 0,
      });
    }
  }

  tick(delta: number, playerPosition: THREE.Vector3): void {
    for (const npc of this.npcs) {
      // Look at player if within 10 units
      const dist = npc.group.position.distanceTo(playerPosition);
      if (dist < 10) {
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
    // Subtle head-bob animation
    npc.bobPhase += delta * 1.5;
    const headChild = npc.group.children[1]; // head is second child
    if (headChild) {
      headChild.position.y = 1.4 + Math.sin(npc.bobPhase) * 0.02;
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
    return this.npcs.map(n => n.group);
  }

  dispose(): void {
    for (const npc of this.npcs) {
      npc.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      npc.group.clear();
      this.scene.remove(npc.group);
    }
    this.npcs = [];
  }
}
