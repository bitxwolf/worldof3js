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
| **BUG-014** | High | UI / UX / Hotkeys | Viewport Hotkeys Hijacking Editable Text Fields & Modals | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-015** | High | UI / UX | Orphaned Selection Context on Circle Select KeyC, Escape & Walk | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-016** | Medium | UI / UX | Image Uploader Trapped Modal & Missing Escape Handling | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-017** | High | Robustness / Three.js | Transform Matrix Zero/Negative Scale Determinant 0 Crash | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-018** | Medium | UI / UX | Scene Hierarchy Transform Desynchronization | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-019** | Medium | UI / UX | Reset View Camera Trapped in Walk Mode | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-020** | Low | UX / Controls | Circle Select Mouse Wheel Brush Direction Inversion | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-021** | Low | UI / UX | Spotlight Prompt Bar & JSON Inspector Escape Key Handling | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-022** | Low | UI / UX | Inventory Hotbar Modifier Key Collision & Contenteditable | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-023** | Low | UX / 3D | Standalone HTML Export Arrow Key Locomotion | **Resolved** | `tests/round3AuditFixes.test.ts` |
| **BUG-024** | High | 3D Engine / AI | NPC Pathfinding Bounds, Waypoint Overshoot & Delta Clamping | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-025** | High | Physics / 3D Engine | Physics Step Clamping, Exponential Damping & Gravity Void Protection | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-026** | Medium | UI / Shaders | Shader Uniform Boundaries, Extreme Lighting & NaN Guards | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-027** | High | WebGL / Memory | Asynchronous Scene Switch Races, Zombie Models & Component Disposal | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-028** | High | UI / UX | Dialogue Stream Deadlock, TDZ ReferenceError & Hotkey Isolation | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-029** | Medium | Audio / Robustness | Resilient Web Audio Synthesizer & Autoplay Gesture Unlock | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-030** | High | UX / Controls | Circle Select [C] Disposal Lifecycle, In-Flight Guard & Dialogue Lock | **Resolved** | `tests/round4AuditFixes.test.ts` |
| **BUG-031** | High | WebGL / Memory | GPU VRAM Garbage Collection Destruction of Active Scene Assets | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-032** | High | UX / Controls | Circle Select [C] Biome Switch State Reset, IPC Failure Abortion & Right-Click Dismiss | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-033** | High | UI / UX | Right Inspector NPC Dialogue Unhandled Failure Freezing | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-034** | Medium | UI / Controls | Dialogue Box Stale Closure and Unfocused Escape Key Trap | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-035** | Medium | 3D Engine / AI | NPC Locomotion Crab-Walking & Missing Facing Direction Alignment | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-036** | High | Physics / Controls | Player Controller Infinite Void Falling Loop & Key Stickiness on Blur | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-037** | Low | UI / Shaders | Left Sidebar Sun Angle Slider Clamp Mismatch & Walk Mode Per-Frame Allocation | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-038** | Medium | Audio / Performance | AudioManager Autoplay Unlock Retry Preservation & Lightning Noise Buffer Optimization | **Resolved** | `tests/round5AuditFixes.test.ts` |
| **BUG-039** | High | WebGL / Assets | Custom Image Portrait Extrusion, Indexed PNG & POT Scaling | **Resolved** | `tests/round6AuditFixes.test.ts` |
| **BUG-040** | High | Data / UX | World Ingestion Dual Schema & Coordinate Sanitization | **Resolved** | `tests/round6AuditFixes.test.ts` |
| **BUG-041** | High | Security / API | Standalone HTML Script Sanitization & Router Defense | **Resolved** | `tests/round6AuditFixes.test.ts` |
| **BUG-042** | High | UI / UX | HUD Collision: UpdatePromptBar vs StudioHeader Controls | **Resolved** | `tests/round7AuditFixes.test.ts` |
| **BUG-043** | High | UI / UX | Inventory Hotbar Orbit Mode Collision & Key Listener Isolation | **Resolved** | `tests/round7AuditFixes.test.ts` |
| **BUG-044** | High | Data / 3D | RightInspector Transform Synchronization to SceneGraph | **Resolved** | `tests/round7AuditFixes.test.ts` |
| **BUG-045** | High | Assets / Loading | AssetRegistry Direct Path Resolution for Local Models & Textures | **Resolved** | `tests/round7AuditFixes.test.ts` |
| **BUG-046** | High | UX / Controls | Circle Select Pointer Snapping, Live Scene Traversal & Reset Unlock | **Resolved** | `tests/round7AuditFixes.test.ts` |
| **BUG-047** | High | UI / UX / Data | Selection Edit Fallback Guard Against World Overwrite | **Resolved** | `tests/round8AuditFixes.test.ts` |
| **BUG-048** | Medium | UX / Controls | Circle Select Context Menu Suppression & Radius Bounds Clamping | **Resolved** | `tests/round8AuditFixes.test.ts` |
| **BUG-049** | High | Data / State | Custom World Flag Persistence on SceneGraph Patch | **Resolved** | `tests/round8AuditFixes.test.ts` |
| **BUG-050** | Medium | UI / UX | Popover Collision Prevention for Story & Image Uploaders | **Resolved** | `tests/round8AuditFixes.test.ts` |
| **BUG-051** | High | API / Robustness | Orchestrator Request Validation & IPC Radius Query Sanitization | **Resolved** | `tests/round8AuditFixes.test.ts` |

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

---

