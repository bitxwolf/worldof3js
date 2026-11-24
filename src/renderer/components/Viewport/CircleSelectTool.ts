import * as THREE from 'three';
import { useOrchestratorStore } from '../../store/orchestratorStore';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import type { ViewportBiomeType } from '../../../shared/agents/agentTypes';
import type { SelectionContext } from '../../../shared/agents/agentTypes';
import { transport } from '../../../shared/transport';
import { IPC_CHANNELS } from '../../../shared/constants';
import { AudioManager } from '../../engine/AudioManager';

export class CircleSelectTool {
  private static lastRadius: number = 25;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private canvas: HTMLCanvasElement;
  private reticle: THREE.Group;
  private radius: number = CircleSelectTool.lastRadius;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private wheelDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private onPointerDownBound = this.onPointerDown.bind(this);
  private onPointerMoveBound = this.onPointerMove.bind(this);
  private onPointerUpBound = this.onPointerUp.bind(this);
  private onPointerCancelBound = this.onPointerCancel.bind(this);
  private onWheelBound = this.onWheel.bind(this);
  private onContextMenuBound = this.onContextMenu.bind(this);

  private activeBiome: ViewportBiomeType = 'pine';
  private getTerrainMesh: () => THREE.Mesh | null;
  private onDismiss?: () => void;
  private isDragging: boolean = false;
  private isDisposed: boolean = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    terrainMeshOrGetter: THREE.Mesh | (() => THREE.Mesh | null) | null,
    activeBiome: ViewportBiomeType,
    onDismiss?: () => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.getTerrainMesh = typeof terrainMeshOrGetter === 'function' ? terrainMeshOrGetter : () => terrainMeshOrGetter;
    this.activeBiome = activeBiome;
    this.onDismiss = onDismiss;

    // Create Reticle
    this.reticle = new THREE.Group();
    this.reticle.position.y = 0.05; // Prevent z-fighting
    this.reticle.rotation.x = -Math.PI / 2;

    // Translucent filled circle (depthTest: false ensures reticle is never clipped under mountains)
    const fillGeo = new THREE.CircleGeometry(1, 64);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.renderOrder = 999;
    this.reticle.add(fillMesh);

    // Outline ring
    const outlineGeo = new THREE.RingGeometry(0.96, 1, 64);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
    outlineMesh.renderOrder = 1000;
    this.reticle.add(outlineMesh);

    this.updateRadius(this.radius);
    this.scene.add(this.reticle);

