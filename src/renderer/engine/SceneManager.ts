import * as THREE from 'three';
import { ResourceRegistry } from './ResourceRegistry';

/**
 * Owns the WebGLRenderer, Scene, PerspectiveCamera, and the animation loop.
 * All Three.js objects must go through add()/remove() so the ResourceRegistry
 * can track them for leak-free disposal.
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  readonly clock = new THREE.Clock();
  private renderer!: THREE.WebGLRenderer;
  private registry = new ResourceRegistry();
  private rafId = 0;
  private resizeObserver!: ResizeObserver;
  private onFrameCallbacks: Array<(delta: number) => void> = [];
  private _disposed = false;

  // ── Initialisation ──────────────────────────────────────────────────────────
  init(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera.position.set(0, 1.7, 5);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();

    this._disposed = false;
    this.startLoop();
  }

  // ── Animation loop ──────────────────────────────────────────────────────────
  private startLoop(): void {
    const loop = (): void => {
      // Stop immediately if canvas has been removed from DOM or manager disposed
      if (this._disposed || !this.renderer.domElement.isConnected) return;

      this.rafId = requestAnimationFrame(loop);
      const delta = this.clock.getDelta();
      for (const cb of this.onFrameCallbacks) {
        cb(delta);
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame(callback: (delta: number) => void): () => void {
    this.onFrameCallbacks.push(callback);
    return () => {
      this.onFrameCallbacks = this.onFrameCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ── Scene management ────────────────────────────────────────────────────────

  /** Add an Object3D and register all its GPU sub-resources for tracking. */
  add(object: THREE.Object3D): void {
    this.scene.add(object);
    this.registry.trackObject(object);
  }

  /** Remove a specific object and immediately dispose its GPU resources. */
  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        
        const disposeMaterial = (m: THREE.Material) => {
          m.dispose();
          for (const key of [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 
            'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap', 
            'envMap', 'lightMap', 'specularMap'
          ]) {
            const val = (m as unknown as Record<string, unknown>)[key];
            if (val && typeof val === 'object' && 'isTexture' in val && (val as { isTexture: boolean }).isTexture) {
              (val as THREE.Texture).dispose();
            }
          }
        };

        if (Array.isArray(child.material)) {
          child.material.forEach(disposeMaterial);
        } else if (child.material) {
          disposeMaterial(child.material);
        }
      }
    });
  }

  /** Nuke the entire scene — called before loading a new world. */
  clearScene(): void {
    while (this.scene.children.length > 0) {
      this.remove(this.scene.children[0]);
    }
    // Dispose everything tracked in registry (catches anything missed above)
    this.registry.disposeAll();
    // Reset scene properties
    this.scene.fog = null;
    this.scene.background = null;
    this.scene.environment = null;
    console.debug('[SceneManager] Scene cleared. Registry:', this.registry.stats);
  }

  // ── Resize ──────────────────────────────────────────────────────────────────
  private handleResize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  dispose(): void {
    this._disposed = true;
    cancelAnimationFrame(this.rafId);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.onFrameCallbacks = [];
    this.clearScene();
    this.renderer.dispose();
    console.debug('[SceneManager] Fully disposed');
  }

  /** Expose the canvas DOM element (e.g. for PointerLockControls). */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }
}