### BUG-014: Viewport Hotkeys Hijacking Editable Text Fields & Modals
- **ID:** `BUG-014`
- **Severity:** High
- **Category:** UI / UX / Hotkeys
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Typing in text inputs, textareas, selects, or contenteditable areas (such as Right Inspector inputs, dialogue box, spotlight search) fired 3D viewport shortcuts whenever the user typed letters 'F', 'G', 'E', 'W', 'A', 'S', 'D', 'N', or 'C'. Typing 'f' flew the camera away, 'g' stole focus to the spotlight bar, 'e' triggered interaction/door opening, and 'w'/'a'/'s'/'d' caused character walking. Furthermore, pressing viewport hotkeys while modals were open bypassed modal focus traps.
- **Root Cause:** `onKeyDown` and `onKeyUp` in `ThreeViewport.tsx` lacked comprehensive `isInputTarget` guarding (`INPUT`, `TEXTAREA`, `SELECT`, `isContentEditable`) and modal open state checks.
- **Fix Applied:** Added `isInputTarget` detection across `e.target` and `document.activeElement`, verified modal open states (`isSettingsOpen`, `isLibraryOpen`, `isPolyforkOpen`, `isDocUploaderOpen`, `isImageUploaderOpen`), and added window blur reset for motion keys.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts` (`isInputTarget helper detects input, textarea, select, and contenteditable elements`).

---

### BUG-015: Orphaned Selection Context on Circle Select KeyC, Escape & Walk Mode
- **ID:** `BUG-015`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Deactivating Circle Select via the keyboard shortcut `KeyC`, the `Escape` key, or transitioning into `walk` mode toggled the visual reticle off but left the `activeSelection` context active in `useOrchestratorStore`, leaving the "Editing Selection (R=...m)" banner permanently trapped in the spotlight prompt bar.
- **Root Cause:** `ThreeViewport.tsx` only called `setIsCircleSelectActive(false)` on keyboard and camera mode triggers without calling `useOrchestratorStore.getState().clearSelection()`.
- **Fix Applied:** Added `useOrchestratorStore.getState().clearSelection()` to the `KeyC` toggle handler, the `Escape` handler, and the `cameraMode === 'walk'` synchronization effect.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-016: Image Uploader Trapped Modal & Missing Escape Handling
- **ID:** `BUG-016`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Editor/ImageUploader.tsx`
  - `src/renderer/App.tsx`
  - `src/renderer/store/uiStore.ts`
- **Description:** Opening the Image Uploader modal created an unclosable state when the user decided not to upload anything. Pressing Escape did nothing, there was no close button (`✕`) in the header, and modal state was held in isolated React state rather than the centralized `uiStore`.
- **Root Cause:** `ImageUploader.tsx` had no `keydown` listener for Escape, no header close button, and `uiStore` lacked modal tracking for uploaders.
- **Fix Applied:** Added an Escape key listener and close (`✕`) button to `ImageUploader.tsx`. Added `isDocUploaderOpen` and `isImageUploaderOpen` state and mutators to `uiStore.ts` and connected them in `App.tsx`.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-017: Transform Matrix Zero/Negative Scale Determinant 0 Crash & NaN Position Clamping
- **ID:** `BUG-017`
- **Severity:** High
- **Category:** Robustness / Three.js
- **Files Modified:**
  - `src/renderer/store/uiStore.ts`
- **Description:** Passing zero or negative values into `updateSelectedNodeScale` produced non-invertible matrices, causing Three.js to throw continuous `Matrix4.invert(): can't invert matrix, determinant is 0` errors during scene rendering and raycasting. Passing `NaN` or `Infinity` into scale or position made meshes disappear entirely.
- **Root Cause:** Missing bounds sanitization in `updateSelectedNodePosition` and `updateSelectedNodeScale`.
- **Fix Applied:** Clamped scale to `[0.001, 100]` with finite validation, and normalized non-finite positions and rotations to `0`.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-018: Scene Hierarchy Stale Transform Desynchronization
- **ID:** `BUG-018`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/store/uiStore.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Modifying an object's Position, Scale, or Rotation in `RightInspector` updated `selectedNode` but never updated `sceneHierarchy`. When users navigated back to the Scene Hierarchy in the Left Sidebar and re-clicked the object, the Inspector reverted back to the old stale coordinates.
- **Root Cause:** `uiStore.ts` transform methods mutated `state.selectedNode` without updating the matching item in `state.sceneHierarchy`.
- **Fix Applied:** Updated `updateSelectedNodePosition`, `updateSelectedNodeScale`, and `updateSelectedNodeRotation` to map over and update `sceneHierarchy` synchronously, and called `selectedObj.updateMatrixWorld(true)` in `ThreeViewport.tsx`.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-019: Reset View Camera Trapped in Walk Mode
- **ID:** `BUG-019`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Clicking "Reset View" while in FPS Walk mode repositioned the camera to `(28, 22, 34)` in the sky, but left `cameraMode` as `'walk'`, causing the player controller to remain active in first-person mode floating in the sky.
- **Root Cause:** `handleResetCamera` only updated camera and OrbitControls coordinates without transitioning `cameraMode` back to `'orbit'`.
- **Fix Applied:** Added `if (useUIStore.getState().cameraMode === 'walk') useUIStore.getState().setCameraMode('orbit');` to `handleResetCamera`.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-020: Circle Select Mouse Wheel Brush Direction Inversion
- **ID:** `BUG-020`
- **Severity:** Low
- **Category:** UX / Controls
- **Files Modified:**
  - `src/renderer/components/Viewport/CircleSelectTool.ts`
