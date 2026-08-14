import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { countedTokens, isCountableEvent } from "./accounting.js";
import { defaultStorePath } from "./paths.js";
import type { IngestStats, Platform, UsageEvent } from "./types.js";

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
    this.migrate();
  }

  private migrate(): void {
    const cols = this.columnNames("usage_events");
    const add = (name: string, ddl: string) => {
      if (!cols.has(name)) this.db.exec(`ALTER TABLE usage_events ADD COLUMN ${ddl}`);
    };
    add("request_id", "request_id TEXT");
    add("model", "model TEXT");
    add("cache_read_tokens", "cache_read_tokens INTEGER NOT NULL DEFAULT 0");
    add("cache_creation_tokens", "cache_creation_tokens INTEGER NOT NULL DEFAULT 0");
    add("source", "source TEXT NOT NULL DEFAULT 'unknown'");
  }

  private columnNames(table: string): Set<string> {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  }

  /**
   * Insert events that are new. Duplicate ids are ignored (first write wins).
   * Zero-token events are skipped. Reprocessing the same source does not
   * increase totals; restarting Aqua does not duplicate usage.
   */
  ingest(events: UsageEvent[]): IngestStats {
    const stats: IngestStats = { inserted: 0, ignored: 0, skipped: 0 };
    const insert = this.db.prepare(
      `INSERT INTO usage_events
        (id, platform, session_id, request_id, ts, model, input_tokens, output_tokens,
         cache_read_tokens, cache_creation_tokens, source, source_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );

    this.db.exec("BEGIN");
    try {
      for (const event of events) {
        if (!isCountableEvent(event)) {
          stats.skipped += 1;
          continue;
        }
        const result = insert.run(
          event.id,
          event.platform,
          event.sessionId,
          event.requestId ?? null,
          event.timestamp,
          event.model ?? null,
          event.inputTokens,
          event.outputTokens,
          event.cacheReadTokens,
          event.cacheCreationTokens,
          event.source,
          event.sourceFile,
        );
        if (result.changes === 0) stats.ignored += 1;
        else stats.inserted += 1;
      }
      this.db
        .prepare(
          `INSERT INTO meta(key, value) VALUES ('last_ingested_at', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(String(Date.now()));
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return stats;
  }

  /** Test helper: replace the snapshot. Production report uses ingest(). */
  replaceAll(events: UsageEvent[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM usage_events");
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    this.ingest(events);
  }

  allEvents(): UsageEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, platform, session_id, request_id, ts, model, input_tokens, output_tokens,
                cache_read_tokens, cache_creation_tokens, source, source_file
         FROM usage_events`,
      )
      .all() as Array<{
      id: string;
      platform: string;
      session_id: string;
      request_id: string | null;
      ts: number;
      model: string | null;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
      source: string;
      source_file: string;
    }>;
    return rows.map((row) => {
      const event: UsageEvent = {
        id: row.id,
        platform: row.platform as Platform,
        sessionId: row.session_id,
        timestamp: Number(row.ts),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        cacheReadTokens: Number(row.cache_read_tokens ?? 0),
        cacheCreationTokens: Number(row.cache_creation_tokens ?? 0),
        source: (row.source || "unknown") as UsageEvent["source"],
        sourceFile: row.source_file,
      };
      if (row.request_id) event.requestId = row.request_id;
      if (row.model) event.model = row.model;
      return event;
    });
  }

  countedTokenTotal(): number {
    let total = 0;
    for (const event of this.allEvents()) total += countedTokens(event);
    return total;
  }

  close(): void {
    this.db.close();
  }
}
