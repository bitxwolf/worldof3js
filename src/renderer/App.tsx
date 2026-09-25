import { useEffect, useState } from 'react';
import { StudioHeader } from './components/Header/StudioHeader';
import { LeftSidebar } from './components/Sidebar/LeftSidebar';
import { ThreeViewport } from './components/Viewport/ThreeViewport';
import { RightInspector } from './components/Inspector/RightInspector';
import { SettingsModal } from './components/Settings/SettingsModal';
import { WorldLibraryModal } from './components/WorldLibrary/WorldLibraryModal';
import { JSONInspector } from './components/Editor/JSONInspector';
import { ViewportErrorBoundary } from './components/ErrorBoundary';
import { useWorldStore } from './store/worldStore';
import { DocumentUploader } from './components/Editor/DocumentUploader';
import { ImageUploader } from './components/Editor/ImageUploader';
import type { UploadedImage } from './components/Editor/ImageUploader';
import { InventoryBar } from './components/HUD/InventoryBar';

const App = () => {
  const [showDocUploader, setShowDocUploader] = useState(false);
  const [showImgUploader, setShowImgUploader] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const graph = useWorldStore.getState().sceneGraph;
      if (graph && window.electronAPI?.autoSaveWorld) {
        window.electronAPI.autoSaveWorld({
          name: graph.world?.name ?? 'Autosave',
          timestamp: Date.now(),
          sceneGraph: graph,
          flags: {},
          playerPosition: [0, 0, 0],
        }).catch(() => { /* silent autosave failure */ });
        console.debug('[AutoSave] World saved');
      }
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col font-sans text-mac-text bg-mac-bg antialiased selection:bg-blue-500/30 overflow-hidden">
      {/* Native macOS Studio Window Header */}
      <StudioHeader />

      {/* Main Studio Body Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Scene Graph, Biomes Presets, Tuning Sliders */}
        <LeftSidebar />

        {/* Center: 3D Three.js Viewport, Dual Camera Rig, HUD, Spotlight Prompt */}
        <ViewportErrorBoundary>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <ThreeViewport />
            <InventoryBar />
          </div>
        </ViewportErrorBoundary>

        {/* JSON Inspector overlay (other ingestion components to be integrated into SpotlightPromptBar in a future pass) */}
        <div className="absolute bottom-0 left-72 right-80 z-30 p-2 pointer-events-auto">
          <JSONInspector />
        </div>

        {/* Upload Buttons in Prompt Area */}
        <div className="absolute bottom-0 left-72 right-80 z-40 flex items-end gap-2 p-2 pointer-events-none">
          <div className="flex gap-1 pointer-events-auto">
            <button
              onClick={() => setShowDocUploader((v) => !v)}
              className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-white text-sm border border-white/10 backdrop-blur-sm"
              title="Attach Document"
            >
              📎
            </button>
            <button
              onClick={() => setShowImgUploader((v) => !v)}
              className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-white text-sm border border-white/10 backdrop-blur-sm"
              title="Attach Image"
            >
              🖼️
            </button>
          </div>
        </div>

        {/* Document Uploader Dropzone */}
        {showDocUploader && (
          <div className="absolute bottom-16 left-72 z-50 p-2">
            <DocumentUploader
              onDocumentLoaded={(text, filename) => {
                useWorldStore.getState().setUploadedDocument(text);
                useWorldStore.getState().setFlag('hasDocument', true);
                setShowDocUploader(false);
                console.info(`[DocUploader] Loaded: ${filename}`);
              }}
            />
          </div>
        )}

        {/* Image Uploader Dropzone */}
        {showImgUploader && (
          <div className="absolute bottom-16 left-72 z-50 p-2">
            <ImageUploader
              onImagesChange={(images: UploadedImage[]) => {
                if (images.length > 0) {
                  useWorldStore.getState().setUploadedImages(
                    images.map((img) => ({ base64: img.base64, mimeType: img.mimeType, tag: img.tag || 'scene' }))
                  );
                  setShowImgUploader(false);
                }
              }}
            />
          </div>
        )}

        {/* Right Inspector: Transform, Shader/Material, NPC Stream, IPC Telemetry */}
        <RightInspector />
      </div>

      {/* Modal Settings */}
      <SettingsModal />

      {/* Modal World Library & Export */}
      <WorldLibraryModal />
    </div>
  );
};

export default App;
