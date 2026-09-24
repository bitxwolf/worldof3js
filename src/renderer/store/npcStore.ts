import { create } from 'zustand';
import type { Character } from '../../shared/schema/sceneGraph.schema';

interface NPCMessage {
  sender: 'player' | 'npc';
  text: string;
}

interface NPCState {
  activeNPC: Character | null;
  dialogueHistory: Record<string, NPCMessage[]>;
  setActiveNPC: (npc: Character | null) => void;
  addDialogueMessage: (npcId: string, message: NPCMessage) => void;
  clearHistory: (npcId: string) => void;
}

export const useNPCStore = create<NPCState>((set) => ({
  activeNPC: null,
  dialogueHistory: {},
  setActiveNPC: (activeNPC) => set({ activeNPC }),
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
