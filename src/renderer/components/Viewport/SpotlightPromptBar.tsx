import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import { useOrchestratorStore } from '../../store/orchestratorStore';
import { transport } from '../../../shared/transport';

const PROMPT_CHIPS = [
  'Pine Valley with Watchtower',
  'Cyberpunk Alley with Rain Puddles',
  'Bioluminescent Mushroom Glen',
  'Desert Oasis at Sunset',
];

export const SpotlightPromptBar = () => {
  const {
    isGenerating,
    setGenerating,
    showNotification,
    generationMode,
    setGenerationMode,
  } = useUIStore();

  const { setSceneGraph, uploadedDocument, uploadedImages } = useWorldStore();
  
  const activeSelection = useOrchestratorStore((s) => s.activeSelection);
  const progress = useOrchestratorStore((s) => s.progress);

  const [promptText, setPromptText] = useState('');

  const triggerWorldGeneration = async (text: string) => {
    if (!text.trim() || isGenerating) return;

    const api = window.electronAPI ?? transport;
    setGenerating(true, 'Initiating generation...');
    useWorldStore.getState().setCustomWorldActive(true);

    try {
      let result;
      if (activeSelection) {
        result = await useOrchestratorStore.getState().editSelection(text);
      } else {
        const mappedImageDescriptions = uploadedImages && uploadedImages.length > 0 ? uploadedImages.map((img, idx) => ({
          tag: (img.tag as 'character' | 'scene' | 'texture' | 'map') || 'scene',
          description: `Uploaded reference image ${idx + 1} (${img.tag || 'reference'})`,
        })) : undefined;

        result = await useOrchestratorStore.getState().generateWorld(
          text,
          generationMode,
          {
            document: uploadedDocument ?? undefined,
            imageDescriptions: mappedImageDescriptions,
          }
        );
      }

      if (result) {
        useUIStore.getState().setActiveBiome(result.activeBiome);
        setSceneGraph(result.sceneGraph);
        showNotification(activeSelection ? 'Selection updated successfully!' : 'World generated successfully!', 3500, 'success');
        setPromptText('');
        if (activeSelection) {
          useOrchestratorStore.getState().clearSelection();
        }
        return;
      }

      // Fallback: If orchestrator returned null/unavailable, generate world via unified api (parseWorld)
      if (api?.parseWorld) {
        const parseRes = await api.parseWorld({
          text,
          document: uploadedDocument ?? undefined,
          images: uploadedImages.length > 0 ? uploadedImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
            tag: img.tag as 'character' | 'scene' | 'texture',
          })) : undefined,
        });

        if (parseRes.success && parseRes.data) {
          setSceneGraph(parseRes.data);
          if (api.generateCode) {
            const codeRes = await api.generateCode(parseRes.data);
            if (codeRes.success && codeRes.data) {
              useWorldStore.getState().setGeneratedCode(codeRes.data);
            }
          }
          showNotification('World generated successfully!', 3500, 'success');
          setPromptText('');
          return;
        }
      }

      const storeErr = useOrchestratorStore.getState().error;
      showNotification(storeErr || 'Generation failed. Check API key in Settings.', 5000, 'error');
      useWorldStore.getState().setCustomWorldActive(false);
    } catch (err: unknown) {
      console.warn('Generation failed:', err);
      showNotification('Unexpected generation error', 5000, 'error');
      useWorldStore.getState().setCustomWorldActive(false);
    } finally {
      setTimeout(() => {
        setGenerating(false);
      }, 800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      triggerWorldGeneration(promptText);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-11/12 max-w-2xl z-30 flex flex-col space-y-2 pointer-events-auto">
      {/* Pipeline Status Pill */}
      {isGenerating && progress && (
        <div
          id="pipelineStatusPill"
          className="self-center flex items-center space-x-2 px-3 py-1 rounded-full bg-black/90 mac-blur border border-blue-500/30 text-[11px] text-blue-200 shadow-xl"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-indicator" />
          <span id="pipelineStepText">{progress.message || 'Generating...'}</span>
          <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden ml-1">
            <div
              id="pipelineProgressBar"
              className="h-full bg-blue-400 transition-all duration-300"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Floating Spotlight Prompt Input Box */}
      <div className="p-1.5 rounded-2xl bg-mac-surface/90 mac-blur border border-white/15 shadow-2xl flex flex-col space-y-1.5">
        
        {/* Selection Badge, Context Badges & Mode Selector */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {activeSelection && (
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-[10px] text-blue-300">
                <span>Editing Selection (R={activeSelection.radiusWorldUnits.toFixed(1)}m)</span>
                <button
                  type="button"
                  onClick={() => useOrchestratorStore.getState().clearSelection()}
                  className="hover:text-white transition-colors"
                >
                  <i className="ph ph-x" />
                </button>
              </div>
            )}
            {uploadedDocument && (
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] text-emerald-300">
                <span>Story Attached</span>
                <button
                  type="button"
                  onClick={() => useWorldStore.getState().setUploadedDocument(null)}
                  className="hover:text-white transition-colors"
                >
                  <i className="ph ph-x" />
                </button>
              </div>
            )}
            {uploadedImages && uploadedImages.length > 0 && (
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-[10px] text-purple-300">
                <span>{uploadedImages.length} Image{uploadedImages.length > 1 ? 's' : ''} Attached</span>
                <button
                  type="button"
                  onClick={() => useWorldStore.getState().setUploadedImages([])}
                  className="hover:text-white transition-colors"
                >
                  <i className="ph ph-x" />
                </button>
              </div>
            )}
          </div>
          <div className="flex bg-black/40 rounded-lg p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setGenerationMode('quick')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                generationMode === 'quick' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white/80'
              }`}
            >
              Quick
            </button>
            <button
              type="button"
              onClick={() => setGenerationMode('detailed')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                generationMode === 'detailed' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white/80'
              }`}
            >
              Detailed
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 px-2 pb-1">
          <i className="ph ph-sparkle text-blue-400 text-lg" />
          <input
            id="spotlightInput"
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeSelection
                ? `Describe changes for selected area (R=${activeSelection.radiusWorldUnits.toFixed(0)}m)... (e.g. 'Add a stone altar and crystal trees')`
                : "Describe a world to generate... (e.g. 'Misty autumn valley with ancient stone monoliths')"
            }
            className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-xs sm:text-sm py-1 font-normal"
          />

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              id="generatePromptBtn"
              disabled={isGenerating}
              onClick={() => triggerWorldGeneration(promptText)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-60 text-white font-medium text-xs flex items-center space-x-1.5 transition shadow-md cursor-pointer"
            >
              <span>{activeSelection ? 'Edit' : 'Generate'}</span>
              <i className="ph ph-arrow-up-right font-bold text-xs" />
            </button>
          </div>
        </div>

        {/* Quick Prompt Chips */}
        <div className="flex items-center space-x-1.5 pt-1 overflow-x-auto custom-scrollbar text-[11px] text-mac-textMuted px-2 pb-0.5 border-t border-white/5">
          <span className="text-[10px] uppercase font-bold text-white/40 mr-1 flex items-center">
            <i className="ph ph-lightning mr-1 text-amber-400" /> Presets:
          </span>
          {PROMPT_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setPromptText(chip);
                triggerWorldGeneration(chip);
              }}
              className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 hover:text-white border border-white/5 whitespace-nowrap transition cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
