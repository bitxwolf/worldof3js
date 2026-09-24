import { useEffect } from 'react';
import { useInventoryStore } from '../../store/inventoryStore';

const SLOT_COUNT = 8;

export const InventoryBar = () => {
  const { items, selectedSlot, selectSlot } = useInventoryStore();

  // Keyboard shortcut listener: Keys 1 to 8 select corresponding slot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const keyNum = parseInt(e.key, 10);
      if (keyNum >= 1 && keyNum <= SLOT_COUNT) {
        selectSlot(keyNum - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectSlot]);

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md border border-gray-800/90 p-1.5 rounded-2xl shadow-2xl">
        {Array.from({ length: SLOT_COUNT }).map((_, idx) => {
          const item = items[idx];
          const isSelected = selectedSlot === idx;

          return (
            <div
              key={idx}
              onClick={() => selectSlot(idx)}
              title={item ? `${item.name}: ${item.description || ''}` : `Empty Slot ${idx + 1}`}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 border ${
                isSelected
                  ? 'border-indigo-400 bg-indigo-950/70 shadow-lg shadow-indigo-500/20 scale-105'
                  : item
                  ? 'border-gray-700 bg-gray-900/80 hover:border-gray-500'
                  : 'border-gray-800/50 bg-gray-950/40 hover:border-gray-700/60'
              }`}
            >
              {/* Slot hotkey number badge */}
              <span className="absolute top-0.5 left-1 text-[9px] font-mono text-gray-500 select-none">
                {idx + 1}
              </span>

              {/* Item representation */}
              {item ? (
                <div className="flex flex-col items-center">
                  <span className="text-base select-none leading-none">
                    {item.icon || '🎒'}
                  </span>
                  <span className="text-[8px] text-gray-300 max-w-[38px] truncate mt-0.5 leading-none select-none">
                    {item.name}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
