import * as THREE from 'three';
import { useOrchestratorStore } from '../../store/orchestratorStore';
import { useUIStore } from '../../store/uiStore';
import type { ViewportBiomeType } from '../../../shared/agents/agentTypes';
import type { SelectionContext } from '../../../shared/agents/agentTypes';
import { transport } from '../../../shared/transport';
import { IPC_CHANNELS } from '../../../shared/constants';

export class CircleSelectTool {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private canvas: HTMLCanvasElement;
  private reticle: THREE.Group;
  private radius: number = 25;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private onPointerDownBound = this.onPointerDown.bind(this);
  private onPointerMoveBound = this.onPointerMove.bind(this);
  private onPointerUpBound = this.onPointerUp.bind(this);
  private onWheelBound = this.onWheel.bind(this);

  private activeBiome: ViewportBiomeType = 'pine';
  private terrainMesh: THREE.Mesh | null = null;
  private isDragging: boolean = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    terrainMesh: THREE.Mesh | null,
    activeBiome: ViewportBiomeType
  ) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.terrainMesh = terrainMesh;
    this.activeBiome = activeBiome;

    // Create Reticle
    this.reticle = new THREE.Group();
    this.reticle.position.y = 0.05; // Prevent z-fighting
    this.reticle.rotation.x = -Math.PI / 2;

    // Translucent filled circle
    const fillGeo = new THREE.CircleGeometry(1, 64);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    this.reticle.add(fillMesh);

    // Outline ring
    const outlineGeo = new THREE.RingGeometry(0.96, 1, 64);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
    this.reticle.add(outlineMesh);

    this.updateRadius(this.radius);
    this.scene.add(this.reticle);

    // Attach listeners
    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('wheel', this.onWheelBound, { passive: false });
  }

  private updateRadius(r: number) {
    this.radius = THREE.MathUtils.clamp(r, 5, 100);
    this.reticle.scale.set(this.radius, this.radius, 1);
  }

  private updatePosition(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.terrainMesh) {
      const intersects = this.raycaster.intersectObject(this.terrainMesh);
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
      this.updatePosition(event);
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
      this.updatePosition(event);
      await this.confirmSelection();
    }
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    this.updateRadius(this.radius + event.deltaY * 0.05);
  }

  private async confirmSelection() {
    const cx = this.reticle.position.x;
    const cz = this.reticle.position.z;
    const r = this.radius;

    try {
      const sessionId = useOrchestratorStore.getState().currentSessionId || 'default-session';
      const result = await transport.call<{ nodes: Array<{ id: string; type: string; attrs: Record<string, unknown>; x: number; z: number }> }>(
        IPC_CHANNELS.GRAPH_QUERY_RADIUS,
        { sessionId, x: cx, z: cz, radius: r }
      );

      const nodes = (result.success && result.data?.nodes) ? result.data.nodes : [];

      const regions: string[] = [];
      const npcs: string[] = [];
      const landmarks: string[] = [];
      const activeQuests: string[] = [];

      for (const node of nodes) {
        const t = (node.type || '').toLowerCase();
        if (t.includes('region')) {
          regions.push(node.id);
        } else if (t.includes('npc') || t.includes('character')) {
          npcs.push(node.id);
        } else if (t.includes('landmark')) {
          landmarks.push(node.id);
        } else if (t.includes('quest')) {
          activeQuests.push(node.id);
        }
      }

      const selectionContext: SelectionContext = {
        center: { x: cx, z: cz },
        radiusWorldUnits: r,
        regions,
        npcs,
        landmarks,
        activeQuests,
        biome: this.activeBiome,
      };

      useOrchestratorStore.getState().setActiveSelection(selectionContext);

      const uiStore = useUIStore.getState();
      if (uiStore.showNotification) {
        uiStore.showNotification(`Area selected: R=${r.toFixed(1)}m, ${nodes.length} entities`, 3000, 'info');
      }
    } catch (err) {
      console.error('Circle selection error:', err);
    }
  }

  public dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.removeEventListener('wheel', this.onWheelBound);

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
