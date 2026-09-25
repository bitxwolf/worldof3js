// DEPRECATED — replaced by UpdatePromptBar. Do not delete.
import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';

export const SmartEditBar = () => {
  const [editText, setEditText] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { sceneGraph } = useWorldStore();
  const { addIpcLog, showNotification, selectedNode } = useUIStore();

  // Focus with / key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const handleDone = (e: Event) => {
      const detail = (e as CustomEvent<{ success: boolean; error?: string }>).detail;
      if (detail.success) {
        setLastResult('Edit applied ✓');
        showNotification('Smart edit applied successfully', 2500, 'success');
      } else {
        setLastResult(`Edit failed: ${detail.error ?? 'Unknown error'}`);
        showNotification(`Edit failed: ${detail.error ?? 'Unknown error'}`, 3000, 'error');
      }
      setIsApplying(false);
    };
    window.addEventListener('engine:smart-edit-done', handleDone);
    return () => window.removeEventListener('engine:smart-edit-done', handleDone);
  }, [showNotification]);

  // Only show when a world exists
  if (!sceneGraph) return null;

  const handleApply = async () => {
    if (!editText.trim() || isApplying) return;
    setIsApplying(true);
    setLastResult(null);
    addIpcLog(`[SMART_EDIT] Applying: "${editText}"`, 'info');

    try {
      // For now, dispatch a custom event that ThreeViewport can handle
      // The full LLM integration will be added when API config is wired
      window.dispatchEvent(new CustomEvent('engine:smart-edit', {
        detail: { instruction: editText }
      }));
      setLastResult('Sending edit...');
      setEditText('');
    } catch (err) {
      setLastResult(`Failed: ${String(err)}`);
      showNotification('Edit failed — check console', 3000, 'error');
      setIsApplying(false);
    }
  };

  const selectedName = selectedNode?.name ? `Selected: ${selectedNode.name} | ` : '';

  return (
    <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4">
      <div className="flex items-center gap-2 bg-gray-950/90 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
        <span className="text-purple-400 text-sm">✏️</span>
        {selectedName && (
          <span className="text-[10px] text-purple-300 font-mono whitespace-nowrap">{selectedName}</span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          placeholder="Make the sky darker, add grass, glow brighter..."
          disabled={isApplying}
          className="flex-1 bg-transparent text-white text-xs placeholder:text-gray-500 outline-none disabled:opacity-50"
        />
        <button
          onClick={handleApply}
          disabled={!editText.trim() || isApplying}
          className="px-3 py-1 rounded-lg text-[11px] font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {isApplying ? '...' : 'Apply Edit'}
        </button>
      </div>
      {lastResult && (
        <div className="text-center text-[10px] text-gray-400 mt-1">{lastResult}</div>
      )}
    </div>
  );
};