- **Description:** Scrolling the mouse wheel up over the canvas while Circle Select was active decreased the brush radius, while scrolling down increased it. This contradicted industry standards (Blender, Photoshop) and the tool's own Shift+drag behavior.
- **Root Cause:** `onWheel` added `event.deltaY * 0.05`. Because wheel up produces negative `deltaY`, it subtracted from the radius.
- **Fix Applied:** Adjusted calculation to `this.radius - Math.sign(event.deltaY) * 2.5` so wheel up increases radius and wheel down decreases radius.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-021: Spotlight Prompt Bar & JSON Inspector Escape Key Handling
- **ID:** `BUG-021`
- **Severity:** Low
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/SpotlightPromptBar.tsx`
  - `src/renderer/components/Editor/JSONInspector.tsx`
- **Description:** Pressing `Escape` while focused in `#spotlightInput` or while the JSON Inspector drawer was expanded did nothing.
- **Root Cause:** Missing `Escape` key listeners in both components.
- **Fix Applied:** Added Escape handling in `SpotlightPromptBar.tsx` (clears input text or active selection and blurs focus) and in `JSONInspector.tsx` (collapses drawer).
- **Test Verification:** Verified by manual inspection and test suites.

---

### BUG-022: Inventory Hotbar Modifier Key Collision & Contenteditable Leaks
- **ID:** `BUG-022`
- **Severity:** Low
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/HUD/InventoryBar.tsx`
- **Description:** Pressing number keys `1`–`8` while holding modifier keys (`Ctrl+1` or `Cmd+1` to switch browser tabs) switched inventory slots. In addition, typing numbers inside contenteditable divs triggered inventory slot switches.
- **Root Cause:** `InventoryBar.tsx` checked only `instanceof HTMLInputElement || HTMLTextAreaElement` without checking `e.ctrlKey || e.metaKey || e.altKey` or `isContentEditable`.
- **Fix Applied:** Added modifier key guards and `isContentEditable` checks before processing hotbar numeric keys.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-023: Standalone HTML Export Arrow Key Locomotion
- **ID:** `BUG-023`
- **Severity:** Low
- **Category:** UX / 3D
- **Files Modified:**
  - `src/shared/exportHtml.ts`
- **Description:** In exported standalone HTML worlds, pressing arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) did not move the player. Only `KeyW`, `KeyS`, `KeyA`, `KeyD` were supported.
- **Root Cause:** `keys` mapping in `exportHtml.ts` omitted arrow keys.
- **Fix Applied:** Added arrow key mapping and motion support in `exportHtml.ts`.
- **Test Verification:** Verified by `tests/round3AuditFixes.test.ts`.

---

### BUG-024: NPC Pathfinding Bounds, Waypoint Overshoot & Delta Clamping
- **ID:** `BUG-024`
- **Severity:** High
- **Category:** 3D Engine / AI
- **Files Modified:**
  - `src/renderer/engine/NPCSystem.ts`
- **Description:** During frame lag spikes (e.g. initial scene load or heavy shader compilation), NPC pathfinding calculated movement steps using unclamped frame deltas. This caused NPCs to drastically overshoot patrol waypoints, get stuck oscillating across waypoints, wander off the world terrain edges beyond $[-80, 80]$, or crash when patrol paths were malformed or empty.
- **Root Cause:** In `NPCSystem.tick()`, `delta` was unconstrained, step calculation `maxStep = speed * delta` was added directly without `Math.min(maxStep, distToTarget)`, and wander target selection had no terrain bounding bounds.
- **Fix Applied:** Clamped `delta` in `tick()` to `[0, 0.1]`; clamped patrol movement step to `Math.min(maxStep, distToTarget)`; added modulo safety guards against out-of-bounds patrol indices and empty patrol arrays; clamped wander targets and physical NPC positions strictly to terrain bounds `[-78, 78]`.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts` (3 dedicated tests for patrol overshoot, edge bounds clamping, and malformed paths).

---

### BUG-025: Physics Step Clamping, Exponential Damping & Gravity Void Protection
- **ID:** `BUG-025`
- **Severity:** High
- **Category:** Physics / 3D Engine
- **Files Modified:**
  - `src/renderer/engine/PlayerController.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
  - `src/renderer/engine/SceneManager.ts`
- **Description:** Physics integration in `ThreeViewport.tsx` used linear velocity decay: `vel -= vel * 10 * delta`. When `delta > 0.1s` during hitching, `(1 - 10 * delta)` becomes negative, flipping velocity direction and exponentially amplifying movement, ejecting the player at hyper-speed. Additionally, if collision raycasts failed to register ground during hitching, the player plummeted infinitely into negative Y space without recovery.
- **Root Cause:** Euler linear damping instability under variable delta times; absence of maximum physics step clamping; lack of negative Y-boundary void safety.
- **Fix Applied:** Replaced linear velocity decay with mathematically unconditionally stable exponential decay: `vel *= Math.exp(-10.0 * clampedDelta)`. Clamped frame deltas to `0.1s` across `ThreeViewport`, `SceneManager`, and `PlayerController`. Added void protection: if `camera.position.y < -30`, position resets safely to `PLAYER_HEIGHT` and vertical velocity resets to 0.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts`.

---

### BUG-026: Shader Uniform Boundaries, Extreme Lighting & NaN Guards
- **ID:** `BUG-026`
- **Severity:** Medium
- **Category:** UI / Shaders
- **Files Modified:**
  - `src/renderer/store/uiStore.ts`
