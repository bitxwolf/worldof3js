# Orbis Codebase Bug Audit & Parallel Subagent Resolution Plan

This document catalogues all 18 known bugs in the Orbis project, classifies them by complexity/model requirement (**Claude Opus** vs. **Gemini 3.8 Flash**), and clusters them by strict **disjoint file boundaries** so they can be dispatched across **parallel subagents** without write collisions.

---

## 1. Model Assignment Criteria

| Model Tier | Rationale / Skill Domain | Assigned Bugs |
|---|---|---|
| **Claude Opus** (`pro`) | Complex 3D Viewport lifecycle, AST / script injection security, SSRF / CIDR network filtering, cross-system event loops. | **Bugs 2, 3, 4, 6, 7, 8, 12, 17** |
| **Gemini 3.8 Flash** (`flash`) | Targeted logic fixes, string validation, timeout wrappers, component modal dismissal, state recalculation, and unit test expansion. | **Bugs 1, 5, 9, 10, 11, 13, 14, 15, 16, 18** |

---

## 2. Complete Bug Catalog (18 Bugs)

### Bug 1: API Key Permanent Overwrite by Masked Strings
- **Files:** `src/main/ipc/app.handler.ts`, `src/renderer/components/Settings/SettingsModal.tsx`, `src/main/services/StoreService.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** `app.handler.ts` masks API keys (`sk-ant-***xxxx`) before sending them across IPC to the renderer. `SettingsModal.tsx` stores these masked strings in component state. When the user saves settings, the masked string is sent back. `StoreService.setSettings` unconditionally writes the masked string to disk via `safeStorage`, destroying the actual API keys and causing 401 Unauthorized errors on subsequent LLM requests.
- **Fix:** In `StoreService.setSettings`, ignore incoming keys containing asterisks (e.g. `if (s.openaiApiKey && !s.openaiApiKey.includes('*')) StoreService.setOpenaiApiKey(s.openaiApiKey);`).

---

### Bug 2: SSRF & Localhost/Metadata Guard Bypass via Direct IP Literals
- **Files:** `src/main/index.ts`
- **Model:** **Claude Opus**
- **Description:** `setupNetworkGuard` attempts to validate URLs using Node's `resolve4(host)`. When an IP literal (such as `127.0.0.1`, `169.254.169.254`, or `[::1]`) is passed, `resolve4` throws `EINVAL`/`ENOTFOUND`. The catch handler falls through with `callback({ cancel: false })`. Direct IP requests bypass the guard, allowing access to local ports and cloud metadata endpoints. IPv6 is also unvalidated.
- **Fix:** Check `net.isIP(host)`. If `net.isIP(host) !== 0`, directly evaluate `isPrivateIP(host)` and cancel if private. Fail-closed on resolution errors for external hosts, and validate IPv6 private ranges (`::1`, `fc00::/7`, `fe80::/10`).

---

### Bug 3: Template Literal Code Injection in Standalone HTML Export
- **Files:** `src/shared/exportHtml.ts`
- **Model:** **Claude Opus**
- **Description:** `validateExportCode` strips template literals using naive regex `.replace(/`([^`\\]|\\.)*`/g, '""')`. This strips the entire template string including any `${...}` interpolation expressions. Malicious JavaScript placed inside an interpolation block bypasses pattern validation but executes when the exported HTML loads.
- **Fix:** Do not strip template strings naively; retain interpolation blocks for regex pattern checks or parse using an AST / tokenized approach to inspect interpolation expressions.

---

### Bug 4: Content Security Policy Violation (`EvalError`) in Standalone HTML Export
- **Files:** `src/shared/exportHtml.ts`
- **Model:** **Claude Opus**
- **Description:** Export HTML Content Security Policy specifies `script-src 'unsafe-inline' https://cdnjs.cloudflare.com;` but omits `'unsafe-eval'`. Line 210 executes `(new Function('scene', 'THREE', 'assets', safeCode))`. For code not wrapped in `function(`, `new Function` throws a fatal CSP `EvalError`, halting scene execution in the browser.
- **Fix:** Replace `new Function` with an IIFE or inline function call: `((scene, THREE, assets) => { ${safeCode} })(scene, THREE, assets);`.

