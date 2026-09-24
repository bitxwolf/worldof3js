import * as THREE from 'three';
import type { ProceduralAssetLibrary } from './assets/ProceduralAssetLibrary';

/**
 * Cache for pre-loaded textures and other assets.
 * Passed into LLM-generated buildScene code as the `assets` parameter.
 */
export interface AssetMap {
  textures: Map<string, THREE.Texture>;
  helpers?: ProceduralAssetLibrary;
}

export class AssetRegistry {
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly loader = new THREE.TextureLoader();

  /** Load a texture by URL/path and cache it under a key. */
  async loadTexture(key: string, url: string): Promise<THREE.Texture> {
    const existing = this.textures.get(key);
    if (existing) return existing;

    return new Promise<THREE.Texture>((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          this.textures.set(key, texture);
          resolve(texture);
        },
        undefined,
        (err) => {
          console.error(`[AssetRegistry] Failed to load texture "${key}":`, err);
          reject(err);
        }
      );
    });
  }

  /** Get the current asset map for injection into generated code. */
  getAssetMap(): AssetMap {
    return {
      textures: new Map(this.textures),
    };
  }

  /** Dispose all cached textures. */
  disposeAll(): void {
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
    console.debug('[AssetRegistry] All cached assets disposed');
  }
}
