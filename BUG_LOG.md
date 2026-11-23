# Orbis Defect & Bug Resolution Ledger (`BUG_LOG.md`)

This persistent document tracks all identified, audited, and resolved bugs across the Orbis codebase across all subsystem boundaries (UI, UX, API, Security, Controls).

---

## Summary Matrix

| Bug ID | Severity | Category | Affected Subsystem / Files | Status | Test Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | High | UI / UX | Circle Select [C], Prompt Inputs, Entity Bounds | **Resolved** | `tests/circleSelectTool.test.ts` (9 tests) |
| **BUG-002** | High | UI / UX | WorldStore, Custom World Overwrite Lifecycle | **Resolved** | `tests/worldStore.test.ts` |
| **BUG-003** | Medium | UI / UX | Modals & Viewport Escape Key Handlers | **Resolved** | `tests/circleSelectTool.test.ts` |
| **BUG-004** | High | UI / UX | Right Inspector, uiStore Rotation Transform Sync | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-005** | Medium | UI / UX | WorldLibraryModal HTML Export Dialog Cancel Toast | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-006** | Medium | UI / UX / Robustness | Unhandled Clipboard Promise Rejections | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-007** | Medium | UI / UX | Document Uploader Trapped Modal & Missing Dismissal | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-008** | Medium | UI / UX | Live Patch Synchronous Meshes Hierarchy Sync | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-009** | Low | UI / UX | DebugPanel & UpdatePromptBar Escape Key Dismissal | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-010** | Low | UI / UX | GLTF Export Dynamic Import Silent Error Handling | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-011** | Medium | Security / API | IPv6 Loopback `[::1]` Origin & DNS Guard Bypass | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-012** | Medium | UI / UX / 3D | Standalone HTML Export FPS Camera Gimbal Lock | **Resolved** | `tests/round2AuditFixes.test.ts` |
| **BUG-013** | Medium | UI / UX | Circle Select Button Click Deactivation Context Sync | **Resolved** | `tests/round2AuditFixes.test.ts` |

---

## Detailed Bug Records

### BUG-001: Circle Select [C] Hotkey Collision and Entity Selection Resolution
- **ID:** `BUG-001`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
  - `src/renderer/components/Viewport/CircleSelectTool.ts`
  - `src/renderer/components/Editor/PromptInput.tsx`
  - `src/renderer/components/HUD/UpdatePromptBar.tsx`
  - `tests/circleSelectTool.test.ts`
- **Description:** Pressing the `C` key while typing in prompt bars, spotlight bar, or textarea fields or using standard OS copy shortcuts (`Ctrl+C` / `Cmd+C`) toggled Circle Select mode. Furthermore, `CircleSelectTool` only queried graph session IDs; when a custom world or preset was loaded without a persisted session, selecting an area returned zero entities.
- **Root Cause:**
  1. `ThreeViewport.tsx` checked `e.code === 'KeyC'` without filtering for active editable elements (`input`, `textarea`, `isContentEditable`) or keyboard modifiers (`ctrlKey`, `metaKey`, `altKey`).
  2. `CircleSelectTool.ts` relied solely on the remote graph query without cross-referencing local `sceneGraph` entities (characters, objects, zones) within Euclidean radius $\sqrt{\Delta x^2 + \Delta z^2} \le R$.
- **Fix Applied:**
  1. Guarded `KeyC` with modifier checks and editable element detection.
  2. Added local `sceneGraph` fallback entity bounding search across characters, objects, and zones in `CircleSelectTool.confirmSelection()`.
- **Test Verification:** Verified by 9 unit tests in `tests/circleSelectTool.test.ts` verifying hotkey suppression in inputs and Euclidean distance selection.

---

### BUG-002: Custom World Load Overwrite Lifecycle Bug
- **ID:** `BUG-002`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
  - `src/renderer/store/worldStore.ts`
  - `src/renderer/components/WorldLibrary/WorldLibraryModal.tsx`
- **Description:** Loading a saved custom world JSON or generating a new world would immediately get overwritten and wiped by the procedural biome generator whenever the random seed or active biome changed.
- **Root Cause:** In `ThreeViewport.tsx`, the `generateWorld(activeBiome)` effect ran whenever `[activeBiome, seed, generateWorld]` changed, without checking `useWorldStore.getState().isCustomWorldActive`.
- **Fix Applied:** Added `if (useWorldStore.getState().isCustomWorldActive) return;` at the entry point of the biome/seed synchronization effect.
- **Test Verification:** Verified via `tests/worldStore.test.ts` and manual world library load flows.

