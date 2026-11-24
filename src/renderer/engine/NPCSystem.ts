import * as THREE from 'three';
import type { Character } from '../../shared/schema/sceneGraph.schema';
import { createDefaultHumanoid } from './DefaultMeshes';
import { imageToGeometry } from './assets/img2threejsAdapter';
import { useWorldStore } from '../store/worldStore';
import type { ResourceRegistry } from './ResourceRegistry';
import { AssetRegistry } from './AssetRegistry';

export const CLIP_ORDER = ['Idle', 'Walk', 'Run', 'Agree', 'Head shake'] as const;
export const clipRank = (n: string): number => {
  const idx = (CLIP_ORDER as readonly string[]).indexOf(n);
  return idx >= 0 ? idx : CLIP_ORDER.length;
};

// A bone named base, or base_N as GLTFLoader names a repeat.
// Prioritizes exact matches before duplicate suffixes to prevent false matches (e.g. LeftHand_Thumb).
export function findBone(root: THREE.Object3D, base: string): THREE.Bone | null {
  let exactMatch: THREE.Bone | null = null;
  let suffixMatch: THREE.Bone | null = null;
  const numSuffixRegex = new RegExp(`^${base}_\\d+$`);

  root.traverse((o) => {
    if (o instanceof THREE.Bone) {
      if (!exactMatch && o.name === base) {
        exactMatch = o;
      } else if (!suffixMatch && numSuffixRegex.test(o.name)) {
        suffixMatch = o;
      }
    }
  });

  return exactMatch || suffixMatch;
}

export type RawClip = { times: number[]; tracks: Record<string, number[]>; hips: number[] };

let cachedRawClips: Record<string, RawClip> | null = null;

