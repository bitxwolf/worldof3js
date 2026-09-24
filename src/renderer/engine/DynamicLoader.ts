import * as THREE from 'three';
import type { AssetMap } from './assets/ProceduralAssetLibrary';
import { SceneBuildError } from '../../shared/errors';
import { loadFallbackScene } from './EngineDefaults';

// ── Code Validation (Points 23-24) ───────────────────────────────────────────

/** Strip markdown fences that LLMs sometimes wrap around generated code. */
export function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:javascript|js|typescript|ts)?\s*/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();
}

/** Auto-fix common LLM code generation mistakes. */
function autoFixCode(code: string): string {
  let fixed = stripCodeFences(code);
  // Strip wrapping function declaration if present
  const wrapperMatch = fixed.match(/^(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/);
  if (wrapperMatch) {
    fixed = wrapperMatch[1].trim();
  }
  return fixed;
}

/** Smoke-test validation before executing generated code. */
export function validateGeneratedCode(code: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (code.length < 50) warnings.push('Code suspiciously short (<50 chars)');
  if (!code.includes('scene.add') && !code.includes('assets.helpers') && !code.includes('scene.')) {
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

// ── Triangle Counter ─────────────────────────────────────────────────────────

function countTriangles(scene: THREE.Scene): number {
  let tris = 0;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry) {
      const idx = o.geometry.index;
      const pos = o.geometry.attributes.position;
      if (idx) {
        tris += idx.count / 3;
      } else if (pos) {
        tris += pos.count / 3;
      }
    }
  });
  return Math.round(tris);
}

// ── Result type ──────────────────────────────────────────────────────────────

export interface BuildSceneResult {
  trianglesAdded: number;
  objectsAdded: number;
  warnings: string[];
}

// ── Main executor ────────────────────────────────────────────────────────────

/**
 * Executes LLM-generated Three.js code inside a sandboxed `new Function()` scope.
 * The generated code body receives only (scene, THREE, assets) — no access
 * to module globals, window, or the node environment.
 *
 * Returns triangle delta and object count for the debug panel.
 * On failure, loads a fallback scene.
 */
export async function executeBuildScene(
  code: string,
  scene: THREE.Scene,
  assets: AssetMap,
): Promise<BuildSceneResult> {
  const warnings: string[] = [];

  // Step 0: Auto-fix common issues (strip markdown, wrapper functions)
  let cleanCode = autoFixCode(code);
  const validation = validateGeneratedCode(cleanCode);
  if (!validation.valid) {
    warnings.push(...validation.warnings);
    console.warn('[DynamicLoader] Code validation warnings:', validation.warnings);
  }

  // Count before
  const childCountBefore = scene.children.length;
  const trisBefore = countTriangles(scene);

  let fn: (s: THREE.Scene, T: typeof THREE, a: AssetMap) => void;

  // Step 1: Compile — catches syntax errors before execution
  try {
    fn = new Function(
      'scene',
      'THREE',
      'assets',
      `"use strict";\n${cleanCode}`
    ) as typeof fn;
  } catch (err) {
    const msg =
      err instanceof SyntaxError
        ? `Syntax error in generated scene code: ${err.message}`
        : `Failed to compile generated code: ${String(err)}`;
    console.error('[DynamicLoader] Compile error:', err);
    console.error('[DynamicLoader] Code that failed (first 300 chars):', cleanCode.slice(0, 300));
    loadFallbackScene(scene);
    throw new SceneBuildError(msg, cleanCode);
  }

  // Step 2: Execute — catches runtime errors
  try {
    fn(scene, THREE, assets);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DynamicLoader] Runtime error in generated scene:', err);
    console.error('[DynamicLoader] Code that failed (first 300 chars):', cleanCode.slice(0, 300));
    loadFallbackScene(scene);
    throw new SceneBuildError(`Scene build failed: ${msg}`, cleanCode);
  }

  // Step 3: Count after and report delta
  const trisAfter = countTriangles(scene);
  const trianglesAdded = trisAfter - trisBefore;
  const objectsAdded = scene.children.length - childCountBefore;

  console.info(`[DynamicLoader] ✓ Generated: +${trianglesAdded} tris, +${objectsAdded} objects`);

  if (trianglesAdded === 0) {
    const warnMsg = 'Zero triangles added. Generated code may have used unsupported patterns.';
    warnings.push(warnMsg);
    console.warn(`[DynamicLoader] ⚠ ${warnMsg}`);
    console.warn('[DynamicLoader] Full generated code:\n', cleanCode);
  }

  return { trianglesAdded, objectsAdded, warnings };
}

// Re-export for backward compat — actual implementation now in EngineDefaults
export { loadFallbackScene } from './EngineDefaults';
