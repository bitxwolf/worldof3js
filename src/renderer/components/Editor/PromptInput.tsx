import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import { parseWorld } from '../../llm/WorldParser';
import { generateCode } from '../../llm/SceneCodegen';
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

interface PromptInputProps {
  uploadedImages?: UploadedImage[];
}

export const PromptInput = ({ uploadedImages = [] }: PromptInputProps) => {
  const [text, setText] = useState('');
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const {
    openSettings,
    isSettingsOpen,
    isGenerating,
    generationStep,
    generationError,
    setGenerating,
    setGenerationError,
    setJsonInspectorOpen,
    setViewMode,
  } = useUIStore();
  const { setSceneGraph, setGeneratedCode } = useWorldStore();

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
    if ((!text.trim() && !documentContent) || isGenerating) return;

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
      setGenerating(true, '1/3 Analyzing narrative with Claude...');
      const graph = await parseWorld({
        text: text.trim(),
        document: documentContent || undefined,
        images: uploadedImages?.map((img) => ({
          base64: img.base64,
          mimeType: img.mimeType,
          tag: img.tag,
        })),
      });

      setGenerating(true, '2/3 Generating Three.js procedural scene code...');
      const code = await generateCode(graph);

      setGenerating(true, '3/3 Assembling world...');
      setSceneGraph(graph);
      setGeneratedCode(code);
      setJsonInspectorOpen(true);
      setGenerating(false, null);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setGenerationError(errorMsg);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-semibold text-gray-200">
            Describe Your World
          </label>
          <span className="text-xs text-gray-400">
            {text.length} / 4000 characters
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

      {isGenerating && (
        <div className="bg-indigo-950/40 border border-indigo-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs text-indigo-300 font-medium">
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block">⚙️</span>
              {generationStep}
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-indigo-500 h-1.5 rounded-full animate-pulse w-3/4"></div>
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
