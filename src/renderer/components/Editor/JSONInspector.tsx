import { useState, useEffect } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useUIStore } from '../../store/uiStore';

export const JSONInspector = () => {
  const { sceneGraph } = useWorldStore();
  const { jsonInspectorOpen, toggleJsonInspector } = useUIStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!jsonInspectorOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggleJsonInspector();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [jsonInspectorOpen, toggleJsonInspector]);

  if (!sceneGraph || !jsonInspectorOpen) return null;

  const handleCopy = (): void => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(JSON.stringify(sceneGraph, null, 2))
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {
          useUIStore.getState().showNotification('Failed to copy JSON to clipboard', 3000, 'warning');
        });
    }
  };

  return (
    <div className="border border-gray-800 rounded-xl bg-gray-900/95 backdrop-blur-xl shadow-2xl overflow-hidden text-xs max-w-2xl mx-auto z-35 pointer-events-auto">
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-900/90 border-b border-gray-800 select-none">
        <span className="font-semibold text-gray-200 flex items-center gap-2">
          <span className="text-blue-400">📋</span>
          <span>Scene Graph JSON ({sceneGraph.world?.name || 'World'})</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="text-gray-300 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[10px] font-medium border border-gray-750 transition"
          >
            {copied ? '✓ Copied!' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={toggleJsonInspector}
            className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded text-xs transition"
            title="Close JSON Inspector (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <pre className="p-3.5 bg-gray-950/95 text-emerald-400 max-h-72 overflow-auto font-mono text-[11px] leading-relaxed">
        {JSON.stringify(sceneGraph, null, 2)}
      </pre>
    </div>
  );
};
