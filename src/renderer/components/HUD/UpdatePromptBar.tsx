import { useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useUIStore } from '../../store/uiStore';
import { transport } from '../../../shared/transport';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { SceneGraph } from '../../../shared/schema/sceneGraph.schema';

export const UpdatePromptBar = ({
  onApplyPatch,
}: {
  onApplyPatch?: (partial: unknown) => void;
}) => {
  const [prompt, setPrompt] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const { sceneGraph, patchSceneGraph } = useWorldStore();
  const { showNotification } = useUIStore();

  const handleUpdate = useCallback(async () => {
    if (!prompt.trim() || !sceneGraph || isUpdating) return;

    try {
      setIsUpdating(true);
      showNotification('Synthesizing world modifications...', 3000, 'info');

      const res = await transport.call<Partial<SceneGraph>>(IPC_CHANNELS.LLM_UPDATE_WORLD, {
        currentGraph: sceneGraph,
        updatePrompt: prompt.trim(),
      });

      if (!res.success) {
        throw new Error(res.error.message);
      }

      const partial = res.data;
      patchSceneGraph(partial);
      if (onApplyPatch) {
        onApplyPatch(partial);
      }

      showNotification('World updated successfully!', 4000, 'success');
      setPrompt('');
      setIsExpanded(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Update failed: ${msg}`, 5000, 'warning');
    } finally {
      setIsUpdating(false);
    }
  }, [prompt, sceneGraph, isUpdating, patchSceneGraph, onApplyPatch, showNotification]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleUpdate();
    }
  };

  if (!sceneGraph) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div
        className={`bg-gray-950/85 backdrop-blur-md border border-gray-800 transition-all rounded-2xl shadow-2xl overflow-hidden flex items-center ${
          isExpanded ? 'w-[480px] p-2' : 'w-auto px-4 py-2 hover:border-gray-700 cursor-pointer'
        }`}
      >
        {!isExpanded ? (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-2 text-xs text-gray-300 font-medium hover:text-white"
          >
            <span>✨</span>
            <span>Modify World Live</span>
            <kbd className="bg-gray-800/80 px-1.5 py-0.5 rounded text-[10px] text-gray-400 font-mono">
              click
            </kbd>
          </button>
        ) : (
          <div className="w-full flex items-center gap-2">
            <span className="text-sm pl-1 select-none">✨</span>
            <input
              type="text"
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isUpdating}
              placeholder="e.g. Add a glowing campfire near the tree..."
              className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleUpdate}
              disabled={!prompt.trim() || isUpdating}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              {isUpdating ? <span className="animate-spin text-[10px]">⚙️</span> : null}
              <span>Apply</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white text-xs px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