---

### BUG-003: Inconsistent Escape Key Handling Across Modals and Viewport
- **ID:** `BUG-003`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Settings/SettingsModal.tsx`
  - `src/renderer/components/WorldLibrary/WorldLibraryModal.tsx`
  - `src/renderer/components/Polyfork/PolyforkExplorer.tsx`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Pressing the `Escape` key failed to dismiss the Settings modal, World Library modal, Polyfork Explorer, or the active Circle Select reticle.
- **Root Cause:** Inconsistent window-level `keydown` event listener registration across modal lifecycles.
- **Fix Applied:** Added uniform `keydown` listeners on modal mount that invoke their respective close handlers (`closeSettings`, `closeLibrary`, `closePolyfork`, `setIsCircleSelectActive(false)`).
- **Test Verification:** Verified via modal dismissal test suites and integration tests.

---

### BUG-004: Missing Rotation Controls & Schema Support in Inspector
- **ID:** `BUG-004`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/store/uiStore.ts`
  - `src/renderer/components/Inspector/RightInspector.tsx`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
  - `src/renderer/components/Sidebar/LeftSidebar.tsx`
- **Description:** The Right Inspector provided Position X/Y/Z and Scale X/Y/Z controls, but Rotation controls were entirely missing. Users had no UI mechanism to inspect or modify entity rotation. Furthermore, `SelectedNodeInfo` and `SceneHierarchyItem` omitted the `rotation` field, and `ThreeViewport`'s object raycaster never stored rotation.
- **Root Cause:** Incomplete transform inspector implementation; `rotation` was synchronized to Three.js meshes only if pre-existing, but `uiStore` lacked `updateSelectedNodeRotation` and `RightInspector` lacked input fields.
- **Fix Applied:**
  1. Added `rotation?: [number, number, number]` to `SelectedNodeInfo` and `SceneHierarchyItem`.
  2. Implemented `updateSelectedNodeRotation: (axis, value)` in `uiStore`.
  3. Added degree-based `ROT X°`, `ROT Y°`, and `ROT Z°` input controls to `RightInspector.tsx`.
  4. Populated rotation in `syncSceneHierarchy` and `onPointerDown` raycasting in `ThreeViewport.tsx`.
- **Test Verification:** Verified by `tests/round2AuditFixes.test.ts` (`BUG-004: Rotation Controls and Schema in uiStore`).

---

### BUG-005: False-Positive Success Toast on HTML Export Cancellation
- **ID:** `BUG-005`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/WorldLibrary/WorldLibraryModal.tsx`
- **Description:** When the user opened the World Library and clicked "Export HTML", canceling the native file save dialog resulted in a success toast displaying: `Exported HTML: null`.
- **Root Cause:** The IPC handler returned `{ success: true, data: null }` on user cancellation. `WorldLibraryModal.tsx` checked `if (res.success)` without checking `res.data`.
- **Fix Applied:** Changed check to `if (res.success && res.data)` so that dialog cancellations exit quietly without presenting false-positive success notifications.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.

---

### BUG-006: Unhandled Clipboard Promise Rejections
- **ID:** `BUG-006`
- **Severity:** Medium
- **Category:** UI / UX / Robustness
- **Files Modified:**
  - `src/renderer/components/Editor/JSONInspector.tsx`
  - `src/renderer/components/HUD/DebugPanel.tsx`
  - `src/renderer/components/Polyfork/PolyforkExplorer.tsx`
- **Description:** In headless environments or browsers with restricted clipboard permissions, asynchronous `navigator.clipboard.writeText(...)` threw unhandled promise rejections. Additionally, `DebugPanel.tsx` gave no user feedback upon copying code.
- **Root Cause:** Invoking asynchronous clipboard methods without `.then()` / `.catch()` error guards.
- **Fix Applied:** Wrapped clipboard calls with `navigator?.clipboard?.writeText` availability checks, attached `.catch()` handlers, and provided feedback notifications.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.

---

### BUG-007: Document Uploader Trapped Modal & Missing Close Control
- **ID:** `BUG-007`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Editor/DocumentUploader.tsx`
  - `src/renderer/App.tsx`
- **Description:** When clicking the "Story" button to open the document dropzone, users had no way to close the modal if they changed their mind without uploading a file. Escape key did nothing, and there was no close button.
- **Root Cause:** `DocumentUploaderProps` lacked an `onClose` callback, and the component lacked Escape key listeners and a dismissal header.
- **Fix Applied:** Added `onClose?: () => void` to `DocumentUploaderProps`, added an Escape key listener, and added a close header button (`✕`). Wired `onClose={() => setShowDocUploader(false)}` in `App.tsx`.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.

