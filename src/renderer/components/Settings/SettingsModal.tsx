import { useState, useEffect, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import type { AppSettings } from '../../../shared/ipc.types';
import { transport } from '../../../shared/transport';
import { IPC_CHANNELS } from '../../../shared/constants';

export const SettingsModal = () => {
  const { isSettingsOpen, closeSettings } = useUIStore();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>('nvidia/nemotron-3-ultra-550b-a55b:free');
  const [quality, setQuality] = useState<'fast' | 'quality'>('fast');
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await transport.call<AppSettings>(IPC_CHANNELS.APP_GET_SETTINGS);
    if (res.success && res.data) {
      setApiKey(res.data.apiKey || '');
      setModel(res.data.model || 'nvidia/nemotron-3-ultra-550b-a55b:free');
      setQuality(res.data.quality || 'fast');
    }
  }, []);

  useEffect(() => {
    if (isSettingsOpen) {
      loadSettings();
      setIsSaved(false);
      setError(null);
    }
  }, [isSettingsOpen, loadSettings]);

  if (!isSettingsOpen) return null;

  const handleSave = async (): Promise<void> => {
    setError(null);
    const update: Partial<AppSettings> = {
      apiKey: apiKey.trim(),
      model: model.trim(),
      quality,
    };
    const res = await transport.call<void>(IPC_CHANNELS.APP_SAVE_SETTINGS, update);
    if (res.success) {
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        closeSettings();
      }, 1200);
    } else {
      setError(res.error.message || 'Failed to save settings');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            ⚙️ Settings
          </h2>
          <button
            onClick={closeSettings}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-gray-300 font-medium mb-1.5">
              API Key (OpenRouter or Anthropic)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-... or sk-ant-..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
            />
            <p className="text-xs text-gray-400 mt-1">
              Supports OpenRouter (<code className="text-indigo-400">sk-or-v1-...</code>) & Anthropic (<code className="text-indigo-400">sk-ant-...</code>).
            </p>
          </div>

          <div>
            <label className="block text-gray-300 font-medium mb-1.5">
              LLM Model Name
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. nvidia/nemotron-3-ultra-550b-a55b:free"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono text-xs mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setModel('nvidia/nemotron-3-ultra-550b-a55b:free')}
                className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded"
              >
                Nemotron Ultra (Free)
              </button>
              <button
                type="button"
                onClick={() => setModel('anthropic/claude-3.5-sonnet')}
                className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded"
              >
                Claude 3.5 Sonnet
              </button>
              <button
                type="button"
                onClick={() => setModel('meta-llama/llama-3.3-70b-instruct:free')}
                className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded"
              >
                Llama 3.3 70B (Free)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-gray-300 font-medium mb-1.5">
              Generation Quality
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQuality('fast')}
                className={`py-2 px-3 rounded-lg border text-center transition-colors ${
                  quality === 'fast'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 font-medium'
                    : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700'
                }`}
              >
                ⚡ Fast
              </button>
              <button
                type="button"
                onClick={() => setQuality('quality')}
                className={`py-2 px-3 rounded-lg border text-center transition-colors ${
                  quality === 'quality'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 font-medium'
                    : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700'
                }`}
              >
                ✨ High Detail
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs p-3 rounded-lg">
            {error}
          </div>
        )}

        {isSaved && (
          <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs p-3 rounded-lg">
            ✓ Settings saved successfully!
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
          <button
            type="button"
            onClick={closeSettings}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
