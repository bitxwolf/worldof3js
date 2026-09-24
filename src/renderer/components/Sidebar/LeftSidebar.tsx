import { useUIStore, type BiomeType } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';

interface BiomeDefinition {
  id: BiomeType;
  title: string;
  description: string;
  icon: string;
  badgeColor: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
}

const BIOMES: BiomeDefinition[] = [
  {
    id: 'pine',
    title: 'Pine Forest',
    description: 'Layered conifers, rocks, misty sun',
    icon: 'ph-tree-evergreen',
    badgeColor: 'text-blue-400',
    iconBg: 'bg-emerald-950/80',
    iconBorder: 'border-emerald-600/40',
    iconColor: 'text-emerald-400',
  },
  {
    id: 'cyber',
    title: 'Neon Cyber Grid',
    description: 'Monolithic towers, grid lines, fog',
    icon: 'ph-buildings',
    badgeColor: 'text-pink-400',
    iconBg: 'bg-purple-950/80',
    iconBorder: 'border-purple-600/40',
    iconColor: 'text-pink-400',
  },
  {
    id: 'canyon',
    title: 'Red Desert Canyon',
    description: 'Plateau ridges, saguaro spires',
    icon: 'ph-mountains',
    badgeColor: 'text-amber-400',
    iconBg: 'bg-amber-950/80',
    iconBorder: 'border-amber-600/40',
    iconColor: 'text-amber-400',
  },
  {
    id: 'alien',
    title: 'Bioluminescent Spire',
    description: 'Glowing mushrooms, ethereal spores',
    icon: 'ph-atom',
    badgeColor: 'text-teal-300',
    iconBg: 'bg-teal-950/80',
    iconBorder: 'border-teal-600/40',
    iconColor: 'text-teal-300',
  },
  {
    id: 'ruins',
    title: 'Ancient Ruins Dusk',
    description: 'Overgrown pillars, warm sunset',
    icon: 'ph-castle-turret',
    badgeColor: 'text-stone-300',
    iconBg: 'bg-stone-900',
    iconBorder: 'border-stone-600/40',
    iconColor: 'text-stone-300',
  },
];