- **Description:** Extreme or malformed slider values in the Left Sidebar (or injected from external scene graph JSON) caused WebGL rendering failures. Negative or extreme `fogDensity` values (e.g. > 0.2) turned the entire viewport pitch black, negative elevations produced inverted terrain meshes, and `NaN` values corrupted Three.js light matrices.
- **Root Cause:** `setTuningParam`, `setSunlight`, `setMoonlight`, and `syncFromSceneGraph` in `uiStore.ts` accepted raw numeric values without boundary clamping or `Number.isFinite()` validation.
- **Fix Applied:** Clamped `fogDensity` to `[0.001, 0.15]`, `elevation` to `[1.0, 50.0]`, `density` to `[5, 250]`, `sunAngle` to `[5, 175]`, `roughness`/`metalness` to `[0, 1]`. Added fallback to current values on `NaN` or non-finite inputs, and trimmed/sanitized light hex colors.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts`.

---

### BUG-027: Asynchronous Scene Switch Races, Zombie Models & Component Disposal
- **ID:** `BUG-027`
- **Severity:** High
- **Category:** WebGL / Memory
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
  - `src/renderer/components/Polyfork/PolyforkExplorer.tsx`
- **Description:** Rapidly switching between world scenes while Polyfork 3D models were asynchronously downloading resulted in late-resolving promises inserting orphan models and running animation mixers into the newly loaded world. In addition, the viewport's Garbage Collection handler (`handleGC`) was traversing the active scene and disposing live rendering meshes, causing WebGL crashes on subsequent render frames.
- **Root Cause:** Missing cancellation token on the `sceneGraph` effect; lack of animation mixer cleanup on unmount; erroneous disposal of active scene meshes in `handleGC`.
- **Fix Applied:** Added cancellation token `let isCurrent = true; return () => { isCurrent = false; };` to prevent stale scene graph promises from mutating state; stopped and cleared all `animationMixersRef.current` on scene switch and unmount; refactored `handleGC` to clean unreferenced assets via `getDefaultAssetRegistry().disposeAll()` and reset renderer info without destroying live scene geometries; added full WebGL disposal (grid, ambient light, directional light, model) in `PolyforkExplorer.tsx` unmount.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts`.

---

### BUG-028: Dialogue Stream Deadlock, TDZ ReferenceError & Hotkey Isolation
- **ID:** `BUG-028`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
  - `src/renderer/components/Inspector/RightInspector.tsx`
  - `src/renderer/store/npcStore.ts`
  - `src/renderer/components/HUD/DialogueBox.tsx`
- **Description:** If an NPC dialogue streaming request failed on the backend or returned `{ success: false }`, `isStreaming(false)` was never called, permanently freezing the dialogue box on "Waiting for reply...". Furthermore, in `RightInspector.tsx`, `unsubError` was invoked inside its own declaration before initialization, causing a runtime JavaScript `ReferenceError` (Temporal Dead Zone). Additionally, viewport hotkeys like `[C]` could be pressed while typing in dialogue mode.
- **Root Cause:** Missing rejection/error handlers in `handleSendDialogue`; variable declaration ordering in `RightInspector`; missing dialogue open check in hotkey handler.
- **Fix Applied:** Added error fallback handling with audio notification and `isStreaming(false)` in `handleSendDialogue`; fixed TDZ in `RightInspector.tsx` by declaring variable before cleanup invocation; added `isDialogueOpen` check to suppress hotkeys; added dialogue branch option state tracking (`currentBranch`, `activeQuestId`, `branchOptions`) in `npcStore.ts` and interactive branch choice pills in `DialogueBox.tsx`.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts`.

---

### BUG-029: Resilient Web Audio Synthesizer & Autoplay Gesture Unlock
- **ID:** `BUG-029`
- **Severity:** Medium
- **Category:** Audio / Robustness
- **Files Modified:**
  - `src/renderer/engine/AudioManager.ts` (New File)
  - `src/renderer/engine/WeatherSystem.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Audio cues and sound effects were missing or susceptible to browser autoplay policy blocking. In environments without user gestures or where Web Audio was unavailable, attempts to play audio threw uncaught errors.
- **Root Cause:** No unified Web Audio architecture; missing autoplay unlock listeners on user interactions.
- **Fix Applied:** Created a singleton `AudioManager` with lazy Web Audio context initialization, automatic user gesture unlocking (`pointerdown`, `keydown`, `click`), procedural sound generation (`playInteract`, `playSelect`, `playDialogue`, `playLightning`), volume and mute controls, and non-throwing error suppression. Wired procedural lightning audio into `WeatherSystem.triggerLightningFlash()`.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts`.

---

### BUG-030: Circle Select [C] Disposal Lifecycle, In-Flight Guard & Dialogue Lock
- **ID:** `BUG-030`
- **Severity:** High
- **Category:** UX / Controls
- **Files Modified:**
  - `src/renderer/components/Viewport/CircleSelectTool.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** If Circle Select was dismissed (via `Escape`, mode switch, or dialogue interaction) while a selection confirmation was in-flight, `confirmSelection()` would complete late and re-apply an active selection context, confusing the user. Additionally, Circle Select remained active when an NPC dialogue box opened.
- **Root Cause:** Lack of disposal lifecycle state tracking in `CircleSelectTool`; lack of mutual deactivation between dialogue and Circle Select.
- **Fix Applied:** Added `isDisposed` flag to `CircleSelectTool`; guarded `confirmSelection()` to immediately abort if `this.isDisposed === true`; integrated `AudioManager.getInstance().playSelect()` on successful selection; added mutual deactivation in `ThreeViewport.tsx` where opening dialogue deactivates Circle Select and activating Circle Select closes open dialogues.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts` and `tests/circleSelectTool.test.ts`.

---

### BUG-031: GPU VRAM Garbage Collection Destruction of Active Scene Assets
- **ID:** `BUG-031`
- **Severity:** High
- **Category:** WebGL / Memory
- **Files Modified:**
  - `src/renderer/engine/AssetRegistry.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** In `ThreeViewport.tsx`, clicking the "Sweep VRAM (GC)" button triggered `getDefaultAssetRegistry().disposeAll()`. Because cloned models placed in the active scene share their geometries and materials with the cached instances in `AssetRegistry`, calling `disposeAll()` destroyed the WebGL buffers and materials of all active meshes currently rendering in the viewport, causing black models and WebGL invalid operation draw errors. Furthermore, `disposeHierarchy()` destroyed shared geometries when individual objects were replaced or picked up.
