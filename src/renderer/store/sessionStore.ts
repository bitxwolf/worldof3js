import { create } from 'zustand';

interface SessionState {
  hasUnsavedChanges: boolean;
  lastSavedTimestamp: number | null;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  recordSave: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  hasUnsavedChanges: false,
  lastSavedTimestamp: null,
  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),
  recordSave: () =>
    set({
      hasUnsavedChanges: false,
      lastSavedTimestamp: Date.now(),
    }),
}));
