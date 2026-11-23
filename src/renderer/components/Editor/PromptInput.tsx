import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import { useOrchestratorStore } from '../../store/orchestratorStore';
import { DocumentUploader } from './DocumentUploader';
import type { UploadedImage } from './ImageUploader';
import { transport } from '../../../shared/transport';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/ipc.types';

const SAMPLE_PROMPTS = [
  'A dark enchanted forest at dusk. An ancient witch lives in a crooked wooden hut. There is a stone well whispering secrets.',
  'A sun-scorched desert canyon with a ruined temple and a lone wandering nomad looking for water.',
  'A cyberpunk alleyway at midnight under neon rain. A rogue mechanic stands near a locked warehouse door.',
];

export const PromptInput = ({ uploadedImages = [] }: { uploadedImages?: UploadedImage[] }) => {
  const [text, setText] = useState('');
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const {
    openSettings,
    isSettingsOpen,
    isGenerating,
    generationError,
    setGenerating,
    setGenerationError,
    setJsonInspectorOpen,
    setViewMode,
    generationMode,
    setGenerationMode,
  } = useUIStore();
  const { setSceneGraph } = useWorldStore();
  const progress = useOrchestratorStore((s) => s.progress);

  useEffect(() => {
    let mounted = true;
    transport
      .call<AppSettings>(IPC_CHANNELS.APP_GET_SETTINGS)
      .then((res) => {
        if (mounted && res.success) {
          setHasApiKey(Boolean(res.data?.apiKey && res.data.apiKey.trim()));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isSettingsOpen]);

  const handleDocumentLoaded = (docText: string) => {
    // If text is short, offer to append or set as prompt; also store as documentContent
    setDocumentContent(docText);
    if (!text.trim()) {
      setText(docText.slice(0, 1000));
    }
  };

  const handleGenerate = async (): Promise<void> => {
    const promptText = text.trim() || (documentContent ? documentContent.slice(0, 4000) : '');
    if (!promptText || isGenerating) return;

    try {
      const settingsRes = await transport.call<AppSettings>(IPC_CHANNELS.APP_GET_SETTINGS);
      if (settingsRes.success && (!settingsRes.data?.apiKey || !settingsRes.data.apiKey.trim())) {
        setHasApiKey(false);
        setGenerationError('API key is not configured. Please open Settings (⚙️) to enter your API key before generating.');
        return;
      }
      setHasApiKey(true);
    } catch {
      // Fallback if settings check fails
    }

    try {
      setGenerating(true, 'Initializing...');
      useWorldStore.getState().setCustomWorldActive(true);

      const storeImages = useWorldStore.getState().uploadedImages || [];
      const allImages = uploadedImages.length > 0 ? uploadedImages : storeImages;
      const mappedImageDescriptions = allImages.map((img, idx) => ({
        tag: (img.tag as 'character' | 'scene' | 'texture' | 'map') || 'scene',
        description: `Uploaded reference image ${idx + 1} (${img.tag || 'reference'})`,
      }));

      const result = await useOrchestratorStore.getState().generateWorld(
        promptText,
        generationMode,
        {
          document: documentContent ?? undefined,
          imageDescriptions: mappedImageDescriptions.length > 0 ? mappedImageDescriptions : undefined,
        }
      );
      
      if (result) {
        useUIStore.getState().setActiveBiome(result.activeBiome);
        setSceneGraph(result.sceneGraph);
        setJsonInspectorOpen(true);
      } else {
        const storeErr = useOrchestratorStore.getState().error;
        if (storeErr) {
          setGenerationError(storeErr);
        }
      }
      setGenerating(false, null);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setGenerationError(errorMsg);
      setGenerating(false, null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-semibold text-gray-200">
            Describe Your World
          </label>
          <div className="flex bg-gray-900 rounded-lg p-0.5 text-[11px] border border-gray-800">
            <button
              type="button"
              onClick={() => setGenerationMode('quick')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                generationMode === 'quick' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Quick
            </button>
            <button
              type="button"
              onClick={() => setGenerationMode('detailed')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                generationMode === 'detailed' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Detailed
            </button>
          </div>
          <span className="text-xs text-gray-400">
            {text.length} / 4000
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. A foggy medieval village at dusk with cobblestone streets, a blacksmith forge with smoking chimney, and a grumpy blacksmith named Torvin..."
          rows={5}
          maxLength={4000}
          disabled={isGenerating}
          className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm leading-relaxed resize-none transition-colors"
        />
      </div>

      {/* Document Uploader */}
      <DocumentUploader
        onDocumentLoaded={handleDocumentLoaded}
        disabled={isGenerating}
      />

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-gray-400">Quick Inspiration:</span>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_PROMPTS.map((sample, i) => (
            <button
              key={i}
              type="button"
              disabled={isGenerating}
              onClick={() => setText(sample)}
              className="text-[11px] bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 px-2.5 py-1 rounded-lg transition-colors text-left truncate max-w-full"
            >
              {sample.slice(0, 45)}...
            </button>
          ))}
        </div>
      </div>

      {generationError && (
        <div className="bg-red-950/60 border border-red-800 rounded-xl p-3 text-red-200 text-xs flex items-start gap-2">
          <span>⚠️</span>
          <div className="flex-1">
            <div className="font-semibold mb-0.5">Generation Failed</div>
            <div>{generationError}</div>
            {generationError.includes('Settings') && (
              <button
                type="button"
                onClick={openSettings}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow"
              >
                ⚙️ Open Settings
              </button>
            )}
          </div>
        </div>
      )}

      {!hasApiKey && !generationError && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-amber-200 text-xs flex items-center justify-between">
          <span>⚠️ API key not configured</span>
          <button
            type="button"
            onClick={openSettings}
            className="text-amber-400 hover:text-amber-300 underline font-medium"
          >
            Open Settings
          </button>
        </div>
      )}

      {isGenerating && progress && (
        <div className="bg-indigo-950/40 border border-indigo-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs text-indigo-300 font-medium">
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block">⚙️</span>
              {progress.message || 'Generating...'}
            </span>
            <span>{progress.percentComplete}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress.percentComplete}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={(!text.trim() && !documentContent) || isGenerating}
          className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
            (!text.trim() && !documentContent) || isGenerating
              ? 'bg-gray-800 text-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
          }`}
        >
          {isGenerating ? 'Building World...' : '✨ Generate 3D World'}
        </button>

        <button
          type="button"
          onClick={() => setViewMode('world')}
          className="px-4 py-3 rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-850 text-gray-300 text-sm font-medium transition-colors"
          title="Switch to Viewport"
        >
          🗺️ Viewport
        </button>
      </div>
    </div>
  );
};