- **Root Cause:** Indiscriminate geometry/material disposal across shared references in `AssetRegistry` and `disposeHierarchy()`.
- **Fix Applied:** Implemented `sweepUnreferenced(activeScene?: THREE.Scene)` in `AssetRegistry` that traverses the active scene and protects any active geometries, materials, or textures, purging only unreferenced assets. Updated `ThreeViewport.tsx`'s `handleGC` to call `sweepUnreferenced(scene)`. Added in-use reference checking to `disposeHierarchy()` so shared geometries are not disposed if another active mesh still references them.
- **Test Verification:** Verified by `tests/round4AuditFixes.test.ts` and `tests/round5AuditFixes.test.ts`.

---

### BUG-032: Circle Select [C] Biome Switch State Reset, IPC Failure Abortion & Right-Click Dismiss
- **ID:** `BUG-032`
- **Severity:** High
- **Category:** UX / Controls
- **Files Modified:**
  - `src/renderer/components/Viewport/CircleSelectTool.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Rapidly switching biomes while Circle Select was active caused `ThreeViewport`'s `useEffect` to completely destroy and recreate `CircleSelectTool`, resetting the user's custom brush radius to 25 and canceling in-flight mouse dragging. Furthermore, if the backend IPC call to `GRAPH_QUERY_RADIUS` failed or was offline, `confirmSelection()` threw an error in the outer `try` block, completely bypassing local `sceneGraph` entity extraction. Also, dragging outside canvas boundaries lost `pointerup` events, and right-clicking spawned the browser native context menu without dismissing the tool.
- **Root Cause:** Destructive React dependency array in `useEffect`; missing isolated error boundaries for IPC calls; lack of pointer capture; missing contextmenu prevention.
- **Fix Applied:** Added `setActiveBiome(biome)` to `CircleSelectTool` so `ThreeViewport` updates biome without recreating the tool or resetting radius; added `lastRadius` static persistence; isolated `transport.call` in its own inner try/catch so local `sceneGraph` fallback always runs; implemented `setPointerCapture` / `releasePointerCapture` with safe fallbacks; added right-click dismissal via `onDismiss` callback; added `onContextMenu={(e) => e.preventDefault()}` on `<canvas>`.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts` and `tests/circleSelectTool.test.ts`.

---

### BUG-033: Right Inspector NPC Dialogue Unhandled Failure Freezing
- **ID:** `BUG-033`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/Inspector/RightInspector.tsx`
- **Description:** When chatting with an NPC from the Right Inspector, if `window.electronAPI.npcReply` returned `{ success: false, error: ... }` (e.g. rate limit, validation failure, or offline agent), `isNpcThinking` remained `true` indefinitely. The user interface was permanently locked in "thinking" mode and could never send another message.
- **Root Cause:** `RightInspector.tsx` only listened to `onStreamError` (which is never dispatched if validation fails before streaming begins) and never inspected `res.success` from the resolved promise.
- **Fix Applied:** Checked `res && !res.success` from `window.electronAPI.npcReply`, set `isNpcThinking(false)`, cleared streaming text, added a fallback message to dialogue history, and triggered `AudioManager.getInstance().playDialogue()`.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts`.

---

### BUG-034: Dialogue Box Stale Closure and Unfocused Escape Key Trap
- **ID:** `BUG-034`
- **Severity:** Medium
- **Category:** UI / Controls
- **Files Modified:**
  - `src/renderer/components/HUD/DialogueBox.tsx`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Pressing Escape while chatting with an NPC failed to close the dialogue box if the user had clicked away from the text input (e.g. on a dialogue message or choice pill). In `ThreeViewport.tsx`, the `onKeyDown` handler checked a stale closure variable `dialogueOpen` captured on mount (which was always `false`), ignoring the Escape key and leaving viewport controls suppressed.
- **Root Cause:** `handleKeyDown` in `DialogueBox.tsx` was only bound to `<input>`; `ThreeViewport.tsx` keydown listener captured stale initial React state instead of querying Zustand store directly.
- **Fix Applied:** Added a global window-level `keydown` listener in `DialogueBox.tsx` to handle Escape while mounted; updated `ThreeViewport.tsx` to check `useNPCStore.getState().dialogueOpen` dynamically. Added `AudioManager.getInstance().playInteract()` to branch choice pills.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts`.

---

### BUG-035: NPC Locomotion Crab-Walking & Missing Facing Direction Alignment
- **ID:** `BUG-035`
- **Severity:** Medium
- **Category:** 3D Engine / AI
- **Files Modified:**
  - `src/renderer/engine/NPCSystem.ts`
- **Description:** When NPCs were patrolling or wandering, their physical coordinates moved along the waypoints, but their body rotation was never updated to face the movement direction. When player distance was $\ge 10\text{m}$, NPCs slid sideways or backwards along their paths like crabs.
- **Root Cause:** `tickPatrol` and `tickWander` updated `pos.x` and `pos.z` but did not update `npc.group.quaternion` towards the target vector.
- **Fix Applied:** In `tickPatrol` and `tickWander`, when moving and player distance is $\ge 10\text{m}$, smoothly slerped `npc.group.quaternion` to face `(targetX, pos.y, targetZ)`.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts`.

---

### BUG-036: Player Controller Infinite Void Falling Loop & Key Stickiness on Blur
- **ID:** `BUG-036`
- **Severity:** High
- **Category:** Physics / Controls
- **Files Modified:**
  - `src/renderer/engine/PlayerController.ts`
