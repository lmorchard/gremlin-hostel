// The hostel's own state, kept separate from bot.db, which belongs entirely to
// @fedify/botkit-sqlite's SqliteRepository. BotKit owns the ActivityPub side:
// signing keys, messages, followers. Everything here is ours.
//
// Right now that is only each bot's last scheduled post, but the table is a
// generic key/value store on purpose. One bot's schema leaking into every
// other bot's storage was a mistake worth not repeating.
//
// node:sqlite's DatabaseSync API is fully synchronous; none of the calls below
// take (or accept) an `await`.

import { DatabaseSync } from 'node:sqlite';

export const LAST_POST_KEY = 'lastScheduledPostAtMs';

export function openAppDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_state (
      bot_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (bot_id, key)
    ) STRICT
  `);
  return db;
}

export function readState(db: DatabaseSync, botId: string, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM bot_state WHERE bot_id = ? AND key = ?')
    .get(botId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function writeState(db: DatabaseSync, botId: string, key: string, value: string): void {
  db.prepare(
    `INSERT INTO bot_state (bot_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (bot_id, key) DO UPDATE SET value = excluded.value`,
  ).run(botId, key, value);
}

export function readLastPostAtMs(db: DatabaseSync, botId: string): number | null {
  const raw = readState(db, botId, LAST_POST_KEY);
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function writeLastPostAtMs(db: DatabaseSync, botId: string, atMs: number): void {
  writeState(db, botId, LAST_POST_KEY, String(atMs));
}
