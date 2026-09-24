import * as THREE from 'three';
import type { SceneGraph, Character, WorldObject } from '../../shared/schema/sceneGraph.schema';
import { SceneManager } from './SceneManager';
import { PlayerController } from './PlayerController';
import { AssetRegistry } from './AssetRegistry';
import type { AssetMap } from './assets/ProceduralAssetLibrary';
import { NPCSystem } from './NPCSystem';
import { EventSystem } from './EventSystem';
import { executeBuildScene } from './DynamicLoader';
import { injectBaseScene } from './EngineDefaults';

export class WorldBuilder {
  private assetRegistry = new AssetRegistry();
  private playerController: PlayerController | null = null;
  private npcSystem: NPCSystem | null = null;
  private eventSystem: EventSystem | null = null;
  private unsubFrame: (() => void) | null = null;
  private interactRaycaster = new THREE.Raycaster();

  constructor(private readonly sceneManager: SceneManager) {}

  private findSceneObjectByUserDataId(id: string): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    this.sceneManager.scene.traverse((child) => {
      if (!found && child.userData?.id === id) {
        found = child;
      }
    });
    return found;
  }

  /**
   * Build a complete world from a scene graph and pre-generated Three.js code.
   * v2 pipeline: injects base scene (ground+lights+sky) BEFORE executing LLM code.
   */
  async buildFromCode(graph: SceneGraph, code: string): Promise<void> {
    // Step 1: Tear down previous world
    this.teardown();
    this.sceneManager.clearScene();

    // Step 2: Inject guaranteed base scene (ground, lights, sky, fog)
    // This ensures the world is never a black void, even if code fails
    const helpers = injectBaseScene(this.sceneManager.scene, graph);

    // Step 3: Execute LLM-generated scene code with assets.helpers available
    if (code && code.trim().length > 0) {
      const assets: AssetMap = {
        textures: this.assetRegistry.getAssetMap().textures,
        helpers,
      };
      try {
        await executeBuildScene(
          code,
          this.sceneManager.scene,
          assets,
        );
      } catch (err) {
        // Base scene already injected, so user sees ground+lights even on failure
        console.warn('[WorldBuilder] LLM code execution failed, base scene preserved:', err);
      }
    }

    // Step 4: Spawn any graph objects not yet added to scene
    if (graph.objects && graph.objects.length > 0) {
      for (const objDef of graph.objects) {
        const exists = this.findSceneObjectByUserDataId(objDef.id);
        if (!exists) {
          const mesh = this.createPatchObjectMesh(objDef);
          this.sceneManager.add(mesh);
        }
      }
    }

    // Step 5: Spawn NPCs
    if (graph.characters && graph.characters.length > 0) {
      this.npcSystem = new NPCSystem(this.sceneManager.scene);
      this.npcSystem.spawnAll(graph.characters);
    }

    // Step 5.5: Material safety sweep — fix any missing materials / wireframe ghosts
    const fixedCount = this.sceneManager.sanitiseMaterials();
    if (fixedCount > 0) {
      console.warn(`[WorldBuilder] sanitiseMaterials fixed ${fixedCount} objects after build`);
    }

    // Step 5.6: Deferred scene audit (2s after build)
    setTimeout(() => {
      let wireframeCount = 0;
      this.sceneManager.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshBasicMaterial || !m) wireframeCount++;
          }
        }
      });
      if (wireframeCount > 0) {
        console.error(`[Audit] ${wireframeCount} objects with Basic/missing materials found`);
      }
    }, 2000);

    // Step 6: Setup Event System
    this.eventSystem = new EventSystem({
      onTeleport: (pos) => this.teleportPlayer(pos),
    });
    if (graph.events && graph.events.length > 0) {
      this.eventSystem.registerAll(graph.events);
    }

    // Step 7: Set up player & frame ticks
    this.setupPlayer(graph);
  }

  /** Create and configure the first-person player controller. */
  private setupPlayer(graph: SceneGraph): void {
    const startPos = graph.player?.spawn ?? graph.player?.startPosition ?? [0, 1.7, 0];
    this.teleportPlayer(startPos);

    this.playerController = new PlayerController(
      this.sceneManager.camera,
      this.sceneManager.domElement
    );

    this.refreshCollidables();

    // Wire player update, NPC ticking, and EventSystem into animation loop
    this.unsubFrame = this.sceneManager.onFrame((delta) => {
      this.playerController?.update(delta);
      const playerPos = this.sceneManager.camera.position;
      if (this.npcSystem) {
        this.npcSystem.tick(delta, playerPos);
      }
      if (this.eventSystem) {
        this.eventSystem.tick(delta, playerPos, this.sceneManager.scene);
      }
    });
  }

  private refreshCollidables(): void {
    const collidables: THREE.Object3D[] = [];
    this.sceneManager.scene.traverse((child) => {
      if (child.userData?.collidable === true) {
        collidables.push(child);
      }
    });
    this.playerController?.setCollidables(collidables);
  }

  /** Teleport the player/camera to a specific position. */
  teleportPlayer(pos: [number, number, number]): void {
    this.sceneManager.camera.position.set(pos[0], pos[1], pos[2]);
  }

  /** Lock the pointer to start first-person control. */
  requestPointerLock(): void {
    this.playerController?.requestLock();
  }

  get isPointerLocked(): boolean {
    return this.playerController?.isLocked ?? false;
  }

  /**
   * Check if camera crosshair is pointing at an interactable NPC.
   */
  getHoveredNPC(): Character | null {
    if (!this.npcSystem || !this.playerController?.isLocked) return null;
    this.interactRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.sceneManager.camera);
    return this.npcSystem.getInteractableNPC(this.interactRaycaster);
  }

  /**
   * Check if camera crosshair is pointing at an interactable or pickable object.
   */
  getHoveredObject(): THREE.Object3D | null {
    if (!this.playerController?.isLocked) return null;
    this.interactRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.sceneManager.camera);
    this.interactRaycaster.far = 4.0; // 4m interaction reach

    const hits = this.interactRaycaster.intersectObjects(this.sceneManager.scene.children, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.sceneManager.scene) {
        if (
          obj.userData?.interactable === true ||
          obj.userData?.pickable === true ||
          obj.userData?.id
        ) {
          return obj;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  /**
   * Trigger an interaction with a target object ID (via EventSystem or pickup).
   */
  interactWithObject(targetId: string, activeItemId?: string): boolean {
    if (this.eventSystem) {
      return this.eventSystem.handleInteraction(
        targetId,
        activeItemId,
        this.sceneManager.scene
      );
    }
    return false;
  }

  /**
   * Apply live partial world patch from LLM.
   */
  applyPatch(partial: Partial<SceneGraph>): void {
    // 1. Add/Update objects
    if (partial.objects && partial.objects.length > 0) {
      for (const objDef of partial.objects) {
        // Remove existing object with this ID if any
        const existing = this.findSceneObjectByUserDataId(objDef.id);
        if (existing) {
          this.sceneManager.remove(existing);
        }

        // Procedural mesh fallback for patch additions
        const mesh = this.createPatchObjectMesh(objDef);
        this.sceneManager.add(mesh);
      }
      this.refreshCollidables();
    }

    // 2. Add/Update characters
    if (partial.characters && partial.characters.length > 0) {
      if (!this.npcSystem) {
        this.npcSystem = new NPCSystem(this.sceneManager.scene);
      }
      for (const char of partial.characters) {
        this.npcSystem.spawnAll([char]);
      }
    }

    // 3. Register any new events
    if (partial.events && partial.events.length > 0 && this.eventSystem) {
      this.eventSystem.appendEvents(partial.events);
    }
  }

  private createPatchObjectMesh(objDef: WorldObject): THREE.Object3D {
    let geo: THREE.BufferGeometry;
    let color = 0x8b5cf6;

    switch (objDef.type) {
      case 'structure':
      case 'building':
        geo = new THREE.BoxGeometry(3, 4, 3);
        color = 0x64748b;
        break;
      case 'foliage':
        geo = new THREE.ConeGeometry(1.2, 3.5, 6);
        color = 0x15803d;
        break;
      case 'item':
        geo = new THREE.DodecahedronGeometry(0.4);
        color = 0xf59e0b;
        break;
      default:
        geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        color = 0xa855f7;
    }

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...objDef.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      id: objDef.id,
      name: objDef.name,
      type: objDef.type,
      collidable: objDef.collidable ?? true,
      interactable: objDef.interactable ?? false,
      pickable: objDef.pickable ?? false,
    };
    return mesh;
  }

  /** Tear down the current world's runtime state. */
  teardown(): void {
    if (this.unsubFrame) {
      this.unsubFrame();
      this.unsubFrame = null;
    }
    if (this.playerController) {
      this.playerController.dispose();
      this.playerController = null;
    }
    if (this.npcSystem) {
      this.npcSystem.dispose();
      this.npcSystem = null;
    }
    if (this.eventSystem) {
      this.eventSystem.dispose();
      this.eventSystem = null;
    }
    this.assetRegistry.disposeAll();
  }

  dispose(): void {
    this.teardown();
  }
}