- **Description:** If a player walked off the edge of the world terrain ($|x| > 80$ or $|z| > 80$), void protection reset `pos.y = PLAYER_HEIGHT`, but left `pos.x` and `pos.z` outside terrain boundaries. Because no ground existed under those coordinates, the player fell immediately back to -30 and repeated the fall in an infinite loop. Additionally, if the user alt-tabbed or pointer lock unlocked while holding 'W', movement keys remained stuck `true`.
- **Root Cause:** Unclamped horizontal coordinates on void reset; lack of `blur` and `unlock` key reset handlers in `PlayerController`.
- **Fix Applied:** In `PlayerController.update()`, reset `pos.x` and `pos.z` clamped to safe terrain bounds `[-70, 70]` when void fall triggers; added `resetKeys()` and bound it to `window.blur` and `controls.unlock`.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts`.

---

### BUG-037: Left Sidebar Sun Angle Slider Clamp Mismatch & Walk Mode Per-Frame Allocation
- **ID:** `BUG-037`
- **Severity:** Low
- **Category:** UI / Shaders
- **Files Modified:**
  - `src/renderer/components/Sidebar/LeftSidebar.tsx`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** The legacy "Sun Angle" slider in LeftSidebar was configured with `min="10"` and `max="170"`, but its `onChange` called `setSunlight({ elevation })` which clamped values to 90°. Dragging the slider past 90° caused erratic jumps. In `ThreeViewport.tsx`, walk mode allocated `new THREE.Vector3()` every animation frame (60 allocations/sec).
- **Root Cause:** Configuration mismatch between slider range and store clamp; per-frame object allocation in render loop.
- **Fix Applied:** Updated Left Sidebar Sun Angle slider range to `min="5"`, `max="90"` matching `sunlight.elevation`. Replaced per-frame `new THREE.Vector3()` in `ThreeViewport` walk mode with a reusable scratch vector `scratchVec3RightRef`.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts`.

---

### BUG-038: AudioManager Autoplay Unlock Retry Preservation & Lightning Noise Buffer Optimization
- **ID:** `BUG-038`
- **Severity:** Medium
- **Category:** Audio / Performance
- **Files Modified:**
  - `src/renderer/engine/AudioManager.ts`
  - `src/renderer/engine/WeatherSystem.ts`
- **Description:** If a browser rejected the initial `ctx.resume()` during a `pointerdown` gesture, `AudioManager` prematurely removed all gesture listeners, permanently locking audio playback until restart. Additionally, each lightning flash generated a new 35,000-sample noise buffer on the main thread, causing frame hitching in stormy weather.
- **Root Cause:** Premature listener removal on unverified resume promises; un-cached noise buffer allocation in `playLightning`.
- **Fix Applied:** Preserved gesture unlock listeners until `ctx.resume()` successfully resolves; cached procedural lightning noise buffer in `AudioManager` for reuse across lightning strikes; added NaN and negative delta clamping to `WeatherSystem.update()`.
- **Test Verification:** Verified by `tests/round5AuditFixes.test.ts`.

---

### BUG-039: Custom Image Portrait Extrusion, Indexed PNG Decoding & Texture Scaling Resilience
- **ID:** `BUG-039`
- **Severity:** High
- **Category:** WebGL / Assets
- **Files Modified:**
  - `src/renderer/engine/assets/img2threejsAdapter.ts`
  - `src/main/services/ImageService.ts`
  - `src/renderer/components/Editor/ImageUploader.tsx`
- **Description:** Non-power-of-two (NPOT) custom avatar portraits generated WebGL mipmapping warnings and texture warping. In `ImageService`, 8-bit indexed PNG images (color type 3) failed to decode due to unhandled `PLTE` and `tRNS` chunks. Furthermore, PNGs with opaque or malformed alpha channels marked 100% of the image as foreground, failing silhouette extraction. 404/broken texture URLs lacked error handlers, triggering uncaught Three.js loader exceptions.
- **Root Cause:** Missing power-of-two resampling and `THREE.ClampToEdgeWrapping` configuration; lack of palette/transparency chunk parsing in custom pure PNG decoder; missing dual-pass fallback when alpha channel is non-segmented; lack of `onError` loader callback.
- **Fix Applied:** Implemented offscreen canvas POT resampling (`ensurePowerOfTwoImage`) and `ClampToEdgeWrapping` on avatar textures; added `PLTE` palette and `tRNS` alpha transparency chunk parsing in `decodePng`; added dual-pass fallback in `extractSilhouetteContour` that switches to corner background distance if alpha channel masks the entire image; added safe neutral solid canvas fallback on texture load errors; added try/catch error handling in `ImageUploader` and fallback image onerror handlers.
- **Test Verification:** Verified by `tests/round6AuditFixes.test.ts` and `tests/img2threejsAdapter.test.ts`.

---

### BUG-040: World Import/Export Ingestion, JSON Schema Diagnostics & Coordinate Sanitization
- **ID:** `BUG-040`
- **Severity:** High
- **Category:** Data / UX
- **Files Modified:**
  - `src/main/ipc/file.handler.ts`
  - `src/renderer/components/WorldLibrary/WorldLibraryModal.tsx`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Importing raw SceneGraph JSON files (e.g. exported from JSON Inspector) failed with schema validation errors because the importer only accepted wrapped `SavedWorld` files. Truncated or malformed JSON files displayed uninformative errors or raw Zod error JSON dumps in UI toasts. Importing scenes with missing, NaN, or non-numeric entity/player coordinates crashed the Three.js viewport camera and physics.
- **Root Cause:** Rigid top-level schema validation ignoring unwrapped `SceneGraph` structure; unformatted Zod issue arrays in UI toasts; lack of finite number coordinate sanitization in `WorldLibraryModal` and `ThreeViewport`.
- **Fix Applied:** Supported dual schema ingestion in `file.handler.ts` and `WorldLibraryModal.tsx` (auto-wrapping raw `SceneGraph` files into valid `SavedWorld` instances); formatted human-readable schema validation issues; surfaced exact syntax error messages on truncated/malformed JSON files; added `sanitizePlayerPosition` and finite number checks in `ThreeViewport` for entity spawning.
- **Test Verification:** Verified by `tests/round6AuditFixes.test.ts`.

