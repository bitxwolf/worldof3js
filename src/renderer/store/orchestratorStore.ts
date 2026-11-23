import { create } from 'zustand';
import type { OrchestratorProgressEvent, SelectionContext, GenerationMode } from '../../shared/agents/agentTypes';
import type { CompiledWorldResult } from '../../shared/ipc.types';
import { IPC_CHANNELS } from '../../shared/constants';
import { transport } from '../../shared/transport';
import { isOk } from '../../shared/ipc.types';

export interface OrchestratorState {
  status: 'idle' | 'generating' | 'editing' | 'error';
  currentSessionId: string | null;
  progress: OrchestratorProgressEvent | null;
  logs: string[];
  activeSelection: SelectionContext | null;
  error: string | null;
  lastResult: CompiledWorldResult | null;
  generateWorld: (
    prompt: string,
    mode?: GenerationMode,
    options?: {
      document?: string;
      imageDescriptions?: Array<{ tag: 'character' | 'scene' | 'texture' | 'map'; description: string }>;
    }
  ) => Promise<CompiledWorldResult | null>;
  editSelection: (updatePrompt: string) => Promise<CompiledWorldResult | null>;
  setActiveSelection: (sel: SelectionContext | null) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  status: 'idle',
  currentSessionId: null,
  progress: null,
  logs: [],
  activeSelection: null,
  error: null,
  lastResult: null,

  generateWorld: async (
    prompt: string,
    mode: GenerationMode = 'detailed',
    options?: {
      document?: string;
      imageDescriptions?: Array<{ tag: 'character' | 'scene' | 'texture' | 'map'; description: string }>;
    }
  ): Promise<CompiledWorldResult | null> => {
    set({ status: 'generating', progress: null, error: null });

    let result = await transport.call<CompiledWorldResult>(IPC_CHANNELS.ORCHESTRATOR_GENERATE, {
      userPrompt: prompt,
      rawPrompt: prompt,
      mode,
      document: options?.document,
      imageDescriptions: options?.imageDescriptions,
    });

    if (!isOk(result) && typeof window !== 'undefined' && typeof (window as any).electronAPI?.orchestrate === 'function') {
      result = await (window as any).electronAPI.orchestrate({
        userPrompt: prompt,
        rawPrompt: prompt,
        mode,
        document: options?.document,
        imageDescriptions: options?.imageDescriptions,
      });
    }

    if (isOk(result)) {
      set({
        status: 'idle',
        lastResult: result.data,
        currentSessionId: result.data.sessionId,
        error: null,
      });
      return result.data;
    } else {
      set({
        status: 'error',
        error: result.error.message,
      });
      return null;
    }
  },

  editSelection: async (updatePrompt: string): Promise<CompiledWorldResult | null> => {
    let { currentSessionId, activeSelection } = get();
    if (!currentSessionId) {
      currentSessionId = 'default-session';
      set({ currentSessionId });
    }
    if (!activeSelection) {
      const errMsg = 'No active selection to edit';
      set({ status: 'error', error: errMsg });
      return null;
    }

    set({ status: 'editing', error: null });

    let result = await transport.call<CompiledWorldResult>(IPC_CHANNELS.ORCHESTRATOR_EDIT_SELECTION, {
      sessionId: currentSessionId,
      selection: activeSelection,
      updateRequest: updatePrompt,
    });

    if (!isOk(result) && typeof window !== 'undefined' && typeof (window as any).electronAPI?.editSelection === 'function') {
      result = await (window as any).electronAPI.editSelection({
        sessionId: currentSessionId,
        selection: activeSelection,
        updateRequest: updatePrompt,
      });
    }

    if (isOk(result)) {
      set({
        status: 'idle',
        lastResult: result.data,
        currentSessionId: result.data.sessionId || currentSessionId,
        error: null,
      });
      return result.data;
    } else {
      set({
        status: 'error',
        error: result.error.message,
      });
      return null;
    }
  },

  setActiveSelection: (activeSelection: SelectionContext | null) => {
    set({ activeSelection });
  },

  clearSelection: () => {
    set({ activeSelection: null });
  },

  reset: () => {
    set({
      status: 'idle',
      currentSessionId: null,
      progress: null,
      logs: [],
      activeSelection: null,
      error: null,
      lastResult: null,
    });
  },
}));

// Subscribe to progress via transport.onOrchestratorProgress or window.electronAPI.onOrchestratorProgress
if (typeof window !== 'undefined') {
  const onProgress = (event: OrchestratorProgressEvent) => {
    if (!event) return;
    useOrchestratorStore.setState((state) => ({
      progress: event,
      logs: event.message
        ? [...state.logs, `[${event.agentId}] ${event.message}`]
        : state.logs,
    }));
  };

  if (typeof (transport as any).onOrchestratorProgress === 'function') {
    (transport as any).onOrchestratorProgress(onProgress);
  } else if (typeof (window as any).electronAPI?.onOrchestratorProgress === 'function') {
    (window as any).electronAPI.onOrchestratorProgress(onProgress);
  }
}
