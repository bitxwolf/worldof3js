/**
 * SQLite-backed implementations of IWorldStorageAdapter and IGraphStore.
 * Only import from src/main — never from src/shared or src/renderer.
 */
import type { IWorldStorageAdapter } from '../../shared/storage/IWorldStorageAdapter';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import { getDb } from './db';

// ─── SQLite Key/Value Store ──────────────────────────────────────────────────

export class SqliteStorageAdapter implements IWorldStorageAdapter {
  async save(key: string, data: unknown): Promise<void> {
    const db = getDb();
    const stmt = db.prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`);
    stmt.run(key, JSON.stringify(data));
  }

  async load<T>(key: string): Promise<T | null> {
    const db = getDb();
    const row = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as T;
  }

  async delete(key: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM kv WHERE key = ?`).run(key);
  }
}

// ─── SQLite Graph Store ──────────────────────────────────────────────────────

export class SqliteGraphStore implements IGraphStore {
  async loadSession(
    sessionId: string
  ): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] }> {
    const db = getDb();

    const rawNodes = db
      .prepare(`SELECT * FROM nodes WHERE session_id = ?`)
      .all(sessionId) as Array<Record<string, unknown>>;

    const rawEdges = db
      .prepare(`SELECT * FROM edges WHERE session_id = ?`)
      .all(sessionId) as Array<Record<string, unknown>>;

    const nodes: GraphNodeRecord[] = rawNodes.map((r) => ({
      id: r['id'] as string,
      type: r['type'] as GraphNodeRecord['type'],
      attrs: JSON.parse(r['attrs'] as string),
      x: r['x'] as number,
      y: r['y'] as number,
      z: r['z'] as number,
      createdBy: r['created_by'] as GraphNodeRecord['createdBy'],
      version: r['version'] as number,
      updatedAt: r['updated_at'] as number,
    }));

    const edges: GraphEdgeRecord[] = rawEdges.map((r) => ({
      id: r['id'] as string,
      source: r['source'] as string,
      target: r['target'] as string,
      type: r['type'] as GraphEdgeRecord['type'],
      attrs: r['attrs'] ? JSON.parse(r['attrs'] as string) : undefined,
      createdBy: r['created_by'] as GraphEdgeRecord['createdBy'],
    }));

    return { nodes, edges };
  }

  async upsertNodes(sessionId: string, nodes: GraphNodeRecord[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO nodes
        (session_id, id, type, attrs, x, y, z, created_by, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertMany = db.transaction((rows: GraphNodeRecord[]) => {
      for (const n of rows) {
        stmt.run(
          sessionId,
          n.id,
          n.type,
          JSON.stringify(n.attrs),
          n.x,
          n.y,
          n.z,
          n.createdBy,
          n.version,
          n.updatedAt
        );
      }
    });
    upsertMany(nodes);
  }

  async upsertEdges(sessionId: string, edges: GraphEdgeRecord[]): Promise<void> {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO edges
        (session_id, id, source, target, type, attrs, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertMany = db.transaction((rows: GraphEdgeRecord[]) => {
      for (const e of rows) {
        stmt.run(
          sessionId,
          e.id,
          e.source,
          e.target,
          e.type,
          e.attrs ? JSON.stringify(e.attrs) : null,
          e.createdBy
        );
      }
    });
    upsertMany(edges);
  }

  async deleteNodes(sessionId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = getDb();

    const placeholders = ids.map(() => '?').join(', ');

    const deleteNodesFn = db.transaction(() => {
      // Delete edges first (source or target)
      db.prepare(
        `DELETE FROM edges WHERE session_id = ? AND (source IN (${placeholders}) OR target IN (${placeholders}))`
      ).run(sessionId, ...ids, ...ids);

      // Delete nodes
      db.prepare(
        `DELETE FROM nodes WHERE session_id = ? AND id IN (${placeholders})`
      ).run(sessionId, ...ids);
    });

    deleteNodesFn();
  }

  async appendAgentRun(run: AgentRunRecord): Promise<void> {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO agent_runs
        (id, session_id, agent_id, started_at, finished_at, status, input_slice, raw_output, summary, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.sessionId,
      run.agentId,
      run.startedAt,
      run.finishedAt,
      run.status,
      run.inputSlice,
      run.rawOutput,
      run.summary,
      run.error ?? null
    );
  }
}
