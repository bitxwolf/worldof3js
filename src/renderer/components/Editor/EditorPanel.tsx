import { useState } from 'react';
import { PromptInput } from './PromptInput';
import { JSONInspector } from './JSONInspector';
import { ImageUploader, type UploadedImage } from './ImageUploader';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';

export const EditorPanel = () => {
  const { openSettings, openLibrary } = useUIStore();
  const { sceneGraph } = useWorldStore();
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);

  return (
    <div className="w-96 min-w-[380px] max-w-[420px] h-full flex flex-col bg-gray-950 border-r border-gray-800/80 p-5 overflow-y-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-indigo-500">❖</span> Story Engine
          </h1>
          <p className="text-xs text-gray-400">LLM-Powered 3D World Builder</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openLibrary}
            className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 text-sm transition-colors"
            title="World Library & Export"
          >
            📚
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 text-sm transition-colors"
            title="Open Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* World Status Summary if generated */}
      {sceneGraph && (
        <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-3 text-xs space-y-1">
          <div className="font-semibold text-indigo-300 flex items-center justify-between">
            <span>{sceneGraph.world.name}</span>
            <span className="text-[10px] bg-indigo-900/60 px-2 py-0.5 rounded-full uppercase">
              {sceneGraph.world.biome}
            </span>
          </div>
          <p className="text-gray-400 text-[11px] line-clamp-2">
            {sceneGraph.world.description}
          </p>
          <div className="text-gray-400 pt-1 text-[10px] flex gap-3">
            <span>👤 {sceneGraph.characters?.length || 0} NPCs</span>
            <span>📦 {sceneGraph.objects?.length || 0} Objects</span>
            <span>⚡ {sceneGraph.events?.length || 0} Triggers</span>
          </div>
        </div>
      )}

      {/* Narrative Prompt Section */}
      <PromptInput uploadedImages={uploadedImages} />

      {/* Image Uploader for Multimodal Input */}
      <ImageUploader onImagesChange={setUploadedImages} />

      {/* Scene Graph JSON viewer */}
      <JSONInspector />

      {/* Footer Info */}
      <div className="mt-auto pt-4 border-t border-gray-900 text-[11px] text-gray-400 flex items-center justify-between">
        <span>Story Engine v1.0</span>
        <span>Three.js + Claude AI</span>
      </div>
    </div>
  );
};
