import { useState, useEffect } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useUIStore } from '../../store/uiStore';

export const DebugPanel = () => {
  const [visible, setVisible] = useState(false);
  const { generatedCode, sceneGraph } = useWorldStore();
  const { telemetry } = useUIStore();
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!visible) return null;

  const charCount = sceneGraph?.characters?.length ?? 0;
  const objCount = sceneGraph?.objects?.length ?? 0;

  return (
    <div className="absolute top-14 right-4 z-50 w-80 bg-gray-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl text-xs text-white p-3 space-y-2 select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="font-semibold text-sm">⚙ Generation Debug</span>
        <button onClick={() => setVisible(false)} className="text-gray-400 hover:text-white">✕</button>
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between"><span className="text-gray-400">Poly count:</span><span>{telemetry.polyCount.toLocaleString()} tris</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Draw calls:</span><span>{telemetry.drawCalls}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Characters in graph:</span><span>{charCount}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Objects in graph:</span><span>{objCount}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Code length:</span><span>{generatedCode?.length ?? 0} chars</span></div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-white/10">
        <button
          onClick={() => setShowCode(v => !v)}
          className="flex-1 px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors"
        >
          {showCode ? 'Hide Code' : 'View Generated Code'}
        </button>
        <button
          onClick={() => { if (generatedCode) { navigator.clipboard.writeText(generatedCode); } }}
          className="px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-[11px] font-medium transition-colors"
        >
          Copy
        </button>
      </div>

      {showCode && (
        <pre className="mt-2 max-h-60 overflow-auto bg-black/80 rounded-lg p-2 text-[10px] text-emerald-400 font-mono border border-white/5">
          {generatedCode || '// No code generated yet'}
        </pre>
      )}
    </div>
  );
};
