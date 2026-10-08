/**
 * sessionManager — creates, loads, and deletes world generation sessions.
 * Each session is a named, timestamped container for a world graph.
 */
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { IWorldStorageAdapter } from '../../shared/storage/IWorldStorageAdapter';

export interface Session {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export class SessionManager {
  constructor(
    private readonly kvStore: IWorldStorageAdapter,
    private readonly graphStore: IGraphStore
  ) {}

  async createSession(prompt: string): Promise<Session> {
    const session: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.kvStore.save(`session:${session.id}`, session);
    await this.updateSessionList(session.id);
    return session;
  }

  async loadSession(id: string): Promise<Session | null> {
    return this.kvStore.load<Session>(`session:${id}`);
  }

  async updateSession(id: string, patch: Partial<Pick<Session, 'status'>>): Promise<void> {
    const existing = await this.loadSession(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    const updated: Session = { ...existing, ...patch, updatedAt: Date.now() };
    await this.kvStore.save(`session:${id}`, updated);
  }

  async listSessions(): Promise<Session[]> {
    const ids = await this.kvStore.load<string[]>('session:index') ?? [];
    const sessions = await Promise.all(ids.map((id) => this.loadSession(id)));
    return sessions.filter((s): s is Session => s !== null);
  }

  async deleteSession(id: string): Promise<void> {
    await this.graphStore.deleteNodes(id, []);  // cascade handled in store
    await this.kvStore.delete(`session:${id}`);
    const ids = await this.kvStore.load<string[]>('session:index') ?? [];
    await this.kvStore.save('session:index', ids.filter((i) => i !== id));
  }

  private async updateSessionList(id: string): Promise<void> {
    const ids = await this.kvStore.load<string[]>('session:index') ?? [];
    if (!ids.includes(id)) {
      await this.kvStore.save('session:index', [id, ...ids]);
    }
  }
}
