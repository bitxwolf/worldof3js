# Orbis v2 Multi-Agent World Generation: Handoff & Dispatch Plan

> **For the Next Agent / Chat Session:**
> Read this entire document first. The backend multi-agent pipeline is **100% complete, passing typecheck, and all 166 tests pass**.
> Follow the instructions in Section 3 to launch the remaining tasks using parallel subagents.

---

## 1. Executive Summary & Codebase Status

- **Working Directory:** `c:\antigravity\world of 3js`
- **TypeScript Status:** `npm run typecheck` passes with **0 errors**.
- **Unit Test Status:** `npm test` passes with **17 test suites (166 tests) passing**.
- **Git Branch:** `main` (clean working tree, all work committed up to commit `5bcd7cd`).

### What Was Built & Verified (Completed)

| Module / Layer | Files Created / Modified | Status |
|---|---|---|
| **Wave 0: Shared Types & Contracts** | `src/shared/agents/agentTypes.ts`<br>`src/shared/agents/agentSchemas.ts`<br>`src/shared/graph/graphTypes.ts`<br>`src/shared/storage/IWorldStorageAdapter.ts`<br>`src/shared/storage/IGraphStore.ts`<br>`src/shared/config/modelConfig.ts`<br>`src/shared/constants.ts`<br>`src/shared/ipc.types.ts`<br>`electron.vite.config.ts`<br>`package.json` (`graphology`, `better-sqlite3`) | ✅ **DONE** |
| **Wave 1: Storage Layer** | `src/shared/storage/InMemoryAdapters.ts`<br>`src/main/storage/db.ts` (SQLite WAL mode + tables)<br>`src/main/storage/SqliteAdapters.ts` | ✅ **DONE** |
| **Wave 1: LLM Abstraction** | `src/main/llm/callLLM.ts` (unified Anthropic SDK + OpenAI/OpenRouter, per-agent model resolution, NO hardcoded fallbacks) | ✅ **DONE** |
| **Wave 1: WorldGraph Memory & Spatial** | `src/main/memory/WorldGraph.ts` (Graphology + SQLite persistence)<br>`src/main/memory/sliceBuilders.ts` (compact slice builders for each child)<br>`src/main/memory/spatial.ts` (radius queries)<br>`src/main/memory/layout.ts` (seeded compass placement & scattering)<br>`src/main/memory/sessionManager.ts` | ✅ **DONE** |
| **Wave 1: Prompts & Child Runner** | `src/main/agents/prompts/parent.system.md`<br>`src/main/agents/prompts/story.system.md`<br>`src/main/agents/prompts/character.system.md`<br>`src/main/agents/prompts/world.system.md`<br>`src/main/agents/prompts/npc.system.md`<br>`src/main/agents/prompts/quest.system.md`<br>`src/main/agents/prompts/dialogue.system.md`<br>`src/main/agents/runChildAgent.ts` | ✅ **DONE** |
| **Wave 2: Child Agent Wrappers** | `src/main/agents/storyAgent.ts`<br>`src/main/agents/characterAgent.ts`<br>`src/main/agents/worldAgent.ts`<br>`src/main/agents/npcAgent.ts`<br>`src/main/agents/questAgent.ts`<br>`src/main/agents/dialogueAgent.ts` | ✅ **DONE** |
| **Wave 2: Parent Orchestrator & Compiler** | `src/main/agents/conflictChecks.ts` (deterministic taxonomy checks)<br>`src/main/agents/parentAgent.ts` (pipeline, retries, layout, editSelection)<br>`src/main/agents/compileSceneGraph.ts` (WorldGraph -> SceneGraphSchema)<br>`src/main/ipc/orchestrator.handler.ts` (IPC handler core) | ✅ **DONE** |

---

## 2. What Remains To Be Done

The core generation pipeline is complete. The remaining work connects the backend to the frontend UI and Three.js viewport:

