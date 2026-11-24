import { useEffect } from 'react';
import { StudioHeader } from './components/Header/StudioHeader';
import { LeftSidebar } from './components/Sidebar/LeftSidebar';
import { ThreeViewport } from './components/Viewport/ThreeViewport';
import { RightInspector } from './components/Inspector/RightInspector';
import { SettingsModal } from './components/Settings/SettingsModal';
import { WorldLibraryModal } from './components/WorldLibrary/WorldLibraryModal';
import { PolyforkExplorer } from './components/Polyfork/PolyforkExplorer';
import { JSONInspector } from './components/Editor/JSONInspector';
import { ViewportErrorBoundary, ModalErrorBoundary } from './components/ErrorBoundary';
import { useWorldStore } from './store/worldStore';
import { useUIStore } from './store/uiStore';
import { DocumentUploader } from './components/Editor/DocumentUploader';
import { ImageUploader } from './components/Editor/ImageUploader';
import type { UploadedImage } from './components/Editor/ImageUploader';
import { InventoryBar } from './components/HUD/InventoryBar';

const App = () => {
  const {
    leftSidebarOpen,
    cameraMode,
    isDocUploaderOpen,
    isImageUploaderOpen,
    jsonInspectorOpen,
    setIsDocUploaderOpen,
    setIsImageUploaderOpen,
    toggleDocUploader,
    toggleImageUploader,
    toggleJsonInspector,
  } = useUIStore();

  useEffect(() => {
    const interval = setInterval(() => {
      const graph = useWorldStore.getState().sceneGraph;
      if (graph && window.electronAPI?.autoSaveWorld) {
        window.electronAPI.autoSaveWorld({
          name: graph.world?.name ?? 'Autosave',
          timestamp: Date.now(),
          sceneGraph: graph,
          flags: useWorldStore.getState().flags || {},
          playerPosition: useWorldStore.getState().playerPosition || [0, 1.7, 0],
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

        {/* JSON Inspector & Ingestion Controls (active in Orbit view) */}
        {cameraMode !== 'walk' && (
          <>
            {jsonInspectorOpen && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-11/12 max-w-2xl z-35 pointer-events-auto transition-all duration-200">
                <JSONInspector />
              </div>
            )}

            {/* Upload Buttons in Prompt Area */}
            <div className={`absolute bottom-2 ${leftSidebarOpen ? 'left-74' : 'left-2'} z-40 flex items-end gap-2 p-2 pointer-events-none transition-all duration-200`}>
              <div className="flex gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={toggleDocUploader}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border backdrop-blur-sm shadow-md transition flex items-center space-x-1 cursor-pointer ${
                    isDocUploaderOpen
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-gray-800/90 hover:bg-gray-700 text-white border-white/10'
                  }`}
                  title="Attach Story Document (.txt, .md, .pdf)"
                >
                  <span>📎</span>
                  <span className="text-[11px] font-medium hidden sm:inline">Story</span>
                </button>
                <button
                  type="button"
                  onClick={toggleImageUploader}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border backdrop-blur-sm shadow-md transition flex items-center space-x-1 cursor-pointer ${
                    isImageUploaderOpen
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-gray-800/90 hover:bg-gray-700 text-white border-white/10'
                  }`}
                  title="Attach Reference Image"
                >
                  <span>🖼️</span>
                  <span className="text-[11px] font-medium hidden sm:inline">Images</span>
                </button>
                <button
                  type="button"
                  onClick={toggleJsonInspector}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border backdrop-blur-sm shadow-md transition flex items-center space-x-1 cursor-pointer ${
                    jsonInspectorOpen
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-gray-800/90 hover:bg-gray-700 text-white border-white/10'
                  }`}
                  title="View Scene Graph JSON"
                >
                  <span>📋</span>
                  <span className="text-[11px] font-medium hidden sm:inline">JSON</span>
                </button>
              </div>
            </div>

            {/* Document Uploader Dropzone */}
            {isDocUploaderOpen && (
              <div className={`absolute bottom-16 ${leftSidebarOpen ? 'left-74' : 'left-4'} z-50 p-2 bg-gray-950/95 border border-gray-800 rounded-xl shadow-2xl min-w-[280px] transition-all duration-200`}>
                <DocumentUploader
                  onClose={() => setIsDocUploaderOpen(false)}
                  onDocumentLoaded={(text, filename) => {
                    useWorldStore.getState().setUploadedDocument(text);
                    useWorldStore.getState().setFlag('hasDocument', true);
                    setIsDocUploaderOpen(false);
                    console.info(`[DocUploader] Loaded: ${filename}`);
                  }}
                />
              </div>
            )}

            {/* Image Uploader Dropzone */}
            {isImageUploaderOpen && (
              <div className={`absolute bottom-16 ${leftSidebarOpen ? 'left-74' : 'left-4'} z-50 p-3 bg-gray-950/95 border border-gray-800 rounded-xl shadow-2xl min-w-[300px] transition-all duration-200`}>
                <ImageUploader
                  onDone={() => setIsImageUploaderOpen(false)}
                  onClose={() => setIsImageUploaderOpen(false)}
                  onImagesChange={(images: UploadedImage[]) => {
                    useWorldStore.getState().setUploadedImages(
                      images.map((img) => ({ base64: img.base64, mimeType: img.mimeType, tag: img.tag || 'character' }))
                    );
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Right Inspector: Transform, Shader/Material, NPC Stream, IPC Telemetry */}
        <RightInspector />
      </div>

      {/* Modal Settings */}
      <ModalErrorBoundary fallbackTitle="Settings Error">
        <SettingsModal />
      </ModalErrorBoundary>

      {/* Modal World Library & Export */}
      <ModalErrorBoundary fallbackTitle="World Library Error">
        <WorldLibraryModal />
      </ModalErrorBoundary>

      {/* Polyfork 3D Asset Explorer Drawer */}
      <ModalErrorBoundary fallbackTitle="Polyfork Explorer Error">
        <PolyforkExplorer />
      </ModalErrorBoundary>
    </div>
  );
};

export default App;
