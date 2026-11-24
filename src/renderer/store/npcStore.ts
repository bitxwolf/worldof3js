import { create } from 'zustand';
import type { Character } from '../../shared/schema/sceneGraph.schema';

export interface NPCMessage {
  sender: 'player' | 'npc';
  text: string;
}

export interface NPCState {
  activeNPC: Character | null;
  dialogueHistory: Record<string, NPCMessage[]>;
  dialogueOpen: boolean;
  currentBranch: string | null;
  activeQuestId: string | null;
  branchOptions: Record<string, string[]>;
  setActiveNPC: (npc: Character | null) => void;
  addDialogueMessage: (npcId: string, message: NPCMessage) => void;
  clearHistory: (npcId: string) => void;
  setDialogueOpen: (open: boolean) => void;
  setCurrentBranch: (branch: string | null) => void;
  setActiveQuestId: (questId: string | null) => void;
  setBranchOptions: (npcId: string, options: string[]) => void;
  resetDialogueState: (npcId?: string) => void;
}

export const useNPCStore = create<NPCState>((set) => ({
  activeNPC: null,
  dialogueHistory: {},
  dialogueOpen: false,
  currentBranch: null,
  activeQuestId: null,
  branchOptions: {},
  setActiveNPC: (activeNPC) =>
    set({
      activeNPC,
      // Reset branch state whenever switching NPCs or closing dialogue to prevent branch leaks
      currentBranch: null,
      activeQuestId: null,
      ...(activeNPC === null ? { dialogueOpen: false } : {}),
    }),
  setDialogueOpen: (dialogueOpen) =>
    set({
      dialogueOpen,
      ...(dialogueOpen ? {} : { currentBranch: null }),
    }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setActiveQuestId: (activeQuestId) => set({ activeQuestId }),
  setBranchOptions: (npcId, options) =>
    set((state) => ({
      branchOptions: {
        ...state.branchOptions,
        [npcId]: options,
      },
    })),
  resetDialogueState: (npcId) =>
    set((state) => ({
      currentBranch: null,
      activeQuestId: null,
      ...(npcId
        ? {
            dialogueHistory: {
              ...state.dialogueHistory,
              [npcId]: [],
            },
            branchOptions: {
              ...state.branchOptions,
              [npcId]: [],
            },
          }
        : {
            dialogueHistory: {},
            branchOptions: {},
          }),
    })),
  addDialogueMessage: (npcId, message) =>
    set((state) => ({
      dialogueHistory: {
        ...state.dialogueHistory,
        [npcId]: [...(state.dialogueHistory[npcId] || []).slice(-9), message],
      },
    })),
  clearHistory: (npcId) =>
    set((state) => ({
      dialogueHistory: {
        ...state.dialogueHistory,
        [npcId]: [],
      },
    })),
}));
