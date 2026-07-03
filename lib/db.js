import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Single shared connection. node:sqlite is synchronous (like better-sqlite3)
// but ships with Node itself — no native build step on Node 22+/25.
let _db = null;

function dbPath() {
  const p = process.env.LEARNFEED_DB_PATH || "./data/learnfeed.db";
  return resolve(process.cwd(), p);
}

export function getDb() {
  if (_db) return _db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  _db = new DatabaseSync(path);
  _db.exec("PRAGMA journal_mode = WAL;");
  _db.exec("PRAGMA foreign_keys = ON;");
  migrate(_db);
  seedSettings(_db);
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      active     INTEGER NOT NULL DEFAULT 1,
      -- rotation weight; lowered on skip-streaks, raised on full watches
      priority   REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id           TEXT PRIMARY KEY,          -- youtube id OR tiktok id
      source       TEXT NOT NULL DEFAULT 'youtube', -- 'youtube' | 'tiktok'
      url          TEXT,                      -- canonical url (needed for tiktok oEmbed)
      title        TEXT,
      description  TEXT,
      thumbnail_url TEXT,
      duration_sec INTEGER,
      topic_id     INTEGER REFERENCES interests(id) ON DELETE SET NULL,
      topic_name   TEXT,                      -- denormalized for search results w/o interest
      has_captions INTEGER NOT NULL DEFAULT 0,
      tags         TEXT,                      -- JSON array of tags/keywords
      watched      INTEGER NOT NULL DEFAULT 0,
      skipped      INTEGER NOT NULL DEFAULT 0,
      is_search    INTEGER NOT NULL DEFAULT 0, -- from one-off search, not rotation
      search_query TEXT,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_videos_topic ON videos(topic_id, watched, skipped);
    CREATE INDEX IF NOT EXISTS idx_videos_query ON videos(search_query, fetched_at);

    CREATE TABLE IF NOT EXISTS watch_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id    TEXT NOT NULL,
      watch_seconds REAL NOT NULL DEFAULT 0,
      completed   INTEGER NOT NULL DEFAULT 0,
      topic_id    INTEGER,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_watch_topic ON watch_events(topic_id);

    CREATE TABLE IF NOT EXISTS quiz_cache (
      video_id       TEXT PRIMARY KEY,
      question       TEXT,
      choices        TEXT,          -- JSON array
      correct_answer TEXT,
      difficulty     INTEGER DEFAULT 1,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Daily YouTube quota ledger. One row per UTC day.
    CREATE TABLE IF NOT EXISTS quota_log (
      day        TEXT PRIMARY KEY,   -- YYYY-MM-DD
      units_used INTEGER NOT NULL DEFAULT 0
    );

    -- Reliability tracking per source ('tiktok' | 'youtube').
    CREATE TABLE IF NOT EXISTS source_stats (
      source   TEXT PRIMARY KEY,
      success  INTEGER NOT NULL DEFAULT 0,
      failure  INTEGER NOT NULL DEFAULT 0,
      last_ok  TEXT,
      last_err TEXT
    );

    -- Keyword/tag counter used to power "Suggested for you".
    CREATE TABLE IF NOT EXISTS keyword_stats (
      keyword TEXT PRIMARY KEY,
      count   INTEGER NOT NULL DEFAULT 0
    );

    -- Rolling per-topic skip streak for immediate deprioritization.
    CREATE TABLE IF NOT EXISTS skip_streaks (
      topic_id INTEGER PRIMARY KEY,
      streak   INTEGER NOT NULL DEFAULT 0
    );
  `);
}

const DEFAULT_SETTINGS = {
  QUIZ_ENABLED: "false",
  ONBOARDED: "false",
  rank: "1000",
};

function seedSettings(db) {
  const ins = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
}
