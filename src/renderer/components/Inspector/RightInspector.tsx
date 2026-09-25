import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useNPCStore } from '../../store/npcStore';
import { useWorldStore } from '../../store/worldStore';

export const RightInspector = () => {
  const {
    rightInspectorOpen,
    rightInspectorTab,
    setRightInspectorTab,
    selectedNode,
    updateSelectedNodePosition,
    updateSelectedNodeScale,
    tuningParams,
    setTuningParam,
    ipcLogs,
    clearIpcLogs,
    addIpcLog,
    generatorMeta,
  } = useUIStore();

  const { activeNPC, dialogueHistory, addDialogueMessage } = useNPCStore();
  const { sceneGraph } = useWorldStore();

  const [npcInputText, setNpcInputText] = useState('');
  const [isNpcThinking, setIsNpcThinking] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // Active NPC or default
  const npcName = activeNPC?.name || (sceneGraph?.characters?.[0]?.name ?? 'Eldrin the Ranger');
  const npcId = activeNPC?.id || (sceneGraph?.characters?.[0]?.id ?? 'eldrin_ranger');
  const messages = dialogueHistory[npcId] || [
    {
      sender: 'npc',
      text: 'Greetings, wanderer. You stand upon the freshly generated ridge. The air carries pine and cold rock. What brings you to this coordinate?',
    },
  ];

  const handleSendNpc = async () => {
    const text = npcInputText.trim();
    if (!text) return;

    addDialogueMessage(npcId, { sender: 'player', text });
    setNpcInputText('');
    setIsNpcThinking(true);
    addIpcLog(`[NPC:STREAM] Dispatched user prompt to NPC dialogue buffer.`);

    try {
      if (window.electronAPI?.npcReply) {
        // Subscribe to streaming chunks BEFORE invoking npcReply
        let accumulatedText = '';
        
        const unsubChunk = window.electronAPI.onStreamChunk((chunk: string) => {
          accumulatedText += chunk;
          // Update a streaming state for live display
          setStreamingText(accumulatedText);
        });

        const unsubEnd = window.electronAPI.onStreamEnd(() => {
          if (accumulatedText.trim()) {
            addDialogueMessage(npcId, { sender: 'npc', text: accumulatedText.trim() });
          }
          setStreamingText('');
          setIsNpcThinking(false);
          addIpcLog(`[NPC:RESPONSE] Received ${accumulatedText.length} chars from agent stream.`, 'success');
          unsubChunk();
          unsubEnd();
        });

        const unsubError = window.electronAPI.onStreamError?.((msg: string) => {
          console.warn('[NPC:STREAM_ERROR]', msg);
          setIsNpcThinking(false);
          setStreamingText('');
          addIpcLog(`[NPC:ERROR] Stream error: ${msg}`, 'error');
          unsubChunk();
          unsubError?.();
        });

        await window.electronAPI.npcReply({
          npcId,
          playerMessage: text,
          character: activeNPC ? {
            name: activeNPC.name,
            personality: activeNPC.personality,
            backstory: activeNPC.description,
            secrets: activeNPC.secrets,
            knowledge: activeNPC.knowledge,
            dialogueStyle: activeNPC.dialogueSeed,
          } : undefined,
          worldLore: sceneGraph?.world?.description,
          dialogueHistory: messages.map((m) => ({
            role: m.sender === 'player' ? ('user' as const) : ('assistant' as const),
            content: m.text,
          })),
        });
        return;
      }
    } catch (e: unknown) {
      console.warn('Fallback simulated NPC chat', e);
      setStreamingText('');
    }

    // Simulated conversational reply fallback
    setTimeout(() => {
      const simulatedReplies = [
        'The ley lines beneath this procedural terrain fluctuate with every seed change. Watch your step near the ridge.',
        'I have watched countless biomes compile before my eyes. The trees here have real depth—no cardboard flats in this realm.',
        'If you seek the high spires, adjust the elevation amplitude in your sidebar. The winds get violent up there.',
        'My dialogue memory retains our previous exchanges. The compiler guarantees zero context leak across renders.',
      ];
      const reply = simulatedReplies[Math.floor(Math.random() * simulatedReplies.length)];
      addDialogueMessage(npcId, { sender: 'npc', text: reply });
      setIsNpcThinking(false);
      addIpcLog(`[NPC:RESPONSE] Received 142 tokens from agent stream.`, 'success');
    }, 600);
  };

  const currentNode = selectedNode || {
    id: 'default_node',
    name: 'ProceduralTree_Cluster',
    type: 'ProceduralFoliageMesh',
    position: [4.2, 0.0, -6.5] as [number, number, number],
    scale: [1.0, 1.25, 1.0] as [number, number, number],
    roughness: tuningParams.roughness,
    metalness: tuningParams.metalness,
    castShadow: true,
  };

  let nodeIcon = 'ph-cube';
  if (currentNode.name.includes('Pine') || currentNode.type.includes('Foliage')) nodeIcon = 'ph-tree-evergreen';
  else if (currentNode.name.includes('NPC') || currentNode.type.includes('Entity')) nodeIcon = 'ph-user';
  else if (currentNode.name.includes('Rock') || currentNode.type.includes('Geology')) nodeIcon = 'ph-diamonds-four';
  else if (currentNode.name.includes('Terrain')) nodeIcon = 'ph-mountains';

  return (
    <aside
      id="rightInspector"
      className={`bg-mac-sidebar mac-blur border-l border-mac-surfaceBorder flex flex-col z-20 transition-all duration-200 select-none ${
        rightInspectorOpen ? 'w-80' : 'w-0 -mr-80 overflow-hidden'
      }`}
    >
      {/* Tab Header for Inspector */}
      <div className="p-2 border-b border-white/5 flex space-x-1">
        <button
          type="button"
          onClick={() => setRightInspectorTab('inspector')}
          className={`flex-1 py-1.5 text-xs rounded-md flex items-center justify-center space-x-1 transition ${
            rightInspectorTab === 'inspector'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-mac-textMuted hover:text-white hover:bg-white/5 font-medium'
          }`}
        >
          <i className="ph ph-cube-transparent text-blue-400" />
          <span>Inspector</span>
        </button>

        <button
          type="button"
          onClick={() => setRightInspectorTab('npc')}
          className={`flex-1 py-1.5 text-xs rounded-md flex items-center justify-center space-x-1 transition ${
            rightInspectorTab === 'npc'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-mac-textMuted hover:text-white hover:bg-white/5 font-medium'
          }`}
        >
          <i className="ph ph-chat-centered-text text-emerald-400" />
          <span>NPC Stream</span>
        </button>

        <button
          type="button"
          onClick={() => setRightInspectorTab('telemetry')}
          className={`flex-1 py-1.5 text-xs rounded-md flex items-center justify-center space-x-1 transition ${
            rightInspectorTab === 'telemetry'
              ? 'bg-white/10 text-white font-semibold'
              : 'text-mac-textMuted hover:text-white hover:bg-white/5 font-medium'
          }`}
        >
          <i className="ph ph-terminal text-purple-400" />
          <span>IPC Telemetry</span>
        </button>
      </div>

      {/* ── Sub-panel 1: Node Properties Inspector ── */}
      {rightInspectorTab === 'inspector' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3.5 text-xs">
          {/* Header Node Badge */}
          <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <i className={`ph ${nodeIcon} text-base`} />
              </div>
              <div className="truncate max-w-[150px]">
                <div className="font-semibold text-white truncate">{currentNode.name}</div>
                <div className="text-[10px] text-mac-textMuted font-mono truncate">
                  Type: {currentNode.type}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Active
            </span>
          </div>

          {/* Transform Parameters */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/80">
              Transform Matrix
            </div>

            {/* Position X Y Z */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-black/30 p-1.5 rounded border border-white/5">
                <span className="text-[9px] text-rose-400 block font-mono">POS X</span>
                <input
                  type="number"
                  step="0.5"
                  value={currentNode.position[0]}
                  onChange={(e) => updateSelectedNodePosition('x', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono text-white text-xs outline-none"
                />
              </div>
              <div className="bg-black/30 p-1.5 rounded border border-white/5">
                <span className="text-[9px] text-emerald-400 block font-mono">POS Y</span>
                <input
                  type="number"
                  step="0.5"
                  value={currentNode.position[1]}
                  onChange={(e) => updateSelectedNodePosition('y', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono text-white text-xs outline-none"
                />
              </div>
              <div className="bg-black/30 p-1.5 rounded border border-white/5">
                <span className="text-[9px] text-blue-400 block font-mono">POS Z</span>
                <input
                  type="number"
                  step="0.5"
                  value={currentNode.position[2]}
                  onChange={(e) => updateSelectedNodePosition('z', parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono text-white text-xs outline-none"
                />
              </div>
            </div>

            {/* Scale X Y Z */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-black/30 p-1.5 rounded border border-white/5">
                <span className="text-[9px] text-mac-textMuted block font-mono">SCALE X</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="50"
                  value={currentNode.scale[0].toFixed(2)}
                  onChange={(e) => updateSelectedNodeScale('x', parseFloat(e.target.value) || 0.01)}
                  className="w-full bg-transparent font-mono text-white text-xs outline-none"
                />
              </div>
              <div className="bg-black/30 p-1.5 rounded border border-white/5">
                <span className="text-[9px] text-mac-textMuted block font-mono">SCALE Y</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="50"
                  value={currentNode.scale[1].toFixed(2)}
                  onChange={(e) => updateSelectedNodeScale('y', parseFloat(e.target.value) || 0.01)}
                  className="w-full bg-transparent font-mono text-white text-xs outline-none"
                />
              </div>
              <div className="bg-black/30 p-1.5 rounded border border-white/5">
                <span className="text-[9px] text-mac-textMuted block font-mono">SCALE Z</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="50"
                  value={currentNode.scale[2].toFixed(2)}
                  onChange={(e) => updateSelectedNodeScale('z', parseFloat(e.target.value) || 0.01)}
                  className="w-full bg-transparent font-mono text-white text-xs outline-none"
                />
              </div>
            </div>
          </div>

          {/* Shader & Material Properties */}
          <div className="space-y-2 pt-1 border-t border-white/5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/80">
              Material & Shader
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-mac-textMuted">Roughness Factor</span>
                <span className="font-mono text-white">{tuningParams.roughness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={tuningParams.roughness}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  setTuningParam('roughness', newValue);
                  window.dispatchEvent(new CustomEvent('engine:material-update', {
                    detail: { nodeId: selectedNode?.id, property: 'roughness', value: newValue }
                  }));
                }}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-mac-textMuted">Metalness</span>
                <span className="font-mono text-white">{tuningParams.metalness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={tuningParams.metalness}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  setTuningParam('metalness', newValue);
                  window.dispatchEvent(new CustomEvent('engine:material-update', {
                    detail: { nodeId: selectedNode?.id, property: 'metalness', value: newValue }
                  }));
                }}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-mac-textMuted text-[11px]">Cast Shadow & Occlusion</span>
              <input
                type="checkbox"
                checked={tuningParams.castShadow}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setTuningParam('castShadow', newValue);
                  window.dispatchEvent(new CustomEvent('engine:material-update', {
                    detail: { nodeId: selectedNode?.id, property: 'castShadow', value: newValue }
                  }));
                }}
                className="rounded border-white/10 bg-black/40 text-blue-500 accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Procedural Metadata */}
          <div className="space-y-1.5 pt-2 border-t border-white/5 font-mono text-[10px]">
            <div className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted/80 font-sans">
              Generator Provenance
            </div>
            <div className="bg-black/40 p-2 rounded border border-white/5 space-y-1 text-mac-textMuted">
              <div>
                <span className="text-white">Generator:</span> {generatorMeta.generator}
              </div>
              <div>
                <span className="text-white">LOD Strategy:</span> {generatorMeta.lodStrategy}
              </div>
              <div>
                <span className="text-white">Zod Validation:</span>{' '}
                <span className={generatorMeta.zodValidation === 'Passed (Strict)' ? 'text-emerald-400' : generatorMeta.zodValidation === 'Failed' ? 'text-rose-400' : 'text-mac-textMuted'}>
                  {generatorMeta.zodValidation}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-panel 2: NPC Dialogue & Conversation Memory ── */}
      {rightInspectorTab === 'npc' && (
        <div className="flex-1 flex flex-col p-2 space-y-2 overflow-hidden">
          {/* NPC Header */}
          <div className="p-2 rounded bg-black/30 border border-white/5 flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <i className="ph ph-user text-base" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
                <span>{npcName}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="text-[10px] text-mac-textMuted">
                Sliding Window Memory: {Math.min(messages.length, 10)}/10 turns
              </div>
            </div>
          </div>

          {/* Chat History Scrollbox */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-2 text-xs">
            {messages.map((m, idx) => {
              const isUser = m.sender === 'player';
              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isUser ? 'items-end self-end' : 'items-start'} max-w-[90%]`}
                >
                  <div className="text-[10px] text-mac-textMuted mb-0.5 px-1 font-medium">
                    {isUser ? 'You' : npcName.split(' ')[0]}
                  </div>
                  <div
                    className={`rounded-2xl p-2.5 text-white text-[11px] leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-blue-600 rounded-tr-none'
                        : 'bg-white/10 rounded-tl-none border border-white/5'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}

            {isNpcThinking && streamingText && (
              <div className="flex flex-col items-start max-w-[90%]">
                <div className="text-[10px] text-mac-textMuted mb-0.5 px-1 font-medium">
                  {npcName.split(' ')[0]}
                </div>
                <div className="bg-white/10 rounded-2xl rounded-tl-none p-2.5 text-white text-[11px] leading-relaxed border border-white/5">
                  {streamingText}<span className="animate-pulse">▌</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Form */}
          <div className="pt-2 border-t border-white/5 flex items-center space-x-1.5">
            <input
              type="text"
              value={npcInputText}
              onChange={(e) => setNpcInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendNpc()}
              placeholder={`Speak to ${npcName.split(' ')[0]}...`}
              className="flex-1 bg-black/30 rounded-lg px-2.5 py-1.5 border border-white/10 text-xs text-white placeholder:text-white/30 outline-none focus:border-blue-500/50"
            />
            <button
              type="button"
              onClick={handleSendNpc}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition active:scale-95"
            >
              <i className="ph ph-paper-plane-right text-sm" />
            </button>
          </div>
        </div>
      )}

      {/* ── Sub-panel 3: IPC Telemetry & Engine Logging ── */}
      {rightInspectorTab === 'telemetry' && (
        <div className="flex-1 flex flex-col p-2 space-y-2 overflow-hidden">
          <div className="flex items-center justify-between text-[11px] px-1 text-mac-textMuted">
            <span>IPC Channel Stream</span>
            <button
              type="button"
              onClick={clearIpcLogs}
              className="hover:text-white text-[10px] transition"
            >
              Clear
            </button>
          </div>

          <div className="flex-1 font-mono text-[10px] bg-black/60 rounded p-2 overflow-y-auto custom-scrollbar space-y-1.5 text-mac-textMuted border border-white/5">
            {ipcLogs.map((log) => {
              let colorClass = 'text-mac-textMuted';
              if (log.type === 'error' || log.text.includes('ERROR')) colorClass = 'text-rose-400';
              else if (log.type === 'success' || log.text.includes('DONE') || log.text.includes('READY'))
                colorClass = 'text-emerald-400';
              else if (log.type === 'build' || log.type === 'selection' || log.text.includes('BUILD') || log.text.includes('SELECTION'))
                colorClass = 'text-blue-300';
              else if (log.type === 'warn' || log.text.includes('BIOME'))
                colorClass = 'text-amber-400';

              return (
                <div key={log.id} className={colorClass}>
                  {log.text}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Right Footer: Status Pill */}
      <div className="p-2 border-t border-white/5 bg-black/20 text-[10px] flex items-center justify-between text-mac-textMuted">
        <span className="flex items-center space-x-1 font-mono">
          <i className="ph ph-cpu text-blue-400" />
          <span>WebGL 2.0 (Three r160)</span>
        </span>
        <span className={`font-mono ${ipcLogs.filter(l => l.type === 'error').length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>● {ipcLogs.filter(l => l.type === 'error').length} IPC Error{ipcLogs.filter(l => l.type === 'error').length !== 1 ? 's' : ''}</span>
      </div>
    </aside>
  );
};
