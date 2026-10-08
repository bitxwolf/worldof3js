import React, { useState } from 'react';
import type { AgentId } from '../../../shared/agents/agentTypes';
import { FRONTIER_MODEL_HINTS } from '../../../shared/config/modelConfig';
import type { AgentModelConfig } from '../../../shared/config/modelConfig';

const AGENTS: AgentId[] = ['parent', 'story', 'character', 'world', 'npc', 'quest', 'dialogue'];

const AGENT_LABELS: Record<AgentId, { name: string; role: string }> = {
  parent: { name: 'Parent Orchestrator', role: 'Coordinates pipeline, reviews consistency, resolves conflicts' },
  story: { name: 'Story Agent', role: 'Narrative arc, lore bible, factions, history' },
  character: { name: 'Character Agent', role: 'Protagonist, backstory, motives, companion bonds' },
  world: { name: 'World Agent', role: 'Regions, topology, biomes, landmarks, climate' },
  npc: { name: 'NPC Agent', role: 'NPC profiles, placements, factions, archetypes' },
  quest: { name: 'Quest Agent', role: 'Quest objectives, stages, item rewards, branches' },
  dialogue: { name: 'Dialogue Agent', role: 'Dialogue nodes, voice styles, response trees' },
};

export interface AgentOverridesSectionProps {
  overrides: AgentModelConfig;
  onChange: (overrides: AgentModelConfig) => void;
}

export const AgentOverridesSection: React.FC<AgentOverridesSectionProps> = ({ overrides, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const activeCount = Object.keys(overrides || {}).filter(
    (key) => overrides[key as AgentId]?.model
  ).length;

  const handleToggle = (agent: AgentId, enabled: boolean) => {
    const next: AgentModelConfig = { ...overrides };
    if (enabled) {
      next[agent] = {
        provider: overrides[agent]?.provider ?? 'anthropic',
        model: overrides[agent]?.model ?? '',
      };
    } else {
      delete next[agent];
    }
    onChange(next);
  };

  const handleProviderChange = (agent: AgentId, provider: 'anthropic' | 'openai') => {
    onChange({
      ...overrides,
      [agent]: {
        ...overrides[agent],
        provider,
      },
    });
  };

  const handleModelChange = (agent: AgentId, model: string) => {
    onChange({
      ...overrides,
      [agent]: {
        ...overrides[agent],
        model,
      },
    });
  };

  return (
    <div className="settings-card border border-gray-800 rounded-xl overflow-hidden bg-gray-950/40">
      {/* Accordion Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 text-left bg-gray-900/60 hover:bg-gray-800/60 transition-colors cursor-pointer select-none rounded-lg"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-200">🤖 Agent Model Overrides</span>
          {activeCount > 0 ? (
            <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {activeCount} {activeCount === 1 ? 'override' : 'overrides'}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">Default models</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{isOpen ? 'Hide' : 'Configure'}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="p-3.5 space-y-4 border-t border-gray-800/80">
          {/* Informative Frontier Model Hint Note */}
          <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-3 text-xs text-indigo-200/90 leading-relaxed flex items-start gap-2.5">
            <span className="text-base select-none leading-none mt-0.5">💡</span>
            <div>
              <span className="font-semibold text-indigo-100">Frontier Model Recommendation: </span>
              {FRONTIER_MODEL_HINTS.complex_task_note}
            </div>
          </div>

          {/* Agents List */}
          <div className="space-y-3">
            {AGENTS.map((agent) => {
              const config = overrides[agent];
              const isEnabled = agent in overrides && config !== undefined;
              const meta = AGENT_LABELS[agent];
              const provider = config?.provider === 'openai' ? 'openai' : 'anthropic';
              const modelVal = config?.model ?? '';

              return (
                <div
                  key={agent}
                  className={`p-3 rounded-lg border transition-colors ${
                    isEnabled
                      ? 'bg-gray-900/70 border-indigo-500/30 shadow-sm'
                      : 'bg-gray-950/30 border-gray-800/60 opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) => handleToggle(agent, e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 bg-gray-900 border-gray-700 focus:ring-indigo-500 focus:ring-offset-gray-900"
                      />
                      <div>
                        <div className="text-xs font-semibold text-gray-200">{meta.name}</div>
                        <div className="text-[11px] text-gray-400">{meta.role}</div>
                      </div>
                    </label>

                    {isEnabled && (
                      <span className="text-[10px] text-indigo-400 font-medium px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40">
                        Custom
                      </span>
                    )}
                  </div>

                  {isEnabled && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-800/60 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* Provider Select */}
                      <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">
                          Provider
                        </label>
                        <select
                          value={provider}
                          onChange={(e) => handleProviderChange(agent, e.target.value as 'anthropic' | 'openai')}
                          className="settings-select w-full text-xs"
                        >
                          <option value="anthropic">Anthropic</option>
                          <option value="openai">OpenAI / OpenRouter</option>
                        </select>
                      </div>

                      {/* Model Input */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">
                          Model Identifier
                        </label>
                        <input
                          type="text"
                          value={modelVal}
                          onChange={(e) => handleModelChange(agent, e.target.value)}
                          placeholder={
                            provider === 'anthropic'
                              ? 'e.g. claude-3-7-sonnet-20250219'
                              : 'e.g. gpt-4o'
                          }
                          className="settings-input w-full text-xs"
                        />
                      </div>

                      {/* Quick Model Hints */}
                      <div className="sm:col-span-3 flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] text-gray-400">Suggestions:</span>
                        {(provider === 'anthropic'
                          ? FRONTIER_MODEL_HINTS.anthropic
                          : FRONTIER_MODEL_HINTS.openai
                        ).map((hint) => (
                          <button
                            key={hint}
                            type="button"
                            onClick={() => handleModelChange(agent, hint)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/70 hover:bg-gray-700/70 text-gray-300 border border-gray-700/50 transition-colors"
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