---

### BUG-041: Security & API Hardening: Standalone HTML Script Sanitization & Router Defense
- **ID:** `BUG-041`
- **Severity:** High
- **Category:** Security / API
- **Files Modified:**
  - `src/shared/exportHtml.ts`
  - `src/server/index.ts`
  - `src/main/ipc/settings.handler.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Standalone HTML export code validation did not block window proxy aliases (`top`, `self`, `parent`, `location`, `navigator`), storage (`indexedDB`), or dialog prompts (`alert`, `confirm`, `prompt`, `open`). Embedding serialized JSON in `<script>` tags was susceptible to HTML comment/script tag breakouts. Express server allowed open CORS and lacked prototype pollution checks on orchestrator and LLM routes. OpenAI model fetch was vulnerable to SSRF with non-HTTP protocols. When activating Circle Select `[C]` from Walk mode, pointer lock remained active, trapping the cursor.
- **Root Cause:** Incomplete regex blocklist in `exportHtml.ts`; missing sanitization for `<script` and `<!--` in embedded JSON; unconditional `cors` callback in server; unvalidated `baseUrl` protocol in `settings.handler.ts`; missing pointer unlock call in `ThreeViewport.tsx`.
- **Fix Applied:** Expanded `EXPORT_BLOCKED_PATTERNS` to block `top`, `self`, `parent`, `location`, `navigator`, `indexedDB`, and dialog prompts; escaped script and comment tags in serialized JSON; enforced localhost-only origin check in server CORS; added global prototype pollution defense middleware on `/api`; validated `baseUrl` protocol to only permit HTTP/HTTPS; added explicit pointer unlock and object deselection when Circle Select `[C]` is toggled.
- **Test Verification:** Verified by `tests/round6AuditFixes.test.ts` and `tests/phase4StoryEngine.test.ts`.

---

### BUG-042: HUD Layout Collision Elimination: UpdatePromptBar vs StudioHeader Controls
- **ID:** `BUG-042`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/HUD/UpdatePromptBar.tsx`
- **Description:** `UpdatePromptBar` used `fixed top-4 left-1/2 -translate-x-1/2`, placing it at window Y=16px and completely covering the segmented Camera Mode and Day/Night picker buttons in `StudioHeader` (height 40px), blocking user clicks to camera modes.
- **Root Cause:** Viewport HUD component was styled with viewport-relative `fixed` positioning rather than container-relative `absolute` positioning inside the viewport `<main>` element.
- **Fix Applied:** Changed styling to `absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto`, placing it cleanly inside `<main>` below `StudioHeader`.
- **Test Verification:** Verified by visual layout check and `tests/round7AuditFixes.test.ts`.

---

### BUG-043: Inventory Hotbar Visibility & Keyboard Selection Scoping to Walk Mode
- **ID:** `BUG-043`
- **Severity:** High
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/components/HUD/InventoryBar.tsx`
- **Description:** `InventoryBar` rendered at `bottom-3` during Orbit mode, colliding with and obscuring `SpotlightPromptBar` at `bottom-4`. In addition, pressing numeric keys 1-8 during Orbit mode silently changed active inventory slots while the hotbar was hidden.
- **Root Cause:** Missing cameraMode conditional rendering and keyboard event listener gate in `InventoryBar`.
- **Fix Applied:** Added `shouldRenderInventoryBar(cameraMode)` predicate checking `cameraMode === 'walk'`, conditionally returning null in Orbit mode; guarded keyboard shortcut listener so slot selection only fires in Walk mode with `[selectSlot, cameraMode]` dependency tracking.
- **Test Verification:** Verified by `tests/round7AuditFixes.test.ts`.

---

### BUG-044: RightInspector 3D Transform Synchronization to SceneGraph & World Persistence
- **ID:** `BUG-044`
- **Severity:** High
- **Category:** Data / 3D
- **Files Modified:**
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** Modifying an object's position, rotation, or scale in `RightInspector` updated the Three.js mesh in the 3D scene but did not update the corresponding record in `useWorldStore.getState().sceneGraph`. Consequently, saving the world, exporting to standalone HTML, or querying the scene via Circle Select lost all inspector transform edits.
- **Root Cause:** Missing state synchronization between `selectedNode` in `uiStore` and `sceneGraph.objects` / `sceneGraph.characters` in `worldStore`.
- **Fix Applied:** Added transform synchronization logic in `selectedNode` effect in `ThreeViewport.tsx` to automatically update the matching object or character in `sceneGraph` with new position, rotation, and scale values.
- **Test Verification:** Verified by `tests/round7AuditFixes.test.ts`.

---

### BUG-045: AssetRegistry Direct File Path Resolution for Local Models & Textures
- **ID:** `BUG-045`
- **Severity:** High
- **Category:** Assets / Loading
- **Files Modified:**
  - `src/renderer/engine/AssetRegistry.ts`
- **Description:** Custom local 3D models and textures with relative or direct paths (e.g., `./model.glb`, `assets/prop.gltf`, `house.glb`) were treated as Polyfork assets and prepended with `polyfork://`, failing to load via Three.js `GLTFLoader`.
- **Root Cause:** Greedy URI prefixing in `loadModel` and strict path validation in `validateTextureUrl` rejecting relative filenames.
- **Fix Applied:** Updated `loadModel` in `AssetRegistry.ts` to recognize direct/relative filenames and extensions, passing them directly to `GLTFLoader`; permitted safe bare filenames in `validateTextureUrl`.
- **Test Verification:** Verified by `tests/round7AuditFixes.test.ts`.

