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

/**
 * Dangerous identifiers that LLM-generated scene code must never reference.
 * Each entry is tested with word-boundary regex to avoid false positives
 * (e.g. "documents" won't match "document").
 *
 * IMPORTANT: Patterns also cover prototype-chain traversal and bracket-notation
 * indirection that bypass simple identifier shadowing.
 */
const BLOCKED_IDENTIFIERS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  // ── Global scope escape ────────────────────────────────────────────────
  { pattern: /\bwindow\b/, label: 'window' },
  { pattern: /\bdocument\b/, label: 'document' },
  { pattern: /\bglobalThis\b/, label: 'globalThis' },
  { pattern: /\bself\b(?!\s*[.]\s*(?:position|rotation|scale|matrix|quaternion|up|visible))/, label: 'self (global)' },
  // ── Code generation / eval ─────────────────────────────────────────────
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /\bFunction\s*\(/, label: 'Function()' },
  { pattern: /\bsetTimeout\s*\(/, label: 'setTimeout()' },
  { pattern: /\bsetInterval\s*\(/, label: 'setInterval()' },
  // ── Constructor chain traversal (primary sandbox escape vector) ─────
  // Blocks: [].constructor.constructor('return this')()
  //         obj.__proto__.constructor.constructor(...)
  //         Object.getPrototypeOf(x).constructor(...)
  { pattern: /\.constructor\b/, label: '.constructor (prototype chain escape)' },
  { pattern: /\b__proto__\b/, label: '__proto__ (prototype traversal)' },
  { pattern: /\bprototype\b/, label: 'prototype (prototype access)' },
  { pattern: /\bgetPrototypeOf\b/, label: 'getPrototypeOf (prototype traversal)' },
  { pattern: /\bReflect\b/, label: 'Reflect (meta-programming)' },
  { pattern: /\bProxy\b/, label: 'Proxy (meta-programming)' },
  // ── Bracket notation indirection (bypasses identifier checks) ──────
  // Blocks: obj['constructor'], obj['__proto__'], this['window']
  { pattern: /\[\s*['"`](?:constructor|__proto__|prototype|window|document|globalThis|electronAPI|eval|Function|fetch|process|require|ipcRenderer|localStorage|sessionStorage|XMLHttpRequest|WebSocket|importScripts)\b/, label: 'bracket notation access to dangerous property' },
  // ── IPC / Electron bridge ──────────────────────────────────────────────
  { pattern: /\belectronAPI\b/, label: 'electronAPI' },
  { pattern: /\bipcRenderer\b/, label: 'ipcRenderer' },
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  // ── Network access ─────────────────────────────────────────────────────
  { pattern: /\bfetch\s*\(/, label: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, label: 'WebSocket' },
  { pattern: /\bimportScripts\b/, label: 'importScripts' },
  // ── Module system ──────────────────────────────────────────────────────
  { pattern: /\bimport\s+/, label: 'import statement' },
  { pattern: /\bimport\s*\(/, label: 'dynamic import()' },
  // ── Storage / cookies ──────────────────────────────────────────────────
  { pattern: /\blocalStorage\b/, label: 'localStorage' },
  { pattern: /\bsessionStorage\b/, label: 'sessionStorage' },
  { pattern: /\bcookie\b/, label: 'cookie' },
];

/** Smoke-test validation before executing generated code — security hardened. */
export function validateGeneratedCode(code: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Basic structure checks
  if (code.length < 50) warnings.push('Code suspiciously short (<50 chars)');
  if (!code.includes('scene.add') && !code.includes('assets.helpers') && !code.includes('scene.')) {
    warnings.push('Code adds nothing to scene — no scene.add() or assets.helpers calls found');
  }
  if (code.includes('```')) {
    warnings.push('Code contains markdown backticks — strip them before execution');
  }

  // Strip string literals and comments to avoid false positives on blocked patterns
  const codeWithoutStrings = code
    .replace(/\/\/.*$/gm, '')           // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // multi-line comments
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')  // single-quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')  // double-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, '""'); // template literals

  // Security: block dangerous identifiers
  for (const { pattern, label } of BLOCKED_IDENTIFIERS) {
    if (pattern.test(codeWithoutStrings)) {
      warnings.push(`BLOCKED: Code references disallowed identifier "${label}" — potential security violation`);
    }
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

  // Hard-reject code that references blocked identifiers (security)
  const blocked = validation.warnings.filter(w => w.startsWith('BLOCKED:'));
  if (blocked.length > 0) {
    console.error('[DynamicLoader] Security: code rejected for blocked identifiers:', blocked);
    loadFallbackScene(scene);
    throw new SceneBuildError(
      `Generated code blocked for security: ${blocked.join('; ')}`,
      cleanCode
    );
  }

  // Count before
  const childCountBefore = scene.children.length;
  const trisBefore = countTriangles(scene);

  let fn: (s: THREE.Scene, T: typeof THREE, a: AssetMap) => void;

  // Step 1: Compile — shadow dangerous globals so they are undefined inside the sandbox
  try {
    fn = new Function(
      'scene',
      'THREE',
      'assets',
      // Shadow dangerous globals AND prototype-chain escape vectors.
      // 'constructor' and '__proto__' are shadowed to block
      // [].constructor.constructor('return this')() and similar chains.
      // The code is wrapped in an IIFE with null 'this' to prevent
      // 'this' from referencing the global scope.
      `"use strict";
var window = undefined, document = undefined, globalThis = undefined,
    self = undefined, top = undefined, parent = undefined, frames = undefined,
    navigator = undefined, location = undefined,
    fetch = undefined, XMLHttpRequest = undefined, WebSocket = undefined,
    eval = undefined, Function = undefined,
    setTimeout = undefined, setInterval = undefined,
    importScripts = undefined, require = undefined, process = undefined,
    localStorage = undefined, sessionStorage = undefined,
    constructor = undefined, Reflect = undefined, Proxy = undefined;
${cleanCode}`
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
  // Call with .call(null, ...) so 'this' inside the function is null (strict mode)
  // instead of the global object, preventing 'this'-based scope escape.
  try {
    fn.call(null, scene, THREE, assets);
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
