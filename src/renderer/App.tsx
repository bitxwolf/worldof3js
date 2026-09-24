import { StudioHeader } from './components/Header/StudioHeader';
import { LeftSidebar } from './components/Sidebar/LeftSidebar';
import { ThreeViewport } from './components/Viewport/ThreeViewport';
import { RightInspector } from './components/Inspector/RightInspector';
import { SettingsModal } from './components/Settings/SettingsModal';
import { WorldLibraryModal } from './components/WorldLibrary/WorldLibraryModal';
import { JSONInspector } from './components/Editor/JSONInspector';

const App = () => {
  return (
    <div className="h-screen w-screen flex flex-col font-sans text-mac-text bg-mac-bg antialiased selection:bg-blue-500/30 overflow-hidden">
      {/* Native macOS Studio Window Header */}
      <StudioHeader />

      {/* Main Studio Body Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Scene Graph, Biomes Presets, Tuning Sliders */}
        <LeftSidebar />

        {/* Center: 3D Three.js Viewport, Dual Camera Rig, HUD, Spotlight Prompt */}
        <ThreeViewport />

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