    // Attach listeners
    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('pointercancel', this.onPointerCancelBound);
    this.canvas.addEventListener('wheel', this.onWheelBound, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenuBound);
  }

  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  public updateInitialPosition(event?: { clientX: number; clientY: number } | null): void {
    if (!event) return;
    this.updatePosition(event as MouseEvent);
  }

  public setActiveBiome(biome: ViewportBiomeType): void {
    this.activeBiome = biome;
  }

  public setVisible(visible: boolean): void {
    this.reticle.visible = visible;
  }

  private updateRadius(r: number) {
    this.radius = THREE.MathUtils.clamp(r, 5, 100);
    CircleSelectTool.lastRadius = this.radius;
    this.reticle.scale.set(this.radius, this.radius, 1);
  }

  private updatePosition(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const terrainMesh = this.getTerrainMesh();
    if (terrainMesh) {
      const intersects = this.raycaster.intersectObject(terrainMesh);
      if (intersects.length > 0) {
        this.reticle.position.set(intersects[0].point.x, intersects[0].point.y + 0.05, intersects[0].point.z);
        return;
      }
    }

    // Fallback to ground plane y=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, target)) {
      this.reticle.position.set(target.x, target.y + 0.05, target.z);
    }
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button === 0) {
      this.isDragging = true;
      try {
        this.canvas.setPointerCapture?.(event.pointerId);
      } catch {}
      this.updatePosition(event);
    } else if (event.button === 2) {
      this.isDragging = false;
      try {
        this.canvas.releasePointerCapture?.(event.pointerId);
      } catch {}
      this.onDismiss?.();
    }
  }

  private onPointerMove(event: PointerEvent) {
    this.updatePosition(event);
    if (this.isDragging && event.shiftKey) {
      this.updateRadius(this.radius + event.movementY * -0.5);
    }
  }

  private async onPointerUp(event: PointerEvent) {
    if (event.button === 0 && this.isDragging) {
      this.isDragging = false;
      try {
        this.canvas.releasePointerCapture?.(event.pointerId);
      } catch {}
      this.updatePosition(event);
      await this.confirmSelection();
    }
  }

  private onPointerCancel(event: PointerEvent) {
    this.isDragging = false;
    try {
      this.canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    // In standard DOM wheel events, deltaY < 0 is scroll up (expand brush), deltaY > 0 is scroll down (shrink brush)
    this.updateRadius(this.radius - Math.sign(event.deltaY) * 2.5);

    // Debounce confirmSelection to prevent flooding IPC and notifications while scrolling
    if (this.wheelDebounceTimer) {
      clearTimeout(this.wheelDebounceTimer);
    }
    this.wheelDebounceTimer = setTimeout(() => {
      this.confirmSelection();
    }, 150);
  }

  private async confirmSelection() {
    if (this.isDisposed) return;
    const cx = this.reticle.position.x;
    const cz = this.reticle.position.z;
    const r = this.radius;
    const sessionId = useOrchestratorStore.getState().currentSessionId || 'default-session';

    try {
      let nodes: Array<{ id: string; type: string; attrs: Record<string, unknown>; x: number; z: number }> = [];
      try {
        const result = await transport.call<{ nodes: typeof nodes }>(
          IPC_CHANNELS.GRAPH_QUERY_RADIUS,
          { sessionId, x: cx, z: cz, radius: r }
        );
        if (this.isDisposed) return;
        if (result?.success && Array.isArray(result.data?.nodes)) {
          nodes = result.data.nodes;
        }
      } catch (ipcErr) {
        console.warn('[CircleSelect] IPC radius query unavailable, falling back to local scene entities:', ipcErr);
      }

      if (this.isDisposed) return;

      const regionSet = new Set<string>();
      const npcSet = new Set<string>();
      const landmarkSet = new Set<string>();
      const questSet = new Set<string>();

      const regions: string[] = [];
      const npcs: string[] = [];
      const landmarks: string[] = [];
      const activeQuests: string[] = [];

      for (const node of nodes) {
        const t = (node.type || '').toLowerCase();
        if (t.includes('region')) {
          if (!regionSet.has(node.id)) { regionSet.add(node.id); regions.push(node.id); }
        } else if (t.includes('npc') || t.includes('character')) {
          if (!npcSet.has(node.id)) { npcSet.add(node.id); npcs.push(node.id); }
        } else if (t.includes('landmark')) {
          if (!landmarkSet.has(node.id)) { landmarkSet.add(node.id); landmarks.push(node.id); }
        } else if (t.includes('quest')) {
          if (!questSet.has(node.id)) { questSet.add(node.id); activeQuests.push(node.id); }
        }
      }

      // Also inspect local sceneGraph for any entities within radius (e.g. loaded world, inserted Polyfork assets, or presets)
      const currentScene = useWorldStore.getState().sceneGraph;
      if (currentScene) {
        if (currentScene.characters) {
          for (const char of currentScene.characters) {
            if (!char.position || char.position.length < 3) continue;
            const dx = char.position[0] - cx;
            const dz = char.position[2] - cz;
            if (dx * dx + dz * dz <= r * r && !npcSet.has(char.id)) {
              npcSet.add(char.id);
              npcs.push(char.id);
            }
          }
        }
        if (currentScene.objects) {
          for (const obj of currentScene.objects) {
            if (!obj.position || obj.position.length < 3) continue;
            const dx = obj.position[0] - cx;
            const dz = obj.position[2] - cz;
            if (dx * dx + dz * dz <= r * r && !landmarkSet.has(obj.id)) {
              landmarkSet.add(obj.id);
              landmarks.push(obj.id);
            }
          }
        }
        if (currentScene.zones) {
          for (const zone of currentScene.zones) {
            if (!zone.bounds?.center || zone.bounds.center.length < 3) continue;
            const dx = zone.bounds.center[0] - cx;
            const dz = zone.bounds.center[2] - cz;
            const zoneRad = zone.bounds.radius || 10;
            if (dx * dx + dz * dz <= Math.pow(r + zoneRad, 2) && !regionSet.has(zone.id)) {
              regionSet.add(zone.id);
              regions.push(zone.id);
            }
          }
        }
      }

      // Also inspect live 3D scene meshes for any active or moved entities (e.g. patrolling NPCs, transformed props)
      const livePos = new THREE.Vector3();
      this.scene.traverse((obj) => {
        const u = obj.userData;
        if (!u) return;
        const isNpc = u.isNPC || u.type === 'npc' || (obj.name && obj.name.toLowerCase().includes('npc'));
        const isObj = u.type === 'landmark' || u.type === 'prop' || u.type === 'item' || Boolean(u.assetId);

        if (isNpc || isObj) {
          obj.getWorldPosition(livePos);
          const dx = livePos.x - cx;
          const dz = livePos.z - cz;
          if (dx * dx + dz * dz <= r * r) {
            const entId = u.id || obj.name || obj.uuid;
            if (isNpc && !npcSet.has(entId)) {
              npcSet.add(entId);
              npcs.push(entId);
            } else if (isObj && !landmarkSet.has(entId)) {
              landmarkSet.add(entId);
              landmarks.push(entId);
            }
          }
        }
      });

      if (!useOrchestratorStore.getState().currentSessionId) {
        useOrchestratorStore.setState({ currentSessionId: sessionId });
      }

      const totalCount = regions.length + npcs.length + landmarks.length + activeQuests.length;

      const selectionContext: SelectionContext = {
        center: { x: cx, z: cz },
        radiusWorldUnits: r,
        regions,
        npcs,
        landmarks,
        activeQuests,
        biome: this.activeBiome,
      };

      if (this.isDisposed) return;

      useOrchestratorStore.getState().setActiveSelection(selectionContext);
      AudioManager.getInstance().playSelect();

      const uiStore = useUIStore.getState();
      if (uiStore.showNotification) {
        uiStore.showNotification(`Area selected: R=${r.toFixed(1)}m, ${totalCount} entities`, 3000, 'info');
      }
    } catch (err) {
      console.error('Circle selection error:', err);
    }
  }

  public dispose() {
    this.isDisposed = true;
    if (this.wheelDebounceTimer) {
      clearTimeout(this.wheelDebounceTimer);
      this.wheelDebounceTimer = null;
    }
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancelBound);
    this.canvas.removeEventListener('wheel', this.onWheelBound);
    this.canvas.removeEventListener('contextmenu', this.onContextMenuBound);

    this.scene.remove(this.reticle);
    this.reticle.children.forEach((child) => {
      const m = child as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else m.material.dispose();
      }
    });
  }
}