---

### Bug 5: Browser/Serve Mode Generation Broken by Missing Transport Fallback
- **Files:** `src/renderer/components/Viewport/SpotlightPromptBar.tsx`
- **Model:** **Gemini 3.8 Flash**
- **Description:** In web mode (`npm run serve`), `window.electronAPI` is undefined. `SpotlightPromptBar.tsx` checks `if (window.electronAPI?.parseWorld)` without falling back to `transport.parseWorld` and `transport.generateCode`. Execution falls through showing "Generation failed. Check API key in Settings."
- **Fix:** Unify API access with a transport fallback: `const api = window.electronAPI ?? transport;`.

---

### Bug 6: Uncaught TypeError in Browser Mode Smart Edit
- **Files:** `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Model:** **Claude Opus**
- **Description:** `handleSmartEdit` invokes `window.electronAPI.updateWorld(...)` without optional chaining or transport fallback. In browser mode, this throws `TypeError: Cannot read properties of undefined (reading 'updateWorld')`.
- **Fix:** Use `await (window.electronAPI?.updateWorld ? window.electronAPI.updateWorld(...) : transport.updateWorld(...))`.

---

### Bug 7: NPC Conversational Amnesia in Walk Mode
- **Files:** `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Model:** **Claude Opus**
- **Description:** In first-person walk mode, `npcReply` passes `npcId`, `playerMessage`, and `character`, but omits `dialogueHistory`. `ClaudeService.streamNPCReply` receives `undefined`, causing the NPC to lose all conversational memory across successive turns.
- **Fix:** Add `dialogueHistory: useNPCStore.getState().dialogueHistories[activeNPC.id] || []` to the `npcReply` payload.

---

### Bug 8: EventSystem `start_dialogue` Fails to Open Dialogue Box
- **Files:** `src/renderer/engine/EventSystem.ts`, `src/renderer/components/Viewport/ThreeViewport.tsx`, `src/renderer/store/npcStore.ts`
- **Model:** **Claude Opus**
- **Description:** Proximity trigger action `start_dialogue` calls `useNPCStore.getState().setActiveNPC(char)` and exits pointer lock. However, `ThreeViewport.tsx` gates rendering on `{activeNPC && dialogueOpen && <DialogueBox ...>}`. Because `dialogueOpen` is a component-local `useState`, `EventSystem` cannot toggle it, leaving the dialogue box hidden.
- **Fix:** Move `dialogueOpen` into `useNPCStore` (`dialogueOpen: boolean`, `setDialogueOpen: (open: boolean) => void`), or add a subscriber in `ThreeViewport` that sets `dialogueOpen(true)` whenever `activeNPC` becomes non-null.

---

### Bug 9: Document Uploader Fails on Drag-and-Drop and `<input type="file">`
- **Files:** `src/renderer/components/Editor/DocumentUploader.tsx`, `src/main/ipc/file.handler.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** `file.handler.ts` rejects file reads unless `allowedPaths.has(realPath)`, which is only populated via Electron's native `showOpenDialog`. Dragging and dropping a file or selecting via `<input type="file">` fails with "Access to this file path is denied".
- **Fix:** Allow file content to be read in the renderer via `FileReader` (for web/drag-and-drop) or add an IPC method `uploadFileBuffer(buffer, ext)` for dragged and dropped files.

---

### Bug 10: Indefinite Hang in Contour Extraction on Corrupt Image
- **Files:** `src/renderer/engine/assets/img2threejsAdapter.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** `extractContourFromCanvas` lacks a timeout wrapper. If an image has a malformed or stalled data URL where neither `onload` nor `onerror` fires, the returned Promise never settles, permanently hanging procedural avatar generation.
- **Fix:** Add a timeout fallback: `const timer = setTimeout(() => resolve(null), 4000);` and clear it on load/error.