export async function loadRawClips(): Promise<Record<string, RawClip> | null> {
  if (cachedRawClips) return cachedRawClips;

  if (typeof window !== 'undefined' && window.electronAPI?.polyfork) {
    try {
      const res = await window.electronAPI.polyfork.getClips();
      if (res.success && res.data && Object.keys(res.data).length > 0) {
        cachedRawClips = res.data;
        return cachedRawClips;
      }
    } catch {
      // ignore
    }
  }

  if (typeof fetch === 'function') {
    try {
      const res = await fetch('polyfork://clips.json');
      if (res.ok) {
        cachedRawClips = await res.json();
        return cachedRawClips;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function setMockClips(clips: Record<string, RawClip> | null): void {
  cachedRawClips = clips;
}

/**
 * Universal Mixamo retargeting system: retargets shared Mixamo animation clips
 * onto any skeleton in root that possesses standard Mixamo bone names.
 */
export async function sharedClipsFor(
  root: THREE.Object3D,
  rawClipsSource?: () => Promise<Record<string, RawClip> | null>
): Promise<THREE.AnimationClip[]> {
  const hipsBones: THREE.Bone[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Bone && /^Hips(_\d+)?$/.test(o.name)) {
      hipsBones.push(o);
    }
  });

  const rigs = hipsBones.filter((h) =>
    ['LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm'].every((n) => findBone(h, n))
  );

  if (!rigs.length) return [];

  const raw = rawClipsSource ? await rawClipsSource() : await loadRawClips();
  if (!raw) return [];

  return Object.keys(raw)
    .sort((a, b) => clipRank(a) - clipRank(b) || a.localeCompare(b))
    .map((name) => {
      const clip = raw[name];
      const tracks: THREE.KeyframeTrack[] = [];
      for (const hips of rigs) {
        for (const [base, values] of Object.entries(clip.tracks)) {
          const bone = base === 'Hips' ? hips : findBone(hips, base);
          if (bone && values && values.length) {
            tracks.push(new THREE.QuaternionKeyframeTrack(bone.uuid + '.quaternion', clip.times, values));
          }
        }
        const rest = hips.position;
        const k = (rest.y || 0.95) / 0.95;
        const pos = clip.hips.map((v, i) => [rest.x, rest.y, rest.z][i % 3] + v * k);
        tracks.push(new THREE.VectorKeyframeTrack(hips.uuid + '.position', clip.times, pos));
      }
      return new THREE.AnimationClip(name, -1, tracks);
    });
}

export interface NPCInstance {
  character: Character;
  group: THREE.Group;
  behavior: Character['behavior'];
  patrolIndex: number;
  wanderTarget: THREE.Vector3 | null;
  wanderTimer: number;
  bobPhase: number;
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  activeActionName?: string;
  onGestureFinished?: (e: { action: THREE.AnimationAction }) => void;
}

export class NPCSystem {
  private npcs: NPCInstance[] = [];
  private scene: THREE.Scene;
  private registry?: ResourceRegistry;
  private assetRegistry: AssetRegistry;

  private readonly _scratchLook = new THREE.Vector3();
  private readonly _scratchQuat = new THREE.Quaternion();
  private readonly _dummyObj = new THREE.Object3D();

  constructor(scene: THREE.Scene, registry?: ResourceRegistry, assetRegistry?: AssetRegistry) {
    this.scene = scene;
    this.registry = registry;
    this.assetRegistry = assetRegistry ?? new AssetRegistry();
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

      let modelMounted = false;
      const polyforkModelId =
        char.modelId ||
        (char.assetUrl && char.assetUrl.startsWith('polyfork:') ? char.assetUrl : null);

      if (polyforkModelId) {
        try {
          console.info(`[NPCSystem] Loading Polyfork character model ${polyforkModelId} for ${char.name}`);
          const characterModel = await this.assetRegistry.loadModel(polyforkModelId);
          characterModel.position.set(0, 0, 0);
          group.add(characterModel);
          group.userData.isPolyforkModel = true;
          modelMounted = true;

          // Universal Mixamo Retargeting
          const sharedClips = await sharedClipsFor(characterModel);
          const ownAnimations = (characterModel.userData.animations as THREE.AnimationClip[]) || [];
          const ownNames = new Set(ownAnimations.map((a) => a.name));
          const allClips = [...ownAnimations, ...sharedClips.filter((c) => !ownNames.has(c.name))];

          if (allClips.length > 0) {
            const mixer = new THREE.AnimationMixer(characterModel);
            const actions = new Map<string, THREE.AnimationAction>();
            for (const clip of allClips) {
              const action = mixer.clipAction(clip);
              actions.set(clip.name, action);
            }

            const initialActionName =
              char.behavior === 'patrol' || char.behavior === 'wander' ? 'Walk' : 'Idle';
            const actionName = actions.has(initialActionName)
              ? initialActionName
              : actions.has('Idle')
              ? 'Idle'
              : actions.keys().next().value;
            const startAction = actionName ? actions.get(actionName) : undefined;
            if (startAction && actionName) {
              startAction.play();
              instance.activeActionName = actionName;
            }

            instance.mixer = mixer;
            instance.actions = actions;
            console.info(`[NPCSystem] ✓ Bound ${actions.size} animations for ${char.name}`);
          }
        } catch (modelErr) {
          console.warn(`[NPCSystem] Polyfork model load failed for ${char.name} (${polyforkModelId}), falling back:`, modelErr);
        }
      }

      if (!modelMounted && portrait) {
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
      } else if (!modelMounted) {
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
    const clampedDelta = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.1));

    for (const npc of this.npcs) {
      if (npc.mixer) {
        npc.mixer.update(clampedDelta);
      }

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
        npc.group.quaternion.slerp(this._scratchQuat, clampedDelta * 3);
      }

      // Run behavior
      switch (npc.behavior) {
        case 'idle':
          this.tickIdle(npc, clampedDelta);
          break;
        case 'patrol':
          this.tickPatrol(npc, clampedDelta, dist);
          break;
        case 'wander':
          this.tickWander(npc, clampedDelta, dist);
          break;
        case 'sit':
          this.tickSit(npc, clampedDelta);
          break;
      }

      // Universal bounds clamp: Keep NPCs safely inside the terrain boundaries [-78m, +78m]
      npc.group.position.x = THREE.MathUtils.clamp(npc.group.position.x, -78, 78);
      npc.group.position.z = THREE.MathUtils.clamp(npc.group.position.z, -78, 78);
    }
  }

  private transitionClip(npc: NPCInstance, targetName: string, duration = 0.2): void {
    if (!npc.actions || npc.activeActionName === targetName) return;
    // Do not interrupt expressive one-shot dialogue gestures with locomotion ticks
    if (npc.activeActionName === 'Agree' || npc.activeActionName === 'Head shake') return;
    const nextAction = npc.actions.get(targetName);
    if (!nextAction) return;

    const prevAction = npc.activeActionName ? npc.actions.get(npc.activeActionName) : null;
    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(duration);
    }
    nextAction.reset().fadeIn(duration).play();
    npc.activeActionName = targetName;
  }

  /**
   * Expressive dialogue gesture (Agree / Head shake) played when interacting with NPC.
   */
  playGesture(npcId: string, gesture?: 'Agree' | 'Head shake'): void {
    const npc = this.npcs.find((n) => n.character.id === npcId);
    if (!npc || !npc.mixer || !npc.actions) return;
    const gestureName = gesture || (Math.random() > 0.5 ? 'Agree' : 'Head shake');
    const gestureAction = npc.actions.get(gestureName);
    if (!gestureAction) return;

    // Clean up any pending gesture listener
    if (npc.onGestureFinished && npc.mixer) {
      npc.mixer.removeEventListener('finished', npc.onGestureFinished);
      npc.onGestureFinished = undefined;
    }

    const prevAction = npc.activeActionName ? npc.actions.get(npc.activeActionName) : null;
    if (prevAction && prevAction !== gestureAction) {
      prevAction.fadeOut(0.2);
    }

    gestureAction.reset();
    gestureAction.setLoop(THREE.LoopOnce, 1);
    gestureAction.clampWhenFinished = true;
    gestureAction.fadeIn(0.2).play();
    npc.activeActionName = gestureName;

    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action === gestureAction) {
        if (npc.mixer) {
          npc.mixer.removeEventListener('finished', onFinished);
        }
        npc.onGestureFinished = undefined;
        gestureAction.fadeOut(0.2);
        const returnClip = npc.behavior === 'patrol' || npc.behavior === 'wander' ? 'Walk' : 'Idle';
        const returnAction = npc.actions?.get(returnClip) || npc.actions?.get('Idle');
        if (returnAction) {
          returnAction.reset().fadeIn(0.2).play();
          npc.activeActionName = returnClip;
        }
      }
    };
    npc.onGestureFinished = onFinished;
    npc.mixer.addEventListener('finished', onFinished);
  }

  private tickIdle(npc: NPCInstance, delta: number): void {
    npc.bobPhase += delta * 1.5;
    this.transitionClip(npc, 'Idle');

    if (npc.group.userData?.isCustomAvatar) {
      // Subtle floating hover/bob on custom volumetric avatar
      const avatarMesh = npc.group.children[0];
      if (avatarMesh) {
        avatarMesh.position.y = Math.sin(npc.bobPhase) * 0.04;
      }
    } else if (!npc.group.userData?.isPolyforkModel) {
      // Subtle head-bob animation on standard humanoid
      const headChild = npc.group.children[1]; // head is second child
      if (headChild) {
        headChild.position.y = 1.4 + Math.sin(npc.bobPhase) * 0.02;
      }
    }
  }

  private tickPatrol(npc: NPCInstance, delta: number, distToPlayer: number): void {
    const path = npc.character.patrolPath;
    if (!path || path.length < 2) {
      this.tickIdle(npc, delta);
      return;
    }
    const safeIndex = ((npc.patrolIndex % path.length) + path.length) % path.length;
    const waypoint = path[safeIndex];
    if (!waypoint || waypoint.length < 2) {
      this.tickIdle(npc, delta);
      return;
    }

    const targetX = THREE.MathUtils.clamp(waypoint[0], -75, 75);
    const targetZ = THREE.MathUtils.clamp(waypoint[2] ?? waypoint[1], -75, 75);
    const pos = npc.group.position;
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const distToTarget = Math.sqrt(dx * dx + dz * dz);

    const stepSpeed = 1.5; // patrol speed 1.5 m/s
    const maxStep = stepSpeed * delta;

    if (distToTarget <= 0.5 || distToTarget <= maxStep) {
      pos.x = targetX;
      pos.z = targetZ;
      npc.patrolIndex = (safeIndex + 1) % path.length;
      this.transitionClip(npc, 'Idle');
    } else {
      this.transitionClip(npc, 'Walk');
      if (distToPlayer >= 10 && distToTarget > 0.1) {
        this._scratchLook.set(targetX, pos.y, targetZ);
        this._dummyObj.position.copy(pos);
        this._dummyObj.lookAt(this._scratchLook);
        this._scratchQuat.copy(this._dummyObj.quaternion);
        npc.group.quaternion.slerp(this._scratchQuat, delta * 6);
      }
      const step = Math.min(maxStep, distToTarget);
      pos.x += (dx / distToTarget) * step;
      pos.z += (dz / distToTarget) * step;
    }
  }

  private tickWander(npc: NPCInstance, delta: number, distToPlayer: number): void {
    npc.wanderTimer -= delta;
    if (!npc.wanderTarget || npc.wanderTimer <= 0) {
      // Pick a new random target within 5m of spawn, strictly bounded within terrain [-75m, +75m]
      const spawnX = THREE.MathUtils.clamp(npc.character.position?.[0] ?? 0, -70, 70);
      const spawnZ = THREE.MathUtils.clamp(npc.character.position?.[2] ?? 0, -70, 70);
      const spawnY = npc.character.position?.[1] ?? 0;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 5;
      npc.wanderTarget = new THREE.Vector3(
        THREE.MathUtils.clamp(spawnX + Math.cos(angle) * radius, -75, 75),
        spawnY,
        THREE.MathUtils.clamp(spawnZ + Math.sin(angle) * radius, -75, 75)
      );
      npc.wanderTimer = 3 + Math.random() * 4; // pause 3-7 seconds between wanders
    }

    const pos = npc.group.position;
    const dx = npc.wanderTarget.x - pos.x;
    const dz = npc.wanderTarget.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const wanderSpeed = 1.0; // wander speed 1.0 m/s
    const maxStep = wanderSpeed * delta;

    if (dist > 0.5 && dist > maxStep) {
      this.transitionClip(npc, 'Walk');
      if (distToPlayer >= 10 && dist > 0.1) {
        this._scratchLook.set(npc.wanderTarget.x, pos.y, npc.wanderTarget.z);
        this._dummyObj.position.copy(pos);
        this._dummyObj.lookAt(this._scratchLook);
        this._scratchQuat.copy(this._dummyObj.quaternion);
        npc.group.quaternion.slerp(this._scratchQuat, delta * 6);
      }
      const step = Math.min(maxStep, dist);
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
    } else {
      this.transitionClip(npc, 'Idle');
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
    if (npc.mixer) {
      if (npc.onGestureFinished) {
        npc.mixer.removeEventListener('finished', npc.onGestureFinished);
        npc.onGestureFinished = undefined;
      }
      npc.mixer.stopAllAction();
      npc.mixer.uncacheRoot(npc.group);
      npc.mixer = undefined;
    }
    npc.actions?.clear();

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
