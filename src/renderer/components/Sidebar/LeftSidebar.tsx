import { useState, useMemo } from 'react';
import { useUIStore, type BiomeType, type SceneHierarchyItem } from '../../store/uiStore';

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
    sceneHierarchy,
    setRightInspectorOpen,
    setRightInspectorTab,
    telemetry,
    addIpcLog,
    showNotification,
  } = useUIStore();

  const handleGC = () => {
    addIpcLog('[GC:TRIGGER] Sweeping unreferenced textures & buffer attributes...', 'info');
    // Dispatch GC event for ThreeViewport to handle actual GPU cleanup
    window.dispatchEvent(new CustomEvent('engine:gc-request'));
    setTimeout(() => {
      addIpcLog('[GC:COMPLETE] GPU garbage collection sweep finished.', 'success');
      showNotification('GPU memory garbage collection complete', 2500, 'success');
    }, 300);
  };

  const [sceneOpen, setSceneOpen] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Terrain: true,
    Flora: true,
    NPCs: true,
    Lights: true,
    Geology: true,
    Architecture: true,
  });
  const [hierarchyFilter, setHierarchyFilter] = useState('');

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [cat]: prev[cat] !== undefined ? !prev[cat] : false,
    }));
  };

  const handleSelectItem = (item: SceneHierarchyItem) => {
    setSelectedNode({
      id: item.id,
      name: item.name,
      type: item.type,
      position: item.position,
      scale: item.scale,
      roughness: item.roughness ?? 0.68,
      metalness: item.metalness ?? 0.1,
      castShadow: item.castShadow ?? true,
    });
    setRightInspectorTab('inspector');
    setRightInspectorOpen(true);
    addIpcLog(`[SELECTION] Focused node '${item.name}' (${item.type}) via Hierarchy`, 'selection');
  };

  const filteredHierarchy = useMemo(() => {
    if (!hierarchyFilter.trim()) return sceneHierarchy;
    const q = hierarchyFilter.toLowerCase();
    return sceneHierarchy.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
    );
  }, [sceneHierarchy, hierarchyFilter]);

  const groupedHierarchy = useMemo(() => {
    const groups: Record<string, SceneHierarchyItem[]> = {};
    for (const item of filteredHierarchy) {
      const cat = item.category || 'Objects';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    const order = ['Terrain', 'Flora', 'NPCs', 'Lights', 'Geology', 'Architecture'];
    const sortedEntries: [string, SceneHierarchyItem[]][] = [];
    for (const cat of order) {
      if (groups[cat] && groups[cat].length > 0) {
        sortedEntries.push([cat, groups[cat]]);
      }
    }
    for (const cat of Object.keys(groups)) {
      if (!order.includes(cat) && groups[cat].length > 0) {
        sortedEntries.push([cat, groups[cat]]);
      }
    }
    return sortedEntries;
  }, [filteredHierarchy]);

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
      {/* ── Hierarchy Tab Content (Point 75) ── */}
      {leftSidebarTab === 'hierarchy' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {/* Header & Item Count */}
          <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/70 px-1 py-0.5 flex justify-between items-center">
            <span>Hierarchy</span>
            <span className="font-mono text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-mac-textMuted">
              {filteredHierarchy.length} Objects
            </span>
          </div>

          {/* Search/Filter Bar */}
          <div className="relative">
            <i className="ph ph-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-mac-textMuted text-xs pointer-events-none" />
            <input
              type="text"
              placeholder="Filter scene objects..."
              value={hierarchyFilter}
              onChange={(e) => setHierarchyFilter(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-md pl-6 pr-6 py-1 text-xs text-white placeholder-mac-textMuted/50 focus:outline-none focus:border-blue-500/50"
            />
            {hierarchyFilter && (
              <button
                type="button"
                onClick={() => setHierarchyFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-mac-textMuted hover:text-white"
              >
                <i className="ph ph-x text-xs" />
              </button>
            )}
          </div>

          {/* Tree View (Organised by Type) */}
          <div className="space-y-1 text-xs select-none">
            {/* ▾ Scene root */}
            <div>
              <div
                onClick={() => setSceneOpen(!sceneOpen)}
                className="flex items-center space-x-1.5 px-1.5 py-1 rounded hover:bg-white/5 cursor-pointer text-white font-medium text-xs transition"
              >
                <i className={`ph ${sceneOpen ? 'ph-caret-down' : 'ph-caret-right'} text-[10px] text-mac-textMuted`} />
                <i className="ph ph-cube text-blue-400 text-sm" />
                <span>Scene</span>
                <span className="text-[10px] text-mac-textMuted/60 font-mono">({filteredHierarchy.length})</span>
              </div>

              {sceneOpen && (
                <div className="pl-3 space-y-1 mt-0.5 border-l border-white/5 ml-2.5">
                  {groupedHierarchy.map(([category, items]: [string, SceneHierarchyItem[]]) => {
                    const isExpanded = expandedCategories[category] ?? true;
                    let catIcon = 'ph-folder';
                    if (category === 'Terrain') catIcon = 'ph-mountains';
                    else if (category === 'Flora') catIcon = 'ph-tree-evergreen';
                    else if (category === 'NPCs') catIcon = 'ph-users';
                    else if (category === 'Lights') catIcon = 'ph-sun';
                    else if (category === 'Geology') catIcon = 'ph-diamonds-four';
                    else if (category === 'Architecture') catIcon = 'ph-columns';

                    return (
                      <div key={category} className="space-y-0.5">
                        {/* ▾ Category Group Header */}
                        <div
                          onClick={() => toggleCategory(category)}
                          className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-white/5 cursor-pointer text-mac-textMuted hover:text-white transition group"
                        >
                          <div className="flex items-center space-x-1.5 truncate">
                            <i className={`ph ${isExpanded ? 'ph-caret-down' : 'ph-caret-right'} text-[10px]`} />
                            <i className={`ph ${catIcon} text-xs text-mac-textMuted group-hover:text-blue-400`} />
                            <span className="text-[11px] font-medium text-white/90">{category}</span>
                            <span className="text-[10px] text-mac-textMuted/60 font-mono">({items.length})</span>
                          </div>
                        </div>

                        {/* Items under Category */}
                        {isExpanded && (
                          <div className="pl-3 space-y-0.5 border-l border-white/5 ml-2">
                            {items.map((item: SceneHierarchyItem) => {
                              const isSelected = selectedNode?.id === item.id || selectedNode?.name === item.name;
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => handleSelectItem(item)}
                                  className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition group ${
                                    isSelected
                                      ? 'bg-blue-500/20 border border-blue-500/40 text-white'
                                      : 'hover:bg-white/10 text-mac-text border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    <i
                                      className={`ph ${item.icon} ${
                                        isSelected ? 'text-blue-400' : 'text-mac-textMuted group-hover:text-blue-400'
                                      } text-xs`}
                                    />
                                    <span className="truncate text-[11px] font-medium">{item.name}</span>
                                  </div>
                                  <span className="text-[8px] font-mono text-mac-textMuted/50 shrink-0 ml-1">
                                    {item.type.split('/')[1] || item.category}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 mt-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/70 px-1 py-1">
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
