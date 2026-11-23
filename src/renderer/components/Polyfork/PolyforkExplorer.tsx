import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import type { PolyforkAsset } from '../../../shared/ipc.types';
import { sharedClipsFor } from '../../engine/NPCSystem';

const DEFAULT_KITS = [
  { id: '', title: 'All Kits' },
  { id: 'medieval', title: 'Medieval' },
  { id: 'dungeon', title: 'Dungeon' },
  { id: 'scifi', title: 'Sci-Fi' },
  { id: 'nature', title: 'Nature' },
  { id: 'pirate', title: 'Pirate' },
  { id: 'cyberpunk', title: 'Cyberpunk' },
  { id: 'apocalyptic', title: 'Apocalyptic' },
];

const DEFAULT_CLASSES = [
  { id: '', title: 'All Classes' },
  { id: 'prop', title: 'Props' },
  { id: 'building', title: 'Buildings' },
  { id: 'character', title: 'Characters' },
  { id: 'vehicle', title: 'Vehicles' },
];

export const PolyforkExplorer: React.FC = () => {
  const { isPolyforkOpen, closePolyfork, showNotification } = useUIStore();
  const [kits, setKits] = useState<{ id: string; title: string }[]>(DEFAULT_KITS);
  const [selectedKit, setSelectedKit] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [assets, setAssets] = useState<PolyforkAsset[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<PolyforkAsset | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [activeClipName, setActiveClipName] = useState<string>('Idle');
  const [availableClips, setAvailableClips] = useState<string[]>([]);

  // Preview canvas & 3D state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewSceneRef = useRef<THREE.Scene | null>(null);
  const previewRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const previewControlsRef = useRef<OrbitControls | null>(null);
  const previewMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const previewActionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const currentModelRef = useRef<THREE.Object3D | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Load kits on open
  useEffect(() => {
    if (!isPolyforkOpen) return;

    if (window.electronAPI?.polyfork?.getKits) {
      window.electronAPI.polyfork.getKits().then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          setKits([{ id: '', title: 'All Kits' }, ...res.data]);
        }
      }).catch(() => {});
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePolyfork();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPolyforkOpen, closePolyfork]);

  // Search assets when filter or query changes
  useEffect(() => {
    if (!isPolyforkOpen) return;

    let isSubscribed = true;
    setIsLoading(true);

    const performSearch = async () => {
      try {
        if (window.electronAPI?.polyfork?.searchAssets) {
          const res = await window.electronAPI.polyfork.searchAssets({
            kit: selectedKit || undefined,
            class: selectedClass || undefined,
            query: searchQuery.trim() || undefined,
            limit: 60,
          });

          if (isSubscribed && res.success && res.data) {
            setAssets(res.data);
            if (res.data.length > 0 && !selectedAsset) {
              setSelectedAsset(res.data[0]);
            }
          }
        } else {
          // In test/mock environment
          const mockAssets: PolyforkAsset[] = [
            { id: 'building_cottage_01', title: 'Medieval Cottage', kit: 'medieval', kit_title: 'Medieval', class: 'building', glb: 'building_cottage_01.glb', triangles: 850 },
            { id: 'prop_wooden_crate', title: 'Wooden Crate', kit: 'medieval', kit_title: 'Medieval', class: 'prop', glb: 'prop_wooden_crate.glb', triangles: 120 },
            { id: 'char_guard_armored', title: 'Armored Guard', kit: 'medieval', kit_title: 'Medieval', class: 'character', glb: 'char_guard_armored.glb', triangles: 1400, rigged: true },
            { id: 'scifi_generator', title: 'Power Generator', kit: 'scifi', kit_title: 'Sci-Fi', class: 'prop', glb: 'scifi_generator.glb', triangles: 960 },
          ];
          if (isSubscribed) {
            setAssets(mockAssets);
            if (!selectedAsset) setSelectedAsset(mockAssets[0]);
          }
        }
      } catch (err) {
        console.warn('[PolyforkExplorer] Search error:', err);
      } finally {
        if (isSubscribed) setIsLoading(false);
      }
    };

    const timer = setTimeout(performSearch, 150);
    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [isPolyforkOpen, selectedKit, selectedClass, searchQuery]);

  // Setup preview 3D viewport
  useEffect(() => {
    if (!isPolyforkOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);
    previewSceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);
    camera.position.set(2, 2, 2.5);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    previewRendererRef.current = renderer;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    previewControlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    const sunLight = new THREE.DirectionalLight(0xfff8ee, 1.8);
    sunLight.position.set(4, 6, 4);
    sunLight.castShadow = true;
    scene.add(ambientLight, sunLight);

    // Subtle grid
    const grid = new THREE.GridHelper(6, 12, 0x374151, 0x1f2937);
    grid.position.y = 0;
    scene.add(grid);

    const clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (previewMixerRef.current) {
        previewMixerRef.current.update(delta);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      previewSceneRef.current = null;
      previewRendererRef.current = null;
      previewControlsRef.current = null;
    };
  }, [isPolyforkOpen]);

  // Update OrbitControls autoRotate
  useEffect(() => {
    if (previewControlsRef.current) {
      previewControlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Load selected model into preview viewport
  useEffect(() => {
    if (!selectedAsset || !previewSceneRef.current) return;

    let isCancelled = false;
    const scene = previewSceneRef.current;

    // Remove previous model
    if (currentModelRef.current) {
      scene.remove(currentModelRef.current);
      currentModelRef.current.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      currentModelRef.current = null;
    }

    if (previewMixerRef.current) {
      previewMixerRef.current.stopAllAction();
      previewMixerRef.current = null;
    }
    previewActionsRef.current.clear();
    setAvailableClips([]);
    setIsPreviewLoading(true);

    const loadPreview = async () => {
      // Ensure model is cached locally before loading into Three.js preview
      if (window.electronAPI?.polyfork?.downloadAsset) {
        try {
          await window.electronAPI.polyfork.downloadAsset(selectedAsset.id);
        } catch (downloadErr) {
          console.warn(`[PolyforkExplorer] Pre-download failed for ${selectedAsset.id}:`, downloadErr);
        }
      }

      if (isCancelled || !previewSceneRef.current) {
        setIsPreviewLoading(false);
        return;
      }

      const loader = new GLTFLoader();
      const modelUrl = `polyfork://${selectedAsset.id}.glb`;

      loader.load(
        modelUrl,
        async (gltf) => {
          if (isCancelled || !previewSceneRef.current) return;
          setIsPreviewLoading(false);

          const model = gltf.scene;
          currentModelRef.current = model;

          model.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              if (wireframe && o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach((m) => {
                  if ('wireframe' in m) m.wireframe = true;
                });
              }
            }
          });

          // Frame model in camera
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;

          model.position.sub(center); // center model at 0,0,0
          model.position.y += size.y / 2; // ground model at y=0
          scene.add(model);

          if (previewControlsRef.current) {
            previewControlsRef.current.target.set(0, size.y / 2, 0);
            previewControlsRef.current.minDistance = maxDim * 0.5;
            previewControlsRef.current.maxDistance = maxDim * 5;
          }

          // Handle animation clips (Mixamo retargeting if rigged)
          const sharedClips = await sharedClipsFor(model);
          const ownAnimations = gltf.animations || [];
          const ownNames = new Set(ownAnimations.map((a) => a.name));
          const allClips = [...ownAnimations, ...sharedClips.filter((c) => !ownNames.has(c.name))];

          if (allClips.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            previewMixerRef.current = mixer;
            const clipNames: string[] = [];

            allClips.forEach((clip) => {
              const action = mixer.clipAction(clip);
              previewActionsRef.current.set(clip.name, action);
              clipNames.push(clip.name);
            });

            setAvailableClips(clipNames);
            const initialClip = clipNames.includes('Idle') ? 'Idle' : clipNames[0];
            setActiveClipName(initialClip);
            const initialAction = previewActionsRef.current.get(initialClip);
            if (initialAction) initialAction.play();
          }
        },
        undefined,
        (err) => {
          if (!isCancelled) {
            setIsPreviewLoading(false);
            console.warn(`[PolyforkExplorer] Preview load failed for ${selectedAsset.id}:`, err);
          }
        }
      );
    };

    void loadPreview();

    return () => {
      isCancelled = true;
    };
  }, [selectedAsset, wireframe]);

  // Handle clip selection change
  const handleClipChange = (clipName: string) => {
    setActiveClipName(clipName);
    const mixer = previewMixerRef.current;
    if (!mixer) return;

    previewActionsRef.current.forEach((action, name) => {
      if (name === clipName) {
        action.reset().fadeIn(0.2).play();
      } else {
        action.fadeOut(0.2);
      }
    });
  };

  // Insert into world
  const handleInsert = () => {
    if (!selectedAsset) return;

    const playerPos = useWorldStore.getState().playerPosition || [0, 0, 0];
    const assetId = `polyfork:${selectedAsset.id}`;

    // Place model 2.5 meters in front of the player
    const spawnX = Math.round((playerPos[0] + 2.5) * 10) / 10;
    const spawnZ = Math.round((playerPos[2] + 2.5) * 10) / 10;

    const isFigure =
      selectedAsset.class === 'character' ||
      selectedAsset.class === 'animal' ||
      selectedAsset.class === 'creature' ||
      selectedAsset.class === 'figure' ||
      Boolean(selectedAsset.rigged);

    const safeId = `${selectedAsset.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;

    const newChar = isFigure
      ? {
          id: safeId,
          name: selectedAsset.title,
          description: `A ${selectedAsset.title} figure imported from Polyfork library.`,
          personality: 'Curious and friendly observer.',
          secrets: [],
          knowledge: [],
          position: [spawnX, 0, spawnZ] as [number, number, number],
          behavior: 'idle' as const,
          modelId: assetId,
          assetUrl: assetId,
          rigged: selectedAsset.rigged ?? true,
        }
      : null;

    const newObj = !isFigure
      ? {
          id: safeId,
          name: selectedAsset.title,
          type: selectedAsset.class || 'prop',
          assetId,
          position: [spawnX, 0, spawnZ] as [number, number, number],
          collidable: true,
          interactable: true,
          pickable: false,
          locked: false,
        }
      : null;

    const partialPatch = isFigure && newChar
      ? { characters: [newChar] }
      : newObj
      ? { objects: [newObj] }
      : {};

    // 1. Dispatch custom engine patch event for live rendering
    window.dispatchEvent(
      new CustomEvent('engine:apply-world-patch', {
        detail: {
          partial: partialPatch,
          ...partialPatch,
        },
      })
    );

    // 2. Persist in WorldStore sceneGraph
    useWorldStore.getState().patchSceneGraph(partialPatch);

    showNotification(`Imported ${selectedAsset.title} into the world!`, 3000, 'success');
  };

  // Copy Asset ID
  const handleCopyId = () => {
    if (!selectedAsset) return;
    const tag = `polyfork:${selectedAsset.id}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(tag)
        .then(() => {
          showNotification(`Copied "${tag}" to clipboard`, 2500, 'info');
        })
        .catch(() => {
          showNotification(`Asset ID: "${tag}"`, 3000, 'info');
        });
    } else {
      showNotification(`Asset ID: "${tag}"`, 3000, 'info');
    }
  };

  // Download / Pre-cache
  const handleDownload = async () => {
    if (!selectedAsset || isDownloading) return;
    setIsDownloading(true);
    try {
      if (window.electronAPI?.polyfork?.downloadAsset) {
        const res = await window.electronAPI.polyfork.downloadAsset(selectedAsset.id);
        if (res.success) {
          showNotification(`Cached ${selectedAsset.title} locally`, 3000, 'success');
          // Update local status
          setAssets((prev) =>
            prev.map((a) => (a.id === selectedAsset.id ? { ...a, bytes: res.data?.bytes || 1 } : a))
          );
        } else {
          showNotification(`Download failed: ${res.error?.message}`, 3000, 'warning');
        }
      }
    } catch (err) {
      showNotification('Download failed', 3000, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isPolyforkOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-5xl h-[85vh] bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="h-14 px-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            <span className="text-xl">📦</span>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">
                Polyfork 3D Asset Library
              </h2>
              <p className="text-xs text-gray-400">
                Browse, preview, and place real low-poly models with universal Mixamo animations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePolyfork}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-3 px-6 border-b border-gray-800/80 bg-gray-900/30 flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search assets (e.g., cottage, tree, knight, cart)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Kit Filter */}
          <select
            value={selectedKit}
            onChange={(e) => setSelectedKit(e.target.value)}
            className="bg-gray-900 border border-gray-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {kits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title}
              </option>
            ))}
          </select>

          {/* Class Filter */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="bg-gray-900 border border-gray-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {DEFAULT_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <span className="text-xs text-gray-400 ml-auto">
            {isLoading ? 'Loading...' : `${assets.length} models`}
          </span>
        </div>

        {/* Main Body: Catalog List + 3D Preview */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Grid: Assets */}
          <div className="flex-1 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assets.length === 0 && !isLoading && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500">
                <span className="text-3xl mb-2">🏜️</span>
                <p className="text-sm font-medium">No assets matching your filters</p>
                <p className="text-xs text-gray-600 mt-1">Try searching for other keywords or clearing kit filters</p>
              </div>
            )}

            {assets.map((asset) => {
              const isSelected = selectedAsset?.id === asset.id;
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`group relative flex flex-col p-2.5 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                      : 'bg-gray-900/60 border-gray-800/80 hover:bg-gray-850 hover:border-gray-700'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-full h-24 rounded-lg bg-gray-950/80 border border-gray-800/60 flex items-center justify-center overflow-hidden mb-2">
                    {asset.thumb ? (
                      <img
                        src={`polyfork://${asset.thumb}`}
                        alt={asset.title}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          // Hide broken image and show 3D fallback icon
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-2xl text-gray-600">🏛️</span>
                    )}
                  </div>

                  {/* Title & Kit */}
                  <h4 className="text-xs font-semibold text-white truncate" title={asset.title}>
                    {asset.title}
                  </h4>

                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 capitalize">
                      {asset.kit || 'kit'}
                    </span>
                    {asset.rigged && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 font-mono">
                        rigged
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Pane: 3D Interactive Viewport & Actions */}
          <div className="w-80 border-l border-gray-800 bg-gray-900/30 flex flex-col">
            {/* Viewport */}
            <div className="h-64 relative bg-gray-950 border-b border-gray-800">
              <canvas ref={canvasRef} className="w-full h-full block" />

              {/* Loading Spinner Overlay */}
              {isPreviewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs text-xs text-blue-400 gap-2">
                  <span className="animate-spin text-base">⏳</span>
                  <span>Loading 3D model...</span>
                </div>
              )}

              {/* Viewport Toggles */}
              <div className="absolute top-2 right-2 flex gap-1 bg-black/60 backdrop-blur-sm p-1 rounded-md border border-white/10 text-[10px]">
                <button
                  type="button"
                  onClick={() => setWireframe((v) => !v)}
                  className={`px-1.5 py-0.5 rounded ${
                    wireframe ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Toggle Wireframe"
                >
                  Wire
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`px-1.5 py-0.5 rounded ${
                    autoRotate ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Toggle Orbit Auto-Rotate"
                >
                  Rotate
                </button>
              </div>

              {/* Animation Selector for Rigged Characters */}
              {availableClips.length > 0 && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/70 backdrop-blur-sm px-2 py-1 rounded-md border border-white/10 text-xs">
                  <span className="text-[10px] text-purple-300 font-medium flex items-center gap-1">
                    <span>💃</span> Clip:
                  </span>
                  <select
                    value={activeClipName}
                    onChange={(e) => handleClipChange(e.target.value)}
                    className="bg-gray-800 text-white text-[11px] rounded px-1.5 py-0.5 border border-gray-700 focus:outline-none"
                  >
                    {availableClips.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Selected Asset Details */}
            {selectedAsset ? (
              <div className="p-4 flex-1 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">
                      {selectedAsset.title}
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                      polyfork:{selectedAsset.id}
                    </p>
                  </div>

                  {/* Attributes */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-gray-900 border border-gray-800">
                      <span className="text-[10px] text-gray-500 block uppercase">Kit</span>
                      <span className="font-medium text-gray-300 capitalize">
                        {selectedAsset.kit_title || selectedAsset.kit || 'Generic'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-gray-900 border border-gray-800">
                      <span className="text-[10px] text-gray-500 block uppercase">Class</span>
                      <span className="font-medium text-gray-300 capitalize">
                        {selectedAsset.class || 'Prop'}
                      </span>
                    </div>

                    {selectedAsset.triangles ? (
                      <div className="p-2 rounded bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 block uppercase">Triangles</span>
                        <span className="font-medium text-gray-300 font-mono">
                          {selectedAsset.triangles.toLocaleString()}
                        </span>
                      </div>
                    ) : null}

                    {selectedAsset.size_m ? (
                      <div className="p-2 rounded bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 block uppercase">Size (M)</span>
                        <span className="font-medium text-gray-300 font-mono text-[11px]">
                          {selectedAsset.size_m.x.toFixed(1)} × {selectedAsset.size_m.y.toFixed(1)} × {selectedAsset.size_m.z.toFixed(1)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-4">
                  <button
                    type="button"
                    onClick={handleInsert}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <span>➕</span> Insert into Scene
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700 transition flex items-center justify-center gap-1"
                      title="Copy asset ID to clipboard"
                    >
                      📋 Copy ID
                    </button>

                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700 transition flex items-center justify-center gap-1"
                      title="Pre-cache model locally"
                    >
                      {isDownloading ? '⏳ Caching...' : '📥 Cache'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-500 p-4 text-center">
                Select an asset on the left to inspect and place
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
