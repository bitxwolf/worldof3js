import { useState } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useUIStore } from '../../store/uiStore';

export const JSONInspector = () => {
  const { sceneGraph } = useWorldStore();
  const { jsonInspectorOpen, toggleJsonInspector } = useUIStore();
  const [copied, setCopied] = useState(false);

  if (!sceneGraph) return null;

  const handleCopy = (): void => {
    navigator.clipboard.writeText(JSON.stringify(sceneGraph, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-gray-800 rounded-xl bg-gray-900/90 overflow-hidden text-xs">
      <div
        onClick={toggleJsonInspector}
        className="flex items-center justify-between px-3 py-2 bg-gray-900 cursor-pointer select-none hover:bg-gray-850"
      >
        <span className="font-semibold text-gray-300 flex items-center gap-2">
          <span>{jsonInspectorOpen ? '▼' : '▶'}</span>
          <span>Scene Graph JSON ({sceneGraph.world?.name || 'World'})</span>
        </span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleCopy}
            className="text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800 text-[10px]"
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {jsonInspectorOpen && (
        <pre className="p-3 bg-gray-950 text-emerald-400 max-h-80 overflow-auto font-mono text-[11px] leading-relaxed border-t border-gray-800">
          {JSON.stringify(sceneGraph, null, 2)}
        </pre>
      )}
    </div>
  );
};
