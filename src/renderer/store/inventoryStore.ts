import { create } from 'zustand';

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

interface InventoryState {
  items: InventoryItem[];
  selectedSlot: number | null; // 0 to 7
  addItem: (item: InventoryItem) => boolean;
  removeItem: (id: string) => void;
  selectSlot: (slot: number | null) => void;
  getSelectedItem: () => InventoryItem | null;
  clearInventory: () => void;
}

const MAX_SLOTS = 8;

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  selectedSlot: null,

  addItem: (item) => {
    const { items } = get();
    if (items.length >= MAX_SLOTS) {
      return false; // inventory full
    }
    // Don't add duplicate item if already present
    if (items.some((i) => i.id === item.id)) {
      return true;
    }
    set({ items: [...items, item] });
    return true;
  },

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      selectedSlot:
        state.selectedSlot !== null && state.items[state.selectedSlot]?.id === id
          ? null
          : state.selectedSlot,
    })),

  selectSlot: (slot) =>
    set((state) => ({
      selectedSlot: state.selectedSlot === slot ? null : slot,
    })),

  getSelectedItem: () => {
    const { items, selectedSlot } = get();
    if (selectedSlot === null || selectedSlot < 0 || selectedSlot >= items.length) {
      return null;
    }
    return items[selectedSlot] ?? null;
  },

  clearInventory: () => set({ items: [], selectedSlot: null }),
}));