---

### BUG-008: Synchronous Fallback Objects and NPCs Missed from Scene Hierarchy
- **ID:** `BUG-008`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** In `ThreeViewport.tsx` (`handleApplyWorldPatch`), when live world patches were applied from `UpdatePromptBar` or `PolyforkExplorer`, non-asset objects and fallback character meshes were added synchronously to `sceneGraphGroup`, but `syncSceneHierarchy` was only invoked inside asynchronous callbacks.
- **Root Cause:** Missing `syncSceneHierarchy(scene)` calls on synchronous mesh addition branches.
- **Fix Applied:** Added explicit `syncSceneHierarchy(scene)` calls and ensured the Scene Hierarchy in the LeftSidebar updates immediately.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.

---

### BUG-009: DebugPanel & UpdatePromptBar Escape Key Dismissal
- **ID:** `BUG-009`
- **Severity:** Low
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/HUD/DebugPanel.tsx`
  - `src/renderer/components/HUD/UpdatePromptBar.tsx`
- **Description:** Pressing Escape while `DebugPanel` was open or `UpdatePromptBar` was expanded failed to close or collapse them.
- **Root Cause:** Missing `e.key === 'Escape'` branch in their respective `onKeyDown` handlers.
- **Fix Applied:** Added Escape key handling to both components.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.

---

### BUG-010: GLTF Export Dynamic Import Silent Error Handling
- **ID:** `BUG-010`
- **Severity:** Low
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** If dynamic importing of `GLTFExporter` failed during GLTF export, the error was caught and logged only to `console.error`, leaving the user with no notification.
- **Root Cause:** Missing toast notification in the outer catch block of `handleExport`.
- **Fix Applied:** Added `useUIStore.getState().showNotification('GLTF export failed', 3000, 'error')` in the catch handler.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.

---

### BUG-011: IPv6 Loopback `[::1]` Origin and URL Resolution Bypass
- **ID:** `BUG-011`
- **Severity:** Medium
- **Category:** Security / API
- **Files Modified:**
  - `src/server/index.ts`
  - `src/main/index.ts`
- **Description:** In `src/server/index.ts` (`localOriginGuard`) and `src/main/index.ts` (`setupNetworkGuard`), IPv6 loopback validation checked for `parsed.hostname === '::1'`. However, WHATWG URL standard returns IPv6 hostnames enclosed in brackets (`'[::1]'`). Legitimate local requests over IPv6 failed security origin checks with 403 Forbidden.
- **Root Cause:** Missing bracketed IPv6 notation check (`[::1]`) and strip logic in `isPrivateIP`.
- **Fix Applied:** Added `parsed.hostname !== '[::1]'` check in `localOriginGuard` and stripped bracket notation in `isPrivateIP(ip)`.
- **Test Verification:** Verified by `tests/round2AuditFixes.test.ts` (`BUG-011: IPv6 Loopback [::1] Origin and URL Resolution`).

---

### BUG-012: Standalone HTML Export FPS Camera Gimbal Lock
- **ID:** `BUG-012`
- **Severity:** Medium
- **Category:** UI / UX / 3D
- **Files Modified:**
  - `src/shared/exportHtml.ts`
- **Description:** In exported standalone HTML worlds, moving the mouse to look around in first-person mode caused roll distortion and diagonal camera tilting due to default Euler rotation order (`'XYZ'`).
- **Root Cause:** Pitch (`X`) was applied before Yaw (`Y`), causing gimbal locking during simultaneous horizontal and vertical mouse movements.
- **Fix Applied:** Set `camera.rotation.order = 'YXZ'` and updated rotation to `camera.rotation.set(pitch, yaw, 0)`.
- **Test Verification:** Verified by `tests/round2AuditFixes.test.ts` (`BUG-012: Standalone HTML Camera Order`).

---

### BUG-013: Circle Select Button Click Deactivation Context Sync
- **ID:** `BUG-013`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Clicking the `⭕ Select Area (C)` button to deactivate circle select toggled the tool off but left the selection badge and active selection context active in `useOrchestratorStore`.
- **Root Cause:** Button click handler only toggled boolean state `setIsCircleSelectActive((prev) => !prev)` without notifying `orchestratorStore`.
- **Fix Applied:** Added `if (!next) useOrchestratorStore.getState().clearSelection();` when deactivating Circle Select via the toolbar button.
- **Test Verification:** Verified in `tests/round2AuditFixes.test.ts`.