1. **Task A: IPC & HTTP Transport Wiring** (Plumbing `orchestrator.handler.ts` into main index, preload, typings, transport, Express server).
2. **Task B: Renderer Orchestrator Store & Settings UI** (`orchestratorStore.ts`, `generationMode` in `uiStore`, and `AgentOverridesSection.tsx` in `SettingsModal.tsx`).
3. **Task C: Circle-to-Select Tool** (Three.js ground raycast circle selection in `ThreeViewport.tsx` to retrieve subgraphs and trigger scoped edits).
4. **Task D: Prompt Surfaces & Viewport World Generation Trigger** (Updating `SpotlightPromptBar.tsx` and `PromptInput.tsx` with Quick/Detailed mode, progress bar, `isCustomWorldActive=true`, and per-region elevation).
5. **Task E: Integration Tests & Model Name Audit** (Unit tests for WorldGraph/ParentAgent, grep audit ensuring no hardcoded model names).

---

## 3. Parallel Subagents Scene: Exact Dispatch Plan

When you start the new chat, provide this prompt to the agent:

> *"Please read `ORBIS_V2_HANDOFF_AND_DISPATCH_PLAN.md` and immediately dispatch the parallel subagents outlined in Section 3 to finish the remaining tasks."*

The agent should launch these **5 subagents in parallel**:

```
                              ┌──────────────────────────────────────────────┐
                              │            NEW CHAT CONTROLLER               │
                              └──────────────────────┬───────────────────────┘
                                                     │
          ┌──────────────────┬───────────────────────┼───────────────────────┬──────────────────┐
          ▼                  ▼                       ▼                       ▼                  ▼
    [Subagent A]       [Subagent B]            [Subagent C]            [Subagent D]       [Subagent E]
    Gemini Flash       Gemini Flash            Claude Opus             Claude Opus        Gemini Flash
    IPC & HTTP         Store & Settings        Circle-to-Select        Prompt Surfaces    Tests & Audit
    Plumbing (T9)      UI (T10+T11)            Tool (T12)              & Fixes (T13+T14)  (T15)
```

---

### Subagent A (Model: `flash`) — IPC & HTTP Transport Wiring (T9)
**File Ownership:**
- `src/main/index.ts`
- `src/main/preload.ts`
- `src/renderer/electron.d.ts`
- `src/shared/transport.ts`
- `src/server/index.ts`

**Prompt Specification:**
```markdown
You are Subagent A for Orbis v2. Codebase: `c:\antigravity\world of 3js`.
Your task is to wire `src/main/ipc/orchestrator.handler.ts` into the runtime transport layer.

1. `src/main/index.ts`:
   - Import `registerOrchestratorHandlers` from `./ipc/orchestrator.handler`.
   - Call `registerOrchestratorHandlers(() => mainWindow);` alongside the other handler registrations.

2. `src/main/preload.ts`:
   - In `contextBridge.exposeInMainWorld('electronAPI', { ... })`, add:
     - `orchestrate: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_GENERATE, payload)`
     - `editSelection: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATOR_EDIT_SELECTION, payload)`
     - `queryRadius: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.GRAPH_QUERY_RADIUS, payload)`
     - `onOrchestratorProgress: (cb: (evt: unknown) => void) => { ipcRenderer.on(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, (_e, evt) => cb(evt)); return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.ORCHESTRATOR_PROGRESS); }`

3. `src/renderer/electron.d.ts`:
   - Add matching type definitions to the `electronAPI` interface using types from `../shared/ipc.types`.

4. `src/shared/transport.ts`:
   - Add cases in `transport.call`:
     - `IPC_CHANNELS.ORCHESTRATOR_GENERATE` -> `window.electronAPI.orchestrate(payload)` in Electron, or `fetchPost('/api/orchestrator/generate', payload)` in Browser.
     - `IPC_CHANNELS.ORCHESTRATOR_EDIT_SELECTION` -> `window.electronAPI.editSelection(payload)` in Electron, or `fetchPost('/api/orchestrator/edit-selection', payload)` in Browser.
     - `IPC_CHANNELS.GRAPH_QUERY_RADIUS` -> `window.electronAPI.queryRadius(payload)` in Electron, or `fetchPost('/api/graph/query-radius', payload)` in Browser.

5. `src/server/index.ts`:
   - Add Express POST endpoints `/api/orchestrator/generate`, `/api/orchestrator/edit-selection`, and `/api/graph/query-radius` mirroring existing routes.

Run `npm run typecheck` when done. Do not touch any other files.
```

---

