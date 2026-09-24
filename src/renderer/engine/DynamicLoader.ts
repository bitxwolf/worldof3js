import * as THREE from 'three';
import type { AssetMap } from './assets/ProceduralAssetLibrary';
import { SceneBuildError } from '../../shared/errors';
import { loadFallbackScene } from './EngineDefaults';

/**
 * Executes LLM-generated Three.js code inside a sandboxed `new Function()` scope.
 * The generated code body receives only (scene, THREE, assets) — no access
 * to module globals, window, or the node environment.
 *
 * On failure, the caller is responsible for loading a fallback scene.
 */
export async function executeBuildScene(
  code: string,
  scene: THREE.Scene,
  assets: AssetMap,
): Promise<void> {
  let fn: (s: THREE.Scene, T: typeof THREE, a: AssetMap) => void;

  // Step 1: Compile — catches syntax errors before execution
  try {
    fn = new Function(
      'scene',
      'THREE',
      'assets',
      `"use strict";\n${code}`
    ) as typeof fn;
  } catch (err) {
    const msg =
      err instanceof SyntaxError
        ? `Syntax error in generated scene code: ${err.message}`
        : `Failed to compile generated code: ${String(err)}`;
    console.error('[DynamicLoader] Compile error:', err);
    loadFallbackScene(scene);
    throw new SceneBuildError(msg, code);
  }

  // Step 2: Execute — catches runtime errors
  try {
    fn(scene, THREE, assets);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DynamicLoader] Runtime error in generated scene:', err);
    loadFallbackScene(scene);
    throw new SceneBuildError(`Scene build failed: ${msg}`, code);
  }
}

// Re-export for backward compat — actual implementation now in EngineDefaults
export { loadFallbackScene } from './EngineDefaults';
