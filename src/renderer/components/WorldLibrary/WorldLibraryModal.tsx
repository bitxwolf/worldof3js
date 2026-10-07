import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import { useSessionStore } from '../../store/sessionStore';
import type { SavedWorld } from '../../../shared/ipc.types';
import type { SceneGraph } from '../../../shared/schema/sceneGraph.schema';
import { SavedWorldSchema } from '../../../shared/schema/sceneGraph.schema';
import { generateStandaloneHtml } from '../../../shared/exportHtml';

interface SavedWorldEntry {
  id: string;
  name: string;
  timestamp: number;
  biome: string;
  characterCount: number;
  thumbnail?: string;
  data: SavedWorld;
}

const STORAGE_KEY = 'orbis_saved_worlds';

export const WorldLibraryModal = () => {
  const { isLibraryOpen, closeLibrary, showNotification } = useUIStore();
  const { sceneGraph, generatedCode, flags, playerPosition, setSceneGraph, setGeneratedCode } =
    useWorldStore();
  const { recordSave } = useSessionStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedWorlds, setSavedWorlds] = useState<SavedWorldEntry[]>([]);

  // Load saved worlds from localStorage on modal open
  useEffect(() => {
    if (!isLibraryOpen) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSavedWorlds(parsed);
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }, [isLibraryOpen]);

  if (!isLibraryOpen) return null;

  const getCanvasThumbnail = (): string | undefined => {
    try {
      const canvas = document.getElementById('threeCanvas') as HTMLCanvasElement | null;
      if (canvas) {
        return canvas.toDataURL('image/jpeg', 0.6);
      }
    } catch {
      // ignore toDataURL errors
    }
    return undefined;
  };

  const persistSavedWorlds = (entries: SavedWorldEntry[]) => {
    setSavedWorlds(entries);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // ignore quota errors
    }
  };

  const handleSave = async () => {
    if (!sceneGraph) {
      showNotification('No active world to save.', 3000, 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      const thumbnail = getCanvasThumbnail();
      const liveFlags = useWorldStore.getState().flags || flags || {};
      const livePlayerPos = useWorldStore.getState().playerPosition || playerPosition || [0, 1.7, 0];
      const payload: SavedWorld = {
        name: sceneGraph.world.name,
        timestamp: Date.now(),
        sceneGraph,
        generatedCode,
        flags: liveFlags,
        playerPosition: livePlayerPos,
      };

      // Add to internal saved worlds list
      const newEntry: SavedWorldEntry = {
        id: `world_${Date.now()}`,
        name: sceneGraph.world.name || 'Untitled World',
        timestamp: Date.now(),
        biome: sceneGraph.world.biome || 'custom',
        characterCount: sceneGraph.characters?.length || 0,
        thumbnail,
        data: payload,
      };

      const updatedList = [newEntry, ...savedWorlds.filter((w) => w.name !== payload.name)];
      persistSavedWorlds(updatedList);

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
        showNotification('World saved to library & downloaded.', 4000, 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Save failed: ${msg}`, 4000, 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadEntry = (entry: SavedWorldEntry) => {
    try {
      const worldData = entry.data;
      setSceneGraph(worldData.sceneGraph);
      setGeneratedCode(worldData.generatedCode ?? null);
      if (worldData.flags) {
        Object.entries(worldData.flags).forEach(([k, v]) => {
          useWorldStore.getState().setFlag(k, v);
        });
      }
      if (worldData.playerPosition) {
        useWorldStore.getState().setPlayerPosition(worldData.playerPosition);
      }
      showNotification(`World loaded: ${entry.name}`, 3500, 'success');
      closeLibrary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Failed to load world: ${msg}`, 4000, 'warning');
    }
  };

  const handleDeleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = savedWorlds.filter((w) => w.id !== id);
    persistSavedWorlds(filtered);
    showNotification('World removed from library.', 2500, 'info');
  };

  const handleLoadFromFile = async () => {
    try {
      setIsProcessing(true);
      if (window.electronAPI?.loadWorld) {
        const res = await window.electronAPI.loadWorld();
        if (res.success && res.data?.sceneGraph) {
          setSceneGraph(res.data.sceneGraph);
          setGeneratedCode(res.data.generatedCode ?? null);
          if (res.data.flags) {
            Object.entries(res.data.flags).forEach(([k, v]) => {
              useWorldStore.getState().setFlag(k, v);
            });
          }
          if (res.data.playerPosition) {
            useWorldStore.getState().setPlayerPosition(res.data.playerPosition);
          }
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
            const parsed = JSON.parse(text);
            const result = SavedWorldSchema.safeParse(parsed);
            if (!result.success) {
              showNotification('Invalid world file schema.', 4000, 'warning');
              return;
            }
            setSceneGraph(result.data.sceneGraph);
            setGeneratedCode(result.data.generatedCode ?? null);
            if (result.data.flags) {
              Object.entries(result.data.flags).forEach(([k, v]) => {
                useWorldStore.getState().setFlag(k, v);
              });
            }
            if (result.data.playerPosition) {
              useWorldStore.getState().setPlayerPosition(result.data.playerPosition);
            }
            showNotification(`World loaded: ${result.data.name || file.name}`, 4000, 'success');
            closeLibrary();
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
        const res = await window.electronAPI.exportHtml({
          ...sceneGraph,
          code: generatedCode ?? undefined,
        } as unknown as SceneGraph);
        if (res.success) {
          showNotification(`Exported HTML: ${res.data}`, 5000, 'success');
        } else {
          showNotification(`Export error: ${res.error.message}`, 4000, 'warning');
        }
      } else {
        // Browser fallback: generate standalone HTML and trigger download
        const html = generateStandaloneHtml({
          ...sceneGraph,
          code: generatedCode ?? undefined,
        });
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sceneGraph.world?.name || 'world'}.html`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Standalone HTML world downloaded.', 4000, 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Export failed: ${msg}`, 4000, 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-xl bg-gray-950 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>📚</span> World Library & Save / Load
          </h2>
          <button
            type="button"
            onClick={closeLibrary}
            className="text-gray-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Current Active World Banner */}
        {sceneGraph ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-indigo-300">
                Active: {sceneGraph.world.name}
              </div>
              <div className="text-[11px] text-gray-400">
                {sceneGraph.world.biome} · {sceneGraph.world.timeOfDay} ·{' '}
                {sceneGraph.characters?.length || 0} NPCs ·{' '}
                {sceneGraph.objects?.length || 0} objects
              </div>
            </div>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSave}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow"
            >
              <span>💾</span> Save Current
            </button>
          </div>
        ) : null}

        {/* Saved Worlds Section */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[140px]">
          <div className="text-xs font-medium text-gray-400">Saved Worlds in Library:</div>
          {savedWorlds.length === 0 ? (
            <div className="text-xs text-gray-500 italic p-4 text-center bg-gray-900/30 rounded-xl border border-gray-800/60">
              No worlds saved in library yet. Generate or load a world to save it here!
            </div>
          ) : (
            savedWorlds.map((entry) => (
              <div
                key={entry.id}
                onClick={() => handleLoadEntry(entry)}
                className="p-2.5 bg-gray-900/80 hover:bg-gray-850 border border-gray-800 hover:border-indigo-500/50 rounded-xl flex items-center justify-between cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt={entry.name}
                      className="w-12 h-12 rounded-lg object-cover border border-gray-700/80"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg">
                      🗺️
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      {entry.name}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {entry.biome} · {entry.characterCount} NPCs ·{' '}
                      {new Date(entry.timestamp).toLocaleDateString()}{' '}
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadEntry(entry);
                    }}
                    className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteEntry(entry.id, e)}
                    className="p-1 text-gray-500 hover:text-red-400 text-xs rounded hover:bg-red-950/40 transition"
                    title="Delete from library"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Global Action Buttons */}
        <div className="pt-2 border-t border-gray-800 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleLoadFromFile}
            className="py-2 px-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-200 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
          >
            <span>📂</span> Import JSON File
          </button>

          <button
            type="button"
            disabled={isProcessing || !sceneGraph}
            onClick={handleExportHTML}
            className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow"
          >
            <span>🌐</span> Export Standalone HTML
          </button>
        </div>

        {/* Close Button */}
        <div className="text-right pt-1">
          <button
            type="button"
            onClick={closeLibrary}
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-850 text-gray-300 rounded-xl text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