### Subagent B (Model: `flash`) — Renderer Store & Settings UI (T10 + T11)
**File Ownership:**
- `src/renderer/store/orchestratorStore.ts` (CREATE)
- `src/renderer/store/uiStore.ts` (MODIFY)
- `src/renderer/components/Settings/AgentOverridesSection.tsx` (CREATE)
- `src/renderer/components/Settings/SettingsModal.tsx` (MODIFY)

**Prompt Specification:**
```markdown
You are Subagent B for Orbis v2. Codebase: `c:\antigravity\world of 3js`.
Your task is to create the Zustand orchestratorStore and add the agent model override UI.

1. `src/renderer/store/orchestratorStore.ts`:
   - State: `status: 'idle' | 'generating' | 'editing' | 'error'`, `currentSessionId: string | null`, `progress: OrchestratorProgressEvent | null`, `logs: string[]`, `activeSelection: SelectionContext | null`.
   - Actions:
     - `generateWorld(prompt: string, mode?: GenerationMode): Promise<CompiledWorldResult | null>` -> invokes transport.call(IPC_CHANNELS.ORCHESTRATOR_GENERATE, { ... })
     - `editSelection(updatePrompt: string): Promise<CompiledWorldResult | null>` -> invokes transport.call(IPC_CHANNELS.ORCHESTRATOR_EDIT_SELECTION, { ... })
     - `setActiveSelection(sel: SelectionContext | null): void`
     - `reset(): void`
   - Listen to `onOrchestratorProgress` to update `progress` and append logs.

2. `src/renderer/store/uiStore.ts`:
   - Add `generationMode: 'detailed' | 'quick'` (default: `'detailed'`).
   - Add action `setGenerationMode: (mode: 'detailed' | 'quick') => void`.

3. `src/renderer/components/Settings/AgentOverridesSection.tsx`:
   - Create a collapsible accordion inside Settings.
   - Rows for `parent`, `story`, `character`, `world`, `npc`, `quest`, `dialogue`.
   - Toggle per agent to override model.
   - Text input for custom model name (e.g., `claude-3-7-sonnet-20250219`, `gpt-4o`).
   - Display `FRONTIER_MODEL_HINTS.complex_task_note` as helpful tooltip or subtle hint.

4. `src/renderer/components/Settings/SettingsModal.tsx`:
   - Mount `AgentOverridesSection` inside the modal.
   - Save overrides to `AppSettings.agentModelOverrides` when changed.

Run `npm run typecheck` when done. Do not touch other files.
```

---

### Subagent C (Model: `pro`) — Circle-to-Select Tool & Viewport Integration (T12)
**File Ownership:**
- `src/renderer/components/Viewport/CircleSelectTool.ts` (CREATE)
- `src/renderer/components/Viewport/ThreeViewport.tsx` (MODIFY - circle select interaction)

**Prompt Specification:**
```markdown
You are Subagent C for Orbis v2. Codebase: `c:\antigravity\world of 3js`.
Your task is to implement the Three.js Circle-to-Select tool for spatial editing in the 3D viewport.

1. `src/renderer/components/Viewport/CircleSelectTool.ts`:
   - Manages a circular 3D visual reticle (Three.js RingGeometry or LineLoop) positioned on the terrain (y slightly offset to prevent z-fighting).
   - Raycasts mouse to terrain plane / ground mesh to position the circle `(center.x, center.z)`.
   - Mouse wheel or drag while holding a modifier (or dedicated tool mode) adjusts radius `(radiusWorldUnits)`.
   - Queries `window.electronAPI.queryRadius` (or transport.call) for `(x, z, radius)` to collect nodes inside the radius.
   - Assembles a `SelectionContext`:
     ```typescript
     {
       center: { x, z },
       radiusWorldUnits,
       regions: [...],
       npcs: [...],
       landmarks: [...],
       activeQuests: [...],
       biome: currentBiome
     }
     ```
   - Sets `orchestratorStore.getState().setActiveSelection(selectionContext)`.

2. `src/renderer/components/Viewport/ThreeViewport.tsx`:
   - Add a circle selection tool toggle button in the viewport controls overlay (or hotkey `C`).
   - When active, disable orbit controls rotation on left click so the user can drag/click on terrain to select.
   - Show circle reticle on terrain.
   - When selection completes, trigger focus on `SpotlightPromptBar` with a badge "Selection Active: R=XX units, N entities".

Run `npm run typecheck` when done. Do not touch other files.
```

