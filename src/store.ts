import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultStorePath } from "./paths.js";
import type { Platform, UsageEvent } from "./types.js";

export class UsageStore {
  private readonly db: DatabaseSync;

  constructor(filePath = defaultStorePath()) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        session_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        source_file TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_events(ts);
      CREATE INDEX IF NOT EXISTS idx_usage_platform ON usage_events(platform);
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  replaceAll(events: UsageEvent[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM usage_events");
      const insert = this.db.prepare(
        `INSERT INTO usage_events
          (id, platform, session_id, ts, input_tokens, output_tokens, source_file)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const event of events) {
        insert.run(
          event.id,
          event.platform,
          event.sessionId,
          event.timestamp,
          event.inputTokens,
          event.outputTokens,
          event.sourceFile,
        );
      }
      this.db
        .prepare(`INSERT INTO meta(key, value) VALUES ('last_ingested_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(String(Date.now()));
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  allEvents(): UsageEvent[] {
    const rows = this.db.prepare(
      `SELECT id, platform, session_id, ts, input_tokens, output_tokens, source_file
       FROM usage_events`,
    ).all() as Array<{
      id: string;
      platform: string;
      session_id: string;
      ts: number;
      input_tokens: number;
      output_tokens: number;
      source_file: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      platform: row.platform as Platform,
      sessionId: row.session_id,
      timestamp: Number(row.ts),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      sourceFile: row.source_file,
    }));
  }

  close(): void {
    this.db.close();
  }
}