---

### Bug 11: Invalid JSON Hex Notation in World Parser System Prompt
- **Files:** `src/shared/prompts/world-parser.prompt.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** The system prompt instructs LLMs to output hex numbers (`"topColor": 0xRRGGBB`, `fogColor=0x0a1020`). RFC 8259 JSON forbids hex literals. Models reproducing this syntax cause `JSON.parse` to throw `SyntaxError: Unexpected token x in JSON`.
- **Fix:** Update prompt specifications to use valid JSON hex strings: `"topColor": "#RRGGBB"` and `fogColor="#0a1020"`.

---

### Bug 12: Inspector Scale and Rotation Not Synced to 3D Viewport
- **Files:** `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Model:** **Claude Opus**
- **Description:** In the selection sync effect, `selectedObj.position` is updated from `selectedNode.position`, but `rotation` and `scale` are omitted. Modifying rotation or scale in the inspector has no effect on the Three.js mesh.
- **Fix:** Add rotation and scale synchronization:
  ```ts
  if (selectedNode.rotation) selectedObj.rotation.set(selectedNode.rotation[0], selectedNode.rotation[1], selectedNode.rotation[2]);
  if (selectedNode.scale) selectedObj.scale.set(selectedNode.scale[0], selectedNode.scale[1], selectedNode.scale[2]);
  ```

---

### Bug 13: Image Uploader Prematurely Unmounts on Selection
- **Files:** `src/renderer/App.tsx`, `src/renderer/components/Editor/ImageUploader.tsx`
- **Model:** **Gemini 3.8 Flash**
- **Description:** In `App.tsx`, `onImagesChange` calls `setShowImgUploader(false)` as soon as `images.length > 0`. This dismisses the modal immediately upon selecting an image, preventing the user from changing tags (`character`, `scene`, `texture`) or removing images. Reopening resets to empty local state.
- **Fix:** Remove `setShowImgUploader(false)` from `onImagesChange`, provide a dedicated "Done" button, and initialize `ImageUploader` state from `useWorldStore.getState().uploadedImages`.

---