---

### Subagent D (Model: `pro`) — Prompt Surfaces & Viewport World Generation Trigger (T13 + T14)
**File Ownership:**
- `src/renderer/components/Viewport/SpotlightPromptBar.tsx` (MODIFY)
- `src/renderer/components/Editor/PromptInput.tsx` (MODIFY)
- `src/renderer/components/Viewport/ThreeViewport.tsx` (MODIFY - elevation and biome loading)

**Prompt Specification:**
```markdown
You are Subagent D for Orbis v2. Codebase: `c:\antigravity\world of 3js`.
Your task is to wire the prompt bars to the new multi-agent orchestrator and ensure all v1 fixes (Fix 3, 4, 5) are respected.

1. `src/renderer/components/Viewport/SpotlightPromptBar.tsx`:
   - Add a Quick / Detailed mode pill selector (`uiStore.generationMode`).
   - If `activeSelection` in `orchestratorStore` exists:
     - Show a badge: `Editing Selection (radius: Xm)` with a clear `[x]` button.
     - On Enter / Submit: call `orchestratorStore.editSelection(prompt)`.
   - If no selection:
     - On Enter / Submit: call `orchestratorStore.generateWorld(prompt, generationMode)`.
   - During generation: show live progress bar (% complete) and agent badge (`Story...`, `World...`, `NPC...`).
   - On completion: load the returned `CompiledWorldResult.sceneGraph` into `useWorldStore`.

2. Critical Fixes Integration:
   - **Fix 4**: Set `useWorldStore.getState().isCustomWorldActive = true` BEFORE calling `parseWorld()` / loading compiled world.
   - **Fix 3**: Only call `setActiveBiome(result.activeBiome)` from the World Agent output path (do not let prompt heuristic override compiled biome).
   - **Fix 5**: In terrain generation (`ThreeViewport.tsx`), use `result.regionElevations` to calculate per-region elevation amplitude via inverse-distance weighting instead of a single global amplitude.

3. `src/renderer/components/Editor/PromptInput.tsx`:
   - Mirror mode toggle and orchestrator status indicators.

Run `npm run typecheck` when done. Do not touch other files.
```

---

### Subagent E (Model: `flash`) — Integration Tests & Model Name Audit (T15)
**File Ownership:**
- `tests/worldGraph.test.ts` (CREATE)
- `tests/parentAgent.test.ts` (CREATE)

**Prompt Specification:**
```markdown
You are Subagent E for Orbis v2. Codebase: `c:\antigravity\world of 3js`.
Your task is to add unit tests for the multi-agent graph & orchestrator, and verify the model name audit.

1. `tests/worldGraph.test.ts`:
   - Test `InMemoryGraphStore` and `WorldGraph`:
     - Upserting story, faction, character, region, npc nodes.
     - Upserting directed edges (`MEMBER_OF`, `LOCATED_IN`, `GIVES_QUEST`).
     - Spatial radius queries returning nodes within distance.
     - Cascade deletion of nodes and their connected edges.

2. `tests/parentAgent.test.ts`:
   - Test `conflictChecks.ts`:
     - Missing faction reference produces `invalid_faction` conflict.
     - Dialogue line > 120 characters produces `dialogue_too_long` conflict.
     - Duplicate NPC name produces `duplicate_name` conflict.
   - Test `compileSceneGraph.ts`:
     - Compiles a mocked WorldGraph into a SceneGraph that passes `SceneGraphSchema.parse()`.

3. Model Name Audit:
   - Run grep across `src/main/agents/`, `src/main/llm/`, `src/shared/`: verify that NO hardcoded model names (like `claude-3-5-sonnet`) exist as fallbacks in runtime code. Fallbacks must come from user settings or throw `ModelNotConfiguredError`.

Run `npm test` and `npm run typecheck`. Ensure all tests pass.
```

---

## 4. Verification Checklist for Final Signoff

Once all 5 subagents report completion:
1. `npm run typecheck` -> Must output `0 errors`.
2. `npm test` -> All test suites (existing 17 + 2 new) must pass.
3. Grep check: `git grep -i "claude-3-5-sonnet" src/main/agents/ src/main/llm/` -> Must return 0 hits (no hardcoded model strings).
4. Run `git status` and commit all remaining frontend/test additions.
