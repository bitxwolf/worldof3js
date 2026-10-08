// src/main/agents/runChildAgent.ts
import { z } from 'zod';
import type { AgentId } from '../../shared/agents/agentTypes';
import type { AgentRunRecord } from '../../shared/graph/graphTypes';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import { callLLM } from '../llm/callLLM';
import * as fs from 'fs';

function extractJson(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

function generateSummary<T>(agentId: AgentId, output: T): string {
  const o = output as Record<string, unknown>;
  // Code-generated summaries — no extra LLM call
  if (o['factions']) return `Story: ${(o['factions'] as unknown[]).length} factions, themes: ${(o['themes'] as string[] | undefined)?.join(', ') ?? ''}`;
  if (o['characters']) return `Characters: ${(o['characters'] as unknown[]).length} created`;
  if (o['regions']) return `World: ${(o['regions'] as unknown[]).length} regions, ${(o['landmarks'] as unknown[] | undefined)?.length ?? 0} landmarks`;
  if (o['npcs']) return `NPCs: ${(o['npcs'] as unknown[]).length} created`;
  if (o['quests']) return `Quests: ${(o['quests'] as unknown[]).length} created`;
  if (o['dialogueTrees']) return `Dialogue: ${(o['dialogueTrees'] as unknown[]).length} trees written`;
  return `${agentId} agent completed`;
}

export interface ChildAgentResult<T> {
  output: T;
  summary: string;
  runRecord: AgentRunRecord;
}

export async function runChildAgent<T>(params: {
  agentId: AgentId;
  sessionId: string;
  systemPromptPath: string;   // absolute path to .md file
  slice: Record<string, unknown>;
  instructions: string;
  schema: z.ZodSchema<T>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<ChildAgentResult<T>> {
  const { agentId, sessionId, systemPromptPath, slice, instructions, schema, storeService, graphStore, signal } = params;

  const systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');
  const userMessage = `CONTEXT:\n${JSON.stringify(slice, null, 2)}\n\nINSTRUCTIONS:\n${instructions}\n\nRespond with valid JSON only.`;

  const startedAt = Date.now();
  let rawOutput = '';
  let status: AgentRunRecord['status'] = 'success';
  let error: string | undefined;
  let parsed: T | null = null;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const userMsg = attempt === 0
        ? userMessage
        : `${userMessage}\n\nPREVIOUS ATTEMPT FAILED WITH:\n${error}\n\nFix the JSON and respond again.`;

      rawOutput = await callLLM({
        systemPrompt,
        userMessage: userMsg,
        agentId,
        maxTokens: params.maxTokens ?? 4096,
        signal,
        storeService,
      });

      const cleaned = extractJson(rawOutput);
      const jsonParsed: unknown = JSON.parse(cleaned);
      const validated = schema.safeParse(jsonParsed);

      if (validated.success) {
        parsed = validated.data;
        status = attempt === 0 ? 'success' : 'retried';
        break;
      } else {
        const issues = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        error = `Schema validation failed: ${issues}`;
        if (attempt === 1) status = 'failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (attempt === 1) status = 'failed';
    }
  }

  const finishedAt = Date.now();
  const summary = parsed ? generateSummary(agentId, parsed) : `${agentId} failed`;

  const runRecord: AgentRunRecord = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    agentId,
    startedAt,
    finishedAt,
    status,
    inputSlice: JSON.stringify(slice).slice(0, 4000),
    rawOutput: rawOutput.slice(0, 8000),
    summary,
    error,
  };

  await graphStore.appendAgentRun(runRecord);

  if (!parsed) throw new Error(`[${agentId}] ${error ?? 'Unknown error'}`);

  return { output: parsed, summary, runRecord };
}