### Bug 14: Inventory Store Index Shift / Out-of-Bounds on `removeItem`
- **Files:** `src/renderer/store/inventoryStore.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** `removeItem` filters `items` by ID, but only resets `selectedSlot` if the removed item was currently selected. If an item at a lower index is removed, the items array shifts left while `selectedSlot` retains its previous numerical index, shifting the selection to an unintended item or pointing out of bounds (`selectedSlot >= items.length`).
- **Fix:** In `removeItem`, recalculate `selectedSlot` to point to the new index of the previously selected item, or reset `selectedSlot: null` if the new length is less than or equal to `selectedSlot`.

---

### Bug 15: Silent Data Loss via Local Storage Quota Limit in World Library
- **Files:** `src/renderer/components/WorldLibrary/WorldLibraryModal.tsx`
- **Model:** **Gemini 3.8 Flash**
- **Description:** `persistSavedWorlds` saves full world JSON payloads along with raw base64 canvas thumbnails into `localStorage`. The ~5MB browser limit is reached after saving 2-3 worlds. The error is silently swallowed (`catch { // ignore quota errors }`), resulting in unnotified data loss on page refresh.
- **Fix:** Downscale or compress thumbnail data URLs, migrate world persistence to IndexedDB, and display an error notification if storage fails.

---

### Bug 16: In-Place Mutation of Preset Defaults in PresetRegistry
- **Files:** `src/renderer/engine/presets/PresetRegistry.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** Preset objects are returned without deep cloning. Viewport transformations and in-place material adjustments mutate the default preset definitions in memory for the remainder of the session.
- **Fix:** Return `structuredClone(preset)` from preset getters.

---

### Bug 17: Streaming IPC Listener Leak on Unmount
- **Files:** `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Model:** **Claude Opus**
- **Description:** If `ThreeViewport` unmounts while an NPC stream is active, `streamCleanupRef.current` is not called in the component cleanup lifecycle, leaving IPC event listeners registered in `preload.ts`.
- **Fix:** Add `return () => { streamCleanupRef.current?.(); };` in the viewport lifecycle effect.

---

### Bug 18: Under-tested Multi-Item Inventory Removal Edge Cases
- **Files:** `tests/eventSystem.test.ts`
- **Model:** **Gemini 3.8 Flash**
- **Description:** The test suite only verifies removing an item when index 0 is selected with a single item present. It lacks tests for removing earlier items when later slots are selected, allowing the out-of-bounds index shift bug to go undetected.
- **Fix:** Add unit tests verifying index stability when removing items at index `0` while slot `2` is selected.

---

## 3. Disjoint Subagent Clustering (Zero File Overlap)

To prevent file collision and git merge conflicts when running in parallel, **any bugs that touch the same file are assigned to the exact same subagent**.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PARALLEL SUBAGENT CLUSTERS                                    │
├──────────────┬──────────────────┬─────────────────┬─────────────────────────────────────────────┤
│ Subagent     │ Model            │ Bugs Assigned   │ Exclusive File Ownership                    │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────────┤
│ Subagent 1   │ Claude Opus      │ 6, 7, 8, 12, 17 │ src/renderer/components/Viewport/           │
│              │                  │                 │   ThreeViewport.tsx                         │
│              │                  │                 │ src/renderer/engine/EventSystem.ts          │
│              │                  │                 │ src/renderer/store/npcStore.ts              │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────────┤
│ Subagent 2   │ Claude Opus      │ 2, 3, 4         │ src/main/index.ts                           │
│              │                  │                 │ src/shared/exportHtml.ts                    │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────────┤
│ Subagent 3   │ Gemini 3.8 Flash │ 1               │ src/main/ipc/app.handler.ts                 │
│              │                  │                 │ src/renderer/components/Settings/           │
│              │                  │                 │   SettingsModal.tsx                         │
│              │                  │                 │ src/main/services/StoreService.ts           │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────────┤
│ Subagent 4   │ Gemini 3.8 Flash │ 5, 9, 13        │ src/renderer/components/Viewport/           │
│              │                  │                 │   SpotlightPromptBar.tsx                    │
│              │                  │                 │ src/renderer/components/Editor/             │
│              │                  │                 │   DocumentUploader.tsx                      │
│              │                  │                 │ src/main/ipc/file.handler.ts                │
│              │                  │                 │ src/renderer/App.tsx                        │
│              │                  │                 │ src/renderer/components/Editor/             │
│              │                  │                 │   ImageUploader.tsx                         │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────────┤
│ Subagent 5   │ Gemini 3.8 Flash │ 10, 11, 16      │ src/renderer/engine/assets/                 │
│              │                  │                 │   img2threejsAdapter.ts                     │
│              │                  │                 │ src/shared/prompts/world-parser.prompt.ts   │
│              │                  │                 │ src/renderer/engine/presets/PresetRegistry.ts│
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────────┤
│ Subagent 6   │ Gemini 3.8 Flash │ 14, 15, 18      │ src/renderer/store/inventoryStore.ts        │
│              │                  │                 │ src/renderer/components/WorldLibrary/       │
│              │                  │                 │   WorldLibraryModal.tsx                     │
│              │                  │                 │ tests/eventSystem.test.ts                   │
└──────────────┴──────────────────┴─────────────────┴─────────────────────────────────────────────┘
```

---

## 4. Subagent Dispatch Commands & Exact Prompts

In the new chat session, prompt the controller agent:

> *"Read `ORBIS_BUG_AUDIT_AND_FIX_PLAN.md` and launch Subagents 1 through 6 concurrently using the exact prompts in Section 4."*

Here are the exact prompts to pass into each subagent invocation:

---

### Prompt for Subagent 1 (Claude Opus)
```markdown
You are Subagent 1 fixing Bugs 6, 7, 8, 12, and 17 in Orbis.
Files you own (TOUCH NO OTHER FILES):
- `src/renderer/components/Viewport/ThreeViewport.tsx`
- `src/renderer/engine/EventSystem.ts`
- `src/renderer/store/npcStore.ts`

Tasks:
1. Bug 6: In ThreeViewport.tsx (handleSmartEdit), replace direct window.electronAPI.updateWorld call with fallback:
   await (window.electronAPI?.updateWorld ? window.electronAPI.updateWorld(...) : transport.updateWorld(...))
2. Bug 7: In ThreeViewport.tsx (around line 2169), ensure npcReply payload includes:
   dialogueHistory: useNPCStore.getState().dialogueHistories[activeNPC.id] || []
3. Bug 8: Move dialogueOpen into useNPCStore (state: dialogueOpen: boolean, action: setDialogueOpen: (open: boolean) => void, default: false). Update EventSystem.ts when action 'start_dialogue' fires to call useNPCStore.getState().setDialogueOpen(true). Update ThreeViewport.tsx to use dialogueOpen from useNPCStore.
4. Bug 12: In ThreeViewport.tsx selection sync effect, add rotation and scale synchronization:
   if (selectedNode.rotation) selectedObj.rotation.set(selectedNode.rotation[0], selectedNode.rotation[1], selectedNode.rotation[2]);
   if (selectedNode.scale) selectedObj.scale.set(selectedNode.scale[0], selectedNode.scale[1], selectedNode.scale[2]);
5. Bug 17: In ThreeViewport.tsx NPC streaming lifecycle effect, add cleanup:
   return () => { streamCleanupRef.current?.(); };

Run `npm run typecheck` to verify your changes.
```

---

### Prompt for Subagent 2 (Claude Opus)
```markdown
You are Subagent 2 fixing Bugs 2, 3, and 4 in Orbis.
Files you own (TOUCH NO OTHER FILES):
- `src/main/index.ts`
- `src/shared/exportHtml.ts`

Tasks:
1. Bug 2 (src/main/index.ts): In setupNetworkGuard:
   - Check if host is an IP literal using `net.isIP(host)`.
   - If `net.isIP(host) !== 0`, immediately test `isPrivateIP(host)` and cancel request if private.
   - For IPv6, check loopback `::1`, link-local `fe80::/10`, and unique local `fc00::/7`.
   - Fail-closed on DNS resolution errors for external hosts.
2. Bug 3 (src/shared/exportHtml.ts): In validateExportCode:
   - Fix naive template literal stripping that deletes ${...} interpolation expressions. Ensure expressions inside ${...} are validated against blocked patterns (eval, fetch, XMLHttpRequest, etc.).
3. Bug 4 (src/shared/exportHtml.ts):
   - Replace `new Function('scene', 'THREE', 'assets', safeCode)` with an IIFE:
     `((scene, THREE, assets) => { ${safeCode} })(scene, THREE, assets);`
   - This eliminates CSP EvalError under `script-src 'unsafe-inline'`.

Run `npm run typecheck` to verify your changes.
```

---

### Prompt for Subagent 3 (Gemini 3.8 Flash)
```markdown
You are Subagent 3 fixing Bug 1 in Orbis.
Files you own (TOUCH NO OTHER FILES):
- `src/main/services/StoreService.ts`
- `src/main/ipc/app.handler.ts`
- `src/renderer/components/Settings/SettingsModal.tsx`

Tasks:
1. Bug 1: In `StoreService.setSettings`:
   - Inspect incoming keys (`apiKey`, `openaiApiKey`, `anthropicApiKey`).
   - If any incoming key contains asterisks (e.g., `s.openaiApiKey?.includes('*')`), DO NOT overwrite the saved key on disk! Only persist when the string contains no asterisks and is non-empty.
   - Ensure `SettingsModal.tsx` and `app.handler.ts` preserve key configuration cleanly without deleting user credentials.

Run `npm run typecheck` to verify your changes.
```

---

### Prompt for Subagent 4 (Gemini 3.8 Flash)
```markdown
You are Subagent 4 fixing Bugs 5, 9, and 13 in Orbis.
Files you own (TOUCH NO OTHER FILES):
- `src/renderer/components/Viewport/SpotlightPromptBar.tsx`
- `src/renderer/components/Editor/DocumentUploader.tsx`
- `src/main/ipc/file.handler.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/Editor/ImageUploader.tsx`

Tasks:
1. Bug 5: In `SpotlightPromptBar.tsx`, use transport fallback when `window.electronAPI?.parseWorld` is undefined (in browser/serve mode). Use `const api = window.electronAPI ?? transport;` so generation works in web mode.
2. Bug 9: In `DocumentUploader.tsx` and `file.handler.ts`:
   - Support drag-and-drop and `<input type="file">` by reading file content using standard browser `FileReader` (readAsText / readAsArrayBuffer) when in browser mode or when IPC path access is restricted.
3. Bug 13: In `App.tsx` and `ImageUploader.tsx`:
   - Remove `setShowImgUploader(false)` from `onImagesChange` so selecting an image does not prematurely unmount the modal.
   - Add a dedicated "Done" button to dismiss the modal.
   - Initialize `ImageUploader` state from `useWorldStore.getState().uploadedImages`.

Run `npm run typecheck` to verify your changes.
```

---

### Prompt for Subagent 5 (Gemini 3.8 Flash)
```markdown
You are Subagent 5 fixing Bugs 10, 11, and 16 in Orbis.
Files you own (TOUCH NO OTHER FILES):
- `src/renderer/engine/assets/img2threejsAdapter.ts`
- `src/shared/prompts/world-parser.prompt.ts`
- `src/renderer/engine/presets/PresetRegistry.ts`

Tasks:
1. Bug 10: In `img2threejsAdapter.ts` (`extractContourFromCanvas`), wrap the image loading promise with a 4-second timeout fallback (`setTimeout(() => resolve(null), 4000)`). Clear timeout on load and error to prevent infinite avatar hang.
2. Bug 11: In `world-parser.prompt.ts`, replace all non-standard JSON hex literals (e.g. `0xRRGGBB` or `0x0a1020`) with valid JSON hex strings (`"#RRGGBB"`, `"#0a1020"`).
3. Bug 16: In `PresetRegistry.ts`, ensure all preset getters return `structuredClone(preset)` so in-place viewport transformations do not mutate default preset objects in memory.

Run `npm run typecheck` to verify your changes.
```

---

### Prompt for Subagent 6 (Gemini 3.8 Flash)
```markdown
You are Subagent 6 fixing Bugs 14, 15, and 18 in Orbis.
Files you own (TOUCH NO OTHER FILES):
- `src/renderer/store/inventoryStore.ts`
- `src/renderer/components/WorldLibrary/WorldLibraryModal.tsx`
- `tests/eventSystem.test.ts` (or add `tests/inventoryStore.test.ts`)

Tasks:
1. Bug 14: In `inventoryStore.ts` (`removeItem`):
   - When an item is removed, recalculate `selectedSlot`.
   - If the removed item was before `selectedSlot`, decrement `selectedSlot`.
   - If the new items length is 0 or `selectedSlot >= newItems.length`, reset `selectedSlot: null`.
2. Bug 15: In `WorldLibraryModal.tsx`:
   - Compress/downscale base64 thumbnails before persisting to localStorage to avoid the 5MB quota limit.
   - Add user-visible error handling if quota limit is exceeded.
3. Bug 18: In `tests/eventSystem.test.ts` (and/or unit test for inventoryStore):
   - Add unit tests verifying index stability when removing items at index 0 while slot 2 is selected.

Run `npm test` and `npm run typecheck` to verify your changes.
```

---

## 5. Final Verification & Quality Gate

Once all 6 subagents report completion:
1. **Typecheck:** `npm run typecheck` -> must report `0 errors`.
2. **Test Suite:** `npm test` -> all test suites must pass.
3. **Git Commit:** Commit all bug fixes atomically.
