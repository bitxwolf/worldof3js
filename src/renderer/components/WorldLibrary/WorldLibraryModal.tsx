import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import { useSessionStore } from '../../store/sessionStore';
import type { SavedWorld } from '../../../shared/ipc.types';

export const WorldLibraryModal = () => {
  const { isLibraryOpen, closeLibrary, showNotification } = useUIStore();
  const { sceneGraph, flags, playerPosition, setSceneGraph, setGeneratedCode } = useWorldStore();
  const { recordSave } = useSessionStore();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isLibraryOpen) return null;

  const handleSave = async () => {
    if (!sceneGraph) {
      showNotification('No active world to save.', 3000, 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      const payload: SavedWorld = {
        name: sceneGraph.world.name,
        timestamp: Date.now(),
        sceneGraph,
        flags,
        playerPosition,
      };

      if (window.electronAPI?.saveWorld) {
        const res = await window.electronAPI.saveWorld(payload);
        if (res.success && res.data) {
          recordSave();
          showNotification(`World saved: ${res.data}`, 4000, 'success');
        } else if (!res.success) {
          showNotification(`Save error: ${res.error.message}`, 4000, 'warning');
        }
      } else {
        // Browser fallback: trigger JSON download
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sceneGraph.world.name || 'world'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        recordSave();
        showNotification('World JSON downloaded.', 4000, 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Save failed: ${msg}`, 4000, 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoad = async () => {
    try {
      setIsProcessing(true);
      if (window.electronAPI?.loadWorld) {
        const res = await window.electronAPI.loadWorld();
        if (res.success && res.data?.sceneGraph) {
          setSceneGraph(res.data.sceneGraph);
          setGeneratedCode(null);
          showNotification(`World loaded: ${res.data.name}`, 4000, 'success');
          closeLibrary();
        } else if (!res.success) {
          showNotification(`Load error: ${res.error.message}`, 4000, 'warning');
        }
      } else {
        // Browser fallback: file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const data = JSON.parse(text) as SavedWorld;
            if (data.sceneGraph) {
              setSceneGraph(data.sceneGraph);
              setGeneratedCode(null);
              showNotification(`World loaded: ${data.name || file.name}`, 4000, 'success');
              closeLibrary();
            } else {
              showNotification('Invalid world file.', 4000, 'warning');
            }
          } catch {
            showNotification('Failed to parse world file.', 4000, 'warning');
          }
        };
        input.click();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Load failed: ${msg}`, 4000, 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportHTML = async () => {
    if (!sceneGraph) {
      showNotification('No active world to export.', 3000, 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      if (window.electronAPI?.exportHtml) {
        const res = await window.electronAPI.exportHtml(sceneGraph);
        if (res.success) {
          showNotification(`Exported HTML: ${res.data}`, 5000, 'success');
        } else {
          showNotification(`Export error: ${res.error.message}`, 4000, 'warning');
        }
      } else {
        showNotification('HTML export requires the Electron desktop app.', 4000, 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Export failed: ${msg}`, 4000, 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>📚</span> World Library & Export
          </h2>
          <button
            type="button"
            onClick={closeLibrary}
            className="text-gray-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {sceneGraph ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-1">
              <div className="text-xs font-semibold text-indigo-300">
                Active World: {sceneGraph.world.name}
              </div>
              <div className="text-[11px] text-gray-400">
                {sceneGraph.world.biome} · {sceneGraph.world.timeOfDay} · {sceneGraph.characters.length} NPCs
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic p-3 bg-gray-900/40 rounded-xl border border-gray-800/60">
              No active world generated yet.
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 pt-2">
            <button
              type="button"
              disabled={isProcessing || !sceneGraph}
              onClick={handleSave}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>💾</span> Save Current World to JSON
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleLoad}
              className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>📂</span> Load World from JSON File
            </button>

            <button
              type="button"
              disabled={isProcessing || !sceneGraph}
              onClick={handleExportHTML}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>🌐</span> Export Standalone HTML (Zero Dependencies)
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-800 text-right">
          <button
            type="button"
            onClick={closeLibrary}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-850 text-gray-300 rounded-xl text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
