import * as THREE from 'three';
import type { AssetMap } from './assets/ProceduralAssetLibrary';

// ── Types ────────────────────────────────────────────────────────────────────
export interface EditOperation {
  type: 'sky' | 'fog' | 'material_sweep' | 'code_inject' | 'object_scale' | 'object_remove';
  description: string;
  color?: number;
  density?: number;
  selector?: string;
  materialChanges?: {
    color?: number;
    emissive?: number;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
  };
  code?: string;
  objectId?: string;
  scale?: [number, number, number];
}

export interface EditPlan {
  description: string;
  confidence: number;
  operations: EditOperation[];
  regenerateRequired: boolean;
}

export interface EditHistoryEntry {
  timestamp: number;
  instruction: string;
  plan: EditPlan;
  undoOps: EditOperation[];
}

// ── Apply Edit Plan ──────────────────────────────────────────────────────────
export function applyEditPlan(
  plan: EditPlan,
  scene: THREE.Scene,
  assets: AssetMap,
): { applied: number; failed: number } {
  let applied = 0;
  let failed = 0;

  for (const op of plan.operations) {
    try {
      switch (op.type) {
        case 'sky':
          if (op.color !== undefined) {
            scene.background = new THREE.Color(op.color);
            if (scene.fog instanceof THREE.FogExp2) {
              scene.fog.color = new THREE.Color(op.color);
            }
          }
          break;

        case 'fog':
          if (scene.fog instanceof THREE.FogExp2) {
            if (op.color !== undefined) scene.fog.color = new THREE.Color(op.color);
            if (op.density !== undefined) scene.fog.density = op.density;
          }
          break;

        case 'material_sweep':
          scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            try {
              const userData = obj.userData;
              const match = new Function('userData', `return !!(${op.selector ?? 'false'})`)(userData) as boolean;
              if (!match) return;
            } catch { return; }

            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (!(m instanceof THREE.MeshStandardMaterial)) return;
              if (op.materialChanges?.color !== undefined) m.color.setHex(op.materialChanges.color);
              if (op.materialChanges?.emissive !== undefined) m.emissive.setHex(op.materialChanges.emissive);
              if (op.materialChanges?.emissiveIntensity !== undefined) m.emissiveIntensity = op.materialChanges.emissiveIntensity;
              if (op.materialChanges?.roughness !== undefined) m.roughness = op.materialChanges.roughness;
              if (op.materialChanges?.metalness !== undefined) m.metalness = op.materialChanges.metalness;
              m.needsUpdate = true;
            });
          });
          break;

        case 'code_inject':
          if (op.code) {
            const fn = new Function('scene', 'THREE', 'assets', `"use strict";\n${op.code}`);
            fn(scene, THREE, assets);
          }
          break;

        case 'object_scale':
          if (op.objectId && op.scale) {
            scene.traverse((obj) => {
              if (obj.userData?.id === op.objectId) {
                obj.scale.set(op.scale![0], op.scale![1], op.scale![2]);
              }
            });
          }
          break;

        case 'object_remove':
          if (op.objectId) {
            const toRemove: THREE.Object3D[] = [];
            scene.traverse((obj) => {
              if (obj.userData?.id === op.objectId) toRemove.push(obj);
            });
            toRemove.forEach((obj) => {
              obj.parent?.remove(obj);
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.geometry?.dispose();
                  if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                  } else {
                    child.material?.dispose();
                  }
                }
              });
            });
          }
          break;
      }
      applied++;
      console.info(`[SmartEdit] Applied: ${op.type} — ${op.description}`);
    } catch (err) {
      failed++;
      console.error(`[SmartEdit] Failed op ${op.type}:`, err);
    }
  }

  return { applied, failed };
}

// ── Capture Viewport ─────────────────────────────────────────────────────────
export function captureViewport(canvas: HTMLCanvasElement, quality = 0.8): string {
  return canvas.toDataURL('image/jpeg', quality);
}

// ── Validate Edit Plan JSON ──────────────────────────────────────────────────
export function parseEditPlanResponse(raw: string): EditPlan | null {
  try {
    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/gm, '')
      .replace(/^```\s*$/gm, '')
      .trim();
    const parsed = JSON.parse(cleaned) as EditPlan;
    if (!parsed.operations || !Array.isArray(parsed.operations)) return null;
    return parsed;
  } catch {
    console.error('[SmartEdit] Failed to parse edit plan:', raw.slice(0, 200));
    return null;
  }
}

// ── Code Validation (Points 23-24) ───────────────────────────────────────────
export function validateGeneratedCode(code: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (code.length < 50) warnings.push('Code suspiciously short (<50 chars)');
  if (!code.includes('scene.add') && !code.includes('assets.helpers')) {
    warnings.push('Code adds nothing to scene — no scene.add() or assets.helpers calls found');
  }
  if (code.includes('import ') || code.includes('require(')) {
    warnings.push('Code contains import/require — will fail in new Function() context');
  }
  if (code.includes('```')) {
    warnings.push('Code contains markdown backticks — strip them before execution');
  }
  return { valid: warnings.length === 0, warnings };
}

// ── Strip markdown fences from generated code (Point 29) ─────────────────────
export function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:javascript|js|typescript|ts)?\s*/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();
}