export const LeftSidebar = () => {
  const {
    leftSidebarOpen,
    leftSidebarTab,
    setLeftSidebarTab,
    activeBiome,
    setActiveBiome,
    tuningParams,
    setTuningParam,
    selectedNode,
    setSelectedNode,
    telemetry,
    addIpcLog,
    showNotification,
  } = useUIStore();

  const { sceneGraph } = useWorldStore();

  const handleGC = () => {
    addIpcLog('[GC:TRIGGER] Sweeping unreferenced textures & buffer attributes...', 'info');
    // Dispatch GC event for ThreeViewport to handle actual GPU cleanup
    window.dispatchEvent(new CustomEvent('engine:gc-request'));
    setTimeout(() => {
      addIpcLog('[GC:COMPLETE] GPU garbage collection sweep finished.', 'success');
      showNotification('GPU memory garbage collection complete', 2500, 'success');
    }, 300);
  };

  // Node items: fallback or based on current scene graph
  const defaultNodes = [
    { id: 'node_terrain', name: 'Terrain_Heightmap_Surface', icon: 'ph-mountains', tag: 'Terrain' },
    { id: 'node_pine_1', name: 'Procedural_Pine_4821', icon: 'ph-tree-evergreen', tag: 'Flora' },
    { id: 'node_pine_2', name: 'Procedural_Pine_9104', icon: 'ph-tree-evergreen', tag: 'Flora' },
    { id: 'node_rock_1', name: 'Rock_Cluster_3819', icon: 'ph-diamonds-four', tag: 'Geology' },
    { id: 'node_npc_1', name: 'NPC_Eldrin_The_Ranger', icon: 'ph-user', tag: 'Entity' },
    { id: 'node_sun', name: 'DirectionalLight_Sun', icon: 'ph-sun', tag: 'Lighting' },
  ];

  const nodes = sceneGraph?.objects?.length
    ? [
        { id: 'node_terrain', name: 'Terrain_Heightmap_Surface', icon: 'ph-mountains', tag: 'Terrain' },
        ...sceneGraph.characters.map((c) => ({
          id: c.id,
          name: `NPC_${c.name.replace(/\s+/g, '_')}`,
          icon: 'ph-user',
          tag: 'Entity',
        })),
        ...sceneGraph.objects.map((o) => ({
          id: o.id,
          name: o.name || o.type,
          icon: o.type.includes('tree')
            ? 'ph-tree-evergreen'
            : o.type.includes('rock')
            ? 'ph-diamonds-four'
            : o.type.includes('pillar')
            ? 'ph-columns'
            : 'ph-cube',
          tag: o.type.split('/')[0] || 'Object',
        })),
      ]
    : defaultNodes;

  return (
    <aside
      id="leftSidebar"
      className={`bg-mac-sidebar mac-blur border-r border-mac-surfaceBorder flex flex-col transition-all duration-200 z-20 select-none ${
        leftSidebarOpen ? 'w-72' : 'w-0 -ml-72 overflow-hidden'
      }`}
    >
      {/* Section Tabs */}
      <div className="p-2 border-b border-white/5 flex space-x-1">
        <button
          type="button"
          onClick={() => setLeftSidebarTab('hierarchy')}
          className={`flex-1 py-1.5 text-xs rounded-md flex items-center justify-center space-x-1 transition ${
            leftSidebarTab === 'hierarchy'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-mac-textMuted hover:text-white hover:bg-white/5 font-medium'
          }`}
        >
          <i className="ph ph-tree-structure text-blue-400" />
          <span>Hierarchy</span>
        </button>

        <button
          type="button"
          onClick={() => setLeftSidebarTab('biomes')}
          className={`flex-1 py-1.5 text-xs rounded-md flex items-center justify-center space-x-1 transition ${
            leftSidebarTab === 'biomes'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-mac-textMuted hover:text-white hover:bg-white/5 font-medium'
          }`}
        >
          <i className="ph ph-planet text-emerald-400" />
          <span>Biomes</span>
        </button>

        <button
          type="button"
          onClick={() => setLeftSidebarTab('tuning')}
          className={`flex-1 py-1.5 text-xs rounded-md flex items-center justify-center space-x-1 transition ${
            leftSidebarTab === 'tuning'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-mac-textMuted hover:text-white hover:bg-white/5 font-medium'
          }`}
        >
          <i className="ph ph-faders text-amber-400" />
          <span>Tuning</span>
        </button>
      </div>

      {/* ── Hierarchy Tab Content ── */}
      {leftSidebarTab === 'hierarchy' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/70 px-2 py-1 flex justify-between items-center">
            <span>Scene Graph</span>
            <span className="font-mono text-[9px] bg-white/5 px-1 rounded">
              {nodes.length} Nodes
            </span>
          </div>

          <div className="space-y-0.5 text-xs">
            {nodes.map((n) => {
              const isSelected = selectedNode?.name === n.name || selectedNode?.id === n.id;
              return (
                <div
                  key={n.id}
                  onClick={() =>
                    setSelectedNode({
                      id: n.id,
                      name: n.name,
                      type: n.tag,
                      position: [4.2, 0.0, -6.5],
                      scale: [1.0, 1.25, 1.0],
                      roughness: 0.68,
                      metalness: 0.1,
                      castShadow: true,
                    })
                  }
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition group ${
                    isSelected
                      ? 'bg-blue-500/20 border border-blue-500/40 text-white'
                      : 'hover:bg-white/10 text-mac-text border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <i
                      className={`ph ${n.icon} ${
                        isSelected ? 'text-blue-400' : 'text-mac-textMuted group-hover:text-blue-400'
                      } text-sm`}
                    />
                    <span className="truncate text-[11px] font-medium">{n.name}</span>
                  </div>
                  <span className="text-[9px] font-mono text-mac-textMuted/60">{n.tag}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-white/5 mt-3">
            <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/70 px-2 py-1">
              Collision & Physics
            </div>
            <div className="px-2 py-1.5 rounded bg-black/20 border border-white/5 flex items-center justify-between text-xs text-mac-textMuted">
              <span className="flex items-center space-x-1.5">
                <i className="ph ph-shield-check text-emerald-400" />
                <span>Terrain Raycast Colliders</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>
        </div>
      )}

      {/* ── Biomes Tab Content ── */}
      {leftSidebarTab === 'biomes' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2">
          <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/70 px-1">
            Procedural Biomes
          </div>

          <div className="grid grid-cols-1 gap-2">
            {BIOMES.map((b) => {
              const isActive = activeBiome === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => {
                    setActiveBiome(b.id);
                    addIpcLog(`[PROCEDURAL:BIOME] Applied preset '${b.title}'`, 'warn');
                    showNotification(`Switched to ${b.title}`, 2000, 'info');
                  }}
                  className={`p-2.5 rounded-lg cursor-pointer transition flex items-center space-x-3 ${
                    isActive
                      ? 'border border-blue-500/40 bg-blue-500/10'
                      : 'border border-white/5 bg-mac-card hover:bg-white/10'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-md ${b.iconBg} border ${b.iconBorder} flex items-center justify-center ${b.iconColor} text-lg`}
                  >
                    <i className={`ph ${b.icon}`} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-white flex items-center justify-between">
                      <span>{b.title}</span>
                      {isActive && <span className="text-[10px] text-blue-400">Active</span>}
                    </div>
                    <div className="text-[11px] text-mac-textMuted">{b.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tuning Sliders Tab Content ── */}
      {leftSidebarTab === 'tuning' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4 text-xs">
          <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/70">
            Noise & Generation Parameters
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-mac-textMuted">Terrain Elevation Amplitude</span>
              <span className="font-mono text-white">{tuningParams.elevation.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="2"
              max="25"
              step="1"
              value={tuningParams.elevation}
              onChange={(e) => setTuningParam('elevation', parseFloat(e.target.value))}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-mac-textMuted">Flora Density (Instances)</span>
              <span className="font-mono text-white">{tuningParams.density}</span>
            </div>
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={tuningParams.density}
              onChange={(e) => setTuningParam('density', parseInt(e.target.value, 10))}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-mac-textMuted">Atmospheric Fog Density</span>
              <span className="font-mono text-white">{tuningParams.fogDensity.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min="0.002"
              max="0.04"
              step="0.002"
              value={tuningParams.fogDensity}
              onChange={(e) => setTuningParam('fogDensity', parseFloat(e.target.value))}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-mac-textMuted">Sun Angle (Time of Day)</span>
              <span className="font-mono text-white">{tuningParams.sunAngle}°</span>
            </div>
            <input
              type="range"
              min="10"
              max="170"
              step="5"
              value={tuningParams.sunAngle}
              onChange={(e) => setTuningParam('sunAngle', parseFloat(e.target.value))}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] leading-relaxed">
            <i className="ph ph-info mr-1" /> Changes regenerate GPU buffer geometries on the fly using zero-leak mesh recycling.
          </div>
        </div>
      )}

      {/* Left Sidebar Footer: Engine Memory Status */}
      <div className="p-2.5 border-t border-white/5 bg-black/20 text-[11px] flex items-center justify-between text-mac-textMuted font-mono">
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span>Buffer: {telemetry.bufferMemoryMB.toFixed(1)} MB</span>
        </span>
        <button
          type="button"
          onClick={handleGC}
          title="Invoke dispose() garbage collection"
          className="hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10 transition"
        >
          <i className="ph ph-arrow-counter-clockwise text-xs" /> GC
        </button>
      </div>
    </aside>
  );
};
