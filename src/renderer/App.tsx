import { useEffect } from 'react';
import { StudioHeader } from './components/Header/StudioHeader';
import { LeftSidebar } from './components/Sidebar/LeftSidebar';
import { ThreeViewport } from './components/Viewport/ThreeViewport';
import { RightInspector } from './components/Inspector/RightInspector';
import { SettingsModal } from './components/Settings/SettingsModal';
import { WorldLibraryModal } from './components/WorldLibrary/WorldLibraryModal';
import { JSONInspector } from './components/Editor/JSONInspector';
import { ViewportErrorBoundary } from './components/ErrorBoundary';
import { useWorldStore } from './store/worldStore';

const App = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      const graph = useWorldStore.getState().sceneGraph;
      if (graph && window.electronAPI?.saveWorld) {
        window.electronAPI.saveWorld({
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
          <ThreeViewport />
        </ViewportErrorBoundary>

        {/* JSON Inspector overlay (other ingestion components to be integrated into SpotlightPromptBar in a future pass) */}
        <div className="absolute bottom-0 left-72 right-80 z-30 p-2 pointer-events-auto">
          <JSONInspector />
        </div>

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
