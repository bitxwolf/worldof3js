/**
 * Opens and initializes the world.db SQLite database.
 * Only import this from src/main — never from src/shared or src/renderer.
 */
import type Database from 'better-sqlite3';

let _db: Database.Database | null = null;

function getDbPath(): string {
  try {
    const { app } = require('electron') as typeof import('electron');
    const path = require('path') as typeof import('path');
    return path.join(app.getPath('userData'), 'world.db');
  } catch {
    // Express server mode — store next to the process
    const path = require('path') as typeof import('path');
    return path.join(process.cwd(), 'world.db');
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
  const db = new BetterSqlite3(getDbPath());

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Schema migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      prompt     TEXT,
      status     TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS nodes (
      session_id TEXT    NOT NULL,
      id         TEXT    NOT NULL,
      type       TEXT    NOT NULL,
      attrs      TEXT    NOT NULL,
      x          REAL    NOT NULL DEFAULT 0,
      y          REAL    NOT NULL DEFAULT 0,
      z          REAL    NOT NULL DEFAULT 0,
      created_by TEXT    NOT NULL,
      version    INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE INDEX IF NOT EXISTS nodes_spatial ON nodes (session_id, x, z);

    CREATE TABLE IF NOT EXISTS edges (
      session_id TEXT NOT NULL,
      id         TEXT NOT NULL,
      source     TEXT NOT NULL,
      target     TEXT NOT NULL,
      type       TEXT NOT NULL,
      attrs      TEXT,
      created_by TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id          TEXT    PRIMARY KEY,
      session_id  TEXT    NOT NULL,
      agent_id    TEXT    NOT NULL,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      status      TEXT    NOT NULL,
      input_slice TEXT,
      raw_output  TEXT,
      summary     TEXT,
      error       TEXT
    );
  `);

  _db = db;
  return db;
}

/** Only used in tests to reset between runs */
export function _resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
