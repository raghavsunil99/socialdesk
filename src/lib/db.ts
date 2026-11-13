import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "./demo";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "app.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  network TEXT NOT NULL,            -- instagram | facebook | youtube | x | linkedin | tiktok
  handle TEXT NOT NULL,
  connector TEXT NOT NULL DEFAULT 'demo', -- demo | live
  external_id TEXT,
  access_token TEXT,
  last_sync TEXT,
  UNIQUE(brand_id, network)
);
-- Daily snapshot store: the same shape as Metricool's /analytics/timelines (network + subject + metric).
CREATE TABLE IF NOT EXISTS metric_points (
  account_id INTEGER NOT NULL,
  subject TEXT NOT NULL,            -- account
  metric TEXT NOT NULL,
  date TEXT NOT NULL,               -- YYYY-MM-DD in brand timezone
  value REAL NOT NULL,
  PRIMARY KEY (account_id, subject, metric, date)
);
CREATE TABLE IF NOT EXISTS distributions (
  account_id INTEGER NOT NULL,
  metric TEXT NOT NULL,             -- age | gender | country | city
  label TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (account_id, metric, label)
);
CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  external_id TEXT,
  kind TEXT NOT NULL,               -- post | reel | video
  format TEXT,                      -- IMAGE | CAROUSEL | VIDEO
  published_at TEXT NOT NULL,       -- ISO
  url TEXT,
  caption TEXT,
  image_url TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  UNIQUE(account_id, external_id)
);
CREATE TABLE IF NOT EXISTS best_times (
  account_id INTEGER NOT NULL,
  dow INTEGER NOT NULL,             -- 1 = Monday ... 7 = Sunday
  hour INTEGER NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (account_id, dow, hour)
);
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  networks TEXT NOT NULL,           -- JSON array
  text TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT DEFAULT 'IMAGE',  -- IMAGE | REELS
  scheduled_at TEXT NOT NULL,       -- ISO UTC
  status TEXT NOT NULL DEFAULT 'scheduled', -- draft | pending_approval | scheduled | publishing | published | failed
  result TEXT,                      -- JSON per network
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  network TEXT NOT NULL,
  handle TEXT NOT NULL,
  followers INTEGER,
  followers_30d_ago INTEGER,
  posts_30d INTEGER,
  avg_engagement REAL,
  avg_reach INTEGER,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS smartlinks (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  bio TEXT,
  theme TEXT DEFAULT '#2d1b36',
  buttons TEXT NOT NULL DEFAULT '[]' -- JSON [{label,url,clicks}]
);
CREATE TABLE IF NOT EXISTS smartlink_clicks (
  smartlink_id INTEGER NOT NULL,
  button_index INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- scrypt$<salt hex>$<hash hex>
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256 of the cookie value; the raw token is never stored
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS brand_members (
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                   -- owner | editor | creator | viewer
  PRIMARY KEY (brand_id, user_id)
);
`;

// Columns added after the first release; ALTER fails harmlessly if they already exist.
const MIGRATIONS = [
  "ALTER TABLE scheduled_posts ADD COLUMN created_by INTEGER",
  "ALTER TABLE scheduled_posts ADD COLUMN approved_by INTEGER",
  "ALTER TABLE accounts ADD COLUMN refresh_token TEXT",
  "ALTER TABLE accounts ADD COLUMN token_expires_at TEXT",
  "ALTER TABLE accounts ADD COLUMN scopes TEXT",
  `CREATE TABLE IF NOT EXISTS oauth_states (
     state TEXT PRIMARY KEY, provider TEXT NOT NULL, network TEXT NOT NULL, brand_id INTEGER NOT NULL,
     user_id INTEGER NOT NULL, verifier TEXT, redirect_uri TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  "ALTER TABLE competitors ADD COLUMN external_id TEXT",
  "ALTER TABLE competitors ADD COLUMN name TEXT",
  "ALTER TABLE competitors ADD COLUMN picture TEXT",
  "ALTER TABLE competitors ADD COLUMN error TEXT",
  // Competitors' recent public posts/videos (refreshed on demand).
  `CREATE TABLE IF NOT EXISTS competitor_posts (
     competitor_id INTEGER NOT NULL, external_id TEXT NOT NULL, kind TEXT, published_at TEXT, url TEXT, caption TEXT,
     thumbnail TEXT, views INTEGER, likes INTEGER, comments INTEGER, duration_s INTEGER,
     PRIMARY KEY (competitor_id, external_id))`,
  // Ideas tab: niche keywords per brand, and cached trend searches (YouTube search costs 100 quota units).
  `CREATE TABLE IF NOT EXISTS brand_keywords (brand_id INTEGER NOT NULL, network TEXT NOT NULL, keyword TEXT NOT NULL, PRIMARY KEY (brand_id, network, keyword))`,
  `CREATE TABLE IF NOT EXISTS trend_cache (brand_id INTEGER NOT NULL, network TEXT NOT NULL, keyword TEXT NOT NULL, fetched_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (brand_id, network, keyword))`,
  // AI video ideas are stored (not regenerated on every visit), with 👍/👎 votes that steer the next batch.
  `CREATE TABLE IF NOT EXISTS ai_ideas (
     id INTEGER PRIMARY KEY, brand_id INTEGER NOT NULL, network TEXT NOT NULL, format TEXT NOT NULL, title TEXT NOT NULL,
     hook TEXT, why TEXT, outline TEXT, vote INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  // AI calls per brand per day, for the daily limit.
  `CREATE TABLE IF NOT EXISTS ai_usage (brand_id INTEGER NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (brand_id, day))`,
  // Every AI call, for the AI usage page (tokens as reported by the provider).
  `CREATE TABLE IF NOT EXISTS ai_calls (
     id INTEGER PRIMARY KEY, brand_id INTEGER NOT NULL, user_id INTEGER, kind TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
     input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL, error TEXT,
     at TEXT NOT NULL DEFAULT (datetime('now')))`,
  // After "Continue with Facebook": the long-lived user token waits here (15 min) while the owner picks a Page.
  `CREATE TABLE IF NOT EXISTS meta_pending (
     id TEXT PRIMARY KEY, brand_id INTEGER NOT NULL, user_id INTEGER NOT NULL, token TEXT NOT NULL, expires_at TEXT NOT NULL)`,
];

const g = globalThis as unknown as { __db?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__db) return g.__db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  for (const m of MIGRATIONS) try { d.exec(m); } catch { /* already applied */ }
  const n = d.prepare("SELECT COUNT(*) AS n FROM brands").get() as { n: number };
  if (n.n === 0) seedDemo(d);
  g.__db = d;
  return d;
}

export type Row = Record<string, unknown>;
