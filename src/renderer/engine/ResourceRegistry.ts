import * as THREE from 'three';

/**
 * Tracks every disposable Three.js GPU resource.
 * Call disposeAll() before scene teardown to prevent VRAM leaks.
 */
export class ResourceRegistry {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly renderTargets = new Set<THREE.WebGLRenderTarget>();

  trackGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
    this.geometries.add(g);
    return g;
  }

  trackMaterial(m: THREE.Material): THREE.Material {
    this.materials.add(m);
    return m;
  }

  trackTexture(t: THREE.Texture): THREE.Texture {
    this.textures.add(t);
    return t;
  }

  trackRenderTarget(rt: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
    this.renderTargets.add(rt);
    return rt;
  }

  /** Track all disposable sub-resources inside an Object3D tree. */
  trackObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) this.geometries.add(child.geometry);
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => this.materials.add(m));
        } else if (child.material) {
          this.materials.add(child.material);
        }
      }
    });
  }

  /** Dispose every tracked resource and clear all sets. */
  disposeAll(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.renderTargets.forEach((rt) => rt.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.renderTargets.clear();
    console.debug('[ResourceRegistry] All GPU resources disposed');
  }

  get stats(): { geometries: number; materials: number; textures: number } {
    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      textures: this.textures.size,
    };
  }
}
