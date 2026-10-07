import * as THREE from 'three';
import { PRESET_CATALOG, type RawPresetData } from './presetData';
import { buildPreset3DObject, type PresetSpawnOptions } from './PresetConverter';
import type { ResourceRegistry } from '../ResourceRegistry';

export class PresetRegistry {
  private readonly catalog = new Map<string, RawPresetData>();
  private readonly activeInstances = new Set<THREE.Group>();
  private resourceRegistry?: ResourceRegistry;

  constructor(resourceRegistry?: ResourceRegistry) {
    this.resourceRegistry = resourceRegistry;
    for (const item of PRESET_CATALOG) {
      this.catalog.set(item.id, item);
    }
  }

  setResourceRegistry(registry: ResourceRegistry): void {
    this.resourceRegistry = registry;
  }

  hasPreset(id: string): boolean {
    return this.catalog.has(id);
  }

  getPresetData(id: string): RawPresetData | undefined {
    return this.catalog.get(id);
  }

  listPresets(category?: string): RawPresetData[] {
    const all = Array.from(this.catalog.values());
    if (!category) return all;
    return all.filter((p) => p.category.toLowerCase() === category.toLowerCase() || p.type.toLowerCase() === category.toLowerCase());
  }

  /**
   * Spawns a high-fidelity 3D preset instance ready for addition to any Three.js scene.
   */
  spawn(id: string, options?: PresetSpawnOptions): THREE.Group {
    const data = this.catalog.get(id);
    if (!data) {
      console.warn(`[PresetRegistry] Preset "${id}" not found in catalog, using first available NPC or fallback`);
      const fallbackData = Array.from(this.catalog.values())[0];
      if (fallbackData) {
        return this.spawn(fallbackData.id, options);
      }
      throw new Error(`[PresetRegistry] No presets registered in catalog`);
    }

    const mergedOptions: PresetSpawnOptions = {
      registry: options?.registry || this.resourceRegistry,
      ...options,
    };

    const obj = buildPreset3DObject(data, mergedOptions);
    this.activeInstances.add(obj);
    return obj;
  }

  /**
   * Disposes a spawned preset instance and frees all underlying GPU resources.
   */
  disposeInstance(group: THREE.Group): void {
    if (!this.activeInstances.has(group)) return;
    this.activeInstances.delete(group);

    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            m.dispose();
            const texKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'];
            for (const k of texKeys) {
              const tex = (m as unknown as Record<string, unknown>)[k];
              if (tex && typeof tex === 'object' && 'dispose' in tex) {
                (tex as { dispose: () => void }).dispose();
              }
            }
          });
        }
      }
    });

    if (group.parent) {
      group.parent.remove(group);
    }
  }

  /**
   * Cleans up all active preset instances.
   */
  disposeAll(): void {
    for (const inst of Array.from(this.activeInstances)) {
      this.disposeInstance(inst);
    }
    this.activeInstances.clear();
  }
}

export const presetRegistry = new PresetRegistry();