---

### BUG-046: Circle Select Pointer Snapping, Live Scene Traversal & Reset Unlock
- **ID:** `BUG-046`
- **Severity:** High
- **Category:** UX / Controls
- **Files Modified:**
  - `src/renderer/components/Viewport/CircleSelectTool.ts`
  - `src/renderer/components/Viewport/ThreeViewport.tsx`
- **Description:** When activating Circle Select `[C]`, the reticle spawned at (0, 0, 0) until the mouse was moved. Selection queries only checked static spawn points in `sceneGraph`, missing patrolling NPCs that had walked into the circle. Reset View in Walk mode did not release pointer lock.
- **Root Cause:** Missing initial pointer position seed on tool instantiation; absence of 3D scene graph mesh traversal with `getWorldPosition()`; missing `pointerLockRef.current?.unlock()` in `handleResetCamera`.
- **Fix Applied:** Implemented `updateInitialPosition` and `lastPointerPosRef` tracking; added 3D scene traversal detecting live patrolling NPCs and moved props; unlocked pointer lock and called `exitPointerLock` in `handleResetCamera`.
- **Test Verification:** Verified by `tests/round7AuditFixes.test.ts`.

---

### BUG-047: Selection Edit Fallback Guard: Protection Against Inadvertent Whole-World Overwrites
- **ID:** `BUG-047`
- **Severity:** High
- **Category:** UI / UX / Data
- **Files Modified:**
  - `src/renderer/components/Viewport/SpotlightPromptBar.tsx`
- **Description:** When editing an active circle selection in `SpotlightPromptBar`, if the orchestrator's `editSelection` returned null or failed, execution fell through to `if (api?.parseWorld)`, which treated the selection prompt as a brand new world prompt and called `parseWorld`, completely erasing the user's world and replacing it with a new world. Additionally, `isCustomWorldActive` was reset to false on selection error.
- **Root Cause:** Missing `!activeSelection` guard on the whole-world fallback generation branch and unconditional reset of `isCustomWorldActive`.
- **Fix Applied:** Guarded the whole-world fallback generation branch with `if (!activeSelection && api?.parseWorld)` and guarded `setCustomWorldActive(false)` with `if (!activeSelection)`.
- **Test Verification:** Verified by `tests/round8AuditFixes.test.ts`.

---

### BUG-048: Circle Select Context Menu Suppression & Radius Bounds Clamping
- **ID:** `BUG-048`
- **Severity:** Medium
- **Category:** UX / Controls
- **Files Modified:**
  - `src/renderer/components/Viewport/CircleSelectTool.ts`
- **Description:** Right-clicking on the canvas to cancel Circle Select triggered the browser/Electron native context menu ("Inspect Element", etc.) over the 3D scene.
- **Root Cause:** Missing `contextmenu` event listener and `preventDefault()` call in `CircleSelectTool`.
- **Fix Applied:** Added `contextmenu` listener on the canvas inside `CircleSelectTool` calling `preventDefault()`, with proper disposal cleanup.
- **Test Verification:** Verified by `tests/round8AuditFixes.test.ts`.

---

### BUG-049: Custom World Flag Persistence on SceneGraph Patch
- **ID:** `BUG-049`
- **Severity:** High
- **Category:** Data / State
- **Files Modified:**
  - `src/renderer/store/worldStore.ts`
- **Description:** When props or characters were added to the world via `patchSceneGraph` (e.g. from Polyfork explorer or partial LLM updates), `isCustomWorldActive` was not set to `true`. As a result, subsequent seed or biome changes in `LeftSidebar` wiped out the newly patched entities with default procedural terrain.
- **Root Cause:** `patchSceneGraph` in `worldStore.ts` did not update `isCustomWorldActive: true`.
- **Fix Applied:** Updated `patchSceneGraph` to set `isCustomWorldActive: true`.
- **Test Verification:** Verified by `tests/round8AuditFixes.test.ts`.

---

### BUG-050: Popover Collision Prevention Between Story and Image Uploader Modals
- **ID:** `BUG-050`
- **Severity:** Medium
- **Category:** UI / UX
- **Files Modified:**
  - `src/renderer/store/uiStore.ts`
- **Description:** In the bottom HUD bar, opening the Document Uploader and then opening the Image Uploader left both floating dropzone panels mounted simultaneously at `bottom-16 left-4`, overlapping and occluding each other.
- **Root Cause:** Independent toggle functions in `uiStore` did not close the opposing uploader popover.
- **Fix Applied:** Updated `toggleDocUploader` to set `isImageUploaderOpen: false`, and `toggleImageUploader` to set `isDocUploaderOpen: false`.
- **Test Verification:** Verified by `tests/round8AuditFixes.test.ts`.

---

### BUG-051: Orchestrator Request Validation & IPC Radius Query Sanitization
- **ID:** `BUG-051`
- **Severity:** High
- **Category:** API / Robustness
- **Files Modified:**
  - `src/main/agents/parentAgent.ts`
  - `src/main/ipc/orchestrator.handler.ts`
  - `src/server/index.ts`
- **Description:** `ParentAgent.generate` threw unhandled `TypeError: Cannot read properties of undefined (reading 'rawPrompt')` when invoked with null/empty request payloads. IPC `GRAPH_QUERY_RADIUS` did not sanitize non-finite or `NaN` coordinates or negative radii.
- **Root Cause:** Lack of defensive object and number validation on agent entry points and IPC handlers.
- **Fix Applied:** Added defensive guards in `ParentAgent.generate`, sanitized numeric coordinates and clamped radius within `[1, 500]` in `orchestrator.handler.ts`, and validated request body in `src/server/index.ts`.
- **Test Verification:** Verified by `tests/round8AuditFixes.test.ts`.



