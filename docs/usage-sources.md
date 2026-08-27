# Claude Code usage sources

Investigation notes for aqua-tokens v1 (**Claude Code only**). **Accuracy first, automation second.** The background daemon is not started from this document.

**v1 platform scope:** Claude Code. Other editors/platforms are out of scope.

Report still reads Claude Code **JSONL**. OpenTelemetry is a proven local collector path, not yet the `report` source, because a live Claude Code process has not been captured for definition-of-done.

**Source priority:**

1. **Primary candidate:** Claude Code OpenTelemetry `api_request`
2. **Fallback / current report:** Claude Code JSONL `message.usage`


---

## Phase 1 — OpenTelemetry POC

Claude Code telemetry is **off by default**. Enabling it does not require an Aqua server, an Aqua account, or any Anthropic/OTel SaaS backend.

### Minimum local-only configuration

Put this in `~/.claude/settings.json` (or export the same variables in the shell) and point the endpoint at Aqua's loopback receiver:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "none",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318",
    "OTEL_LOGS_EXPORT_INTERVAL": "1000"
  }
}
```

Print the same block with `aqua-tokens otel-poc --print-config`.

Then:

```bash
aqua-tokens otel-poc --listen
```

The receiver binds **127.0.0.1 only**, accepts OTLP HTTP JSON `POST /v1/logs`, and appends **sanitized** `claude_code.api_request` usage fields to `~/.aqua-tokens/otel-poc.jsonl` (never the raw OTLP payload). Optional `--output ./api-request.json` writes the latest event as pretty JSON for fixture sharing. Protobuf/gRPC is rejected with 415; this POC does not speak those protocols.

Do **not** set `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`. Those would persist conversation content. Aqua only needs usage attributes. Live checklist: `docs/live-verification.md`.

The `console` exporter is local but not incremental (it prints to Claude's stdout). A loopback OTLP HTTP receiver is the local-only path Aqua can persist and re-read.

### `claude_code.api_request` fields

Documented by Claude Code monitoring docs. Confirmed present on the event schema Aqua parses:

| Field | Present | Notes |
|---|---|---|
| `request_id` | Yes, when the API returns one | Anthropic `req_…`. Stable unique id for successful requests. |
| `client_request_id` | Yes (v2.1.214+) | Fallback when `request_id` is absent (timeouts). |
| `model` | Yes | e.g. `claude-sonnet-4-6` |
| `input_tokens` | Yes | Final API usage for that request |
| `output_tokens` | Yes | Final API usage for that request |
| `cache_read_tokens` | Yes | Separate from input |
| `cache_creation_tokens` | Yes | Separate from input |
| `cost_usd` | Yes | Client estimate, not a bill |
| `event.timestamp` | Yes | ISO 8601 |
| `session.id` | Yes | Standard attribute |
| `event.sequence` | Yes | Monotonic per session |

Numeric attributes are numbers as of Claude Code v2.1.122; Aqua accepts both numbers and numeric strings.

Each event is **one API request**, not a session rollup. Token counts are the usage block from that request, not a streaming partial (the log event is emitted after the request). Incremental collection is possible: persist JSONL and insert-if-new by `request_id`.

### Capture one event

```bash
aqua-tokens otel-poc --file tests/fixtures/otel/api-request.json
```

prints:

```text
event.name claude_code.api_request
request_id req_011NORMAL
model claude-sonnet-4-6
input_tokens 1200
output_tokens 800
cache_read_tokens 4000
cache_creation_tokens 0
cost_usd 0.0123
timestamp/session_id 2026-08-14T10:00:01.000Z / sess-otel-1
```

The same sanitized shape is accepted from a live Claude Code exporter via `--listen`. A live Claude Code session has **not** yet been captured for definition-of-done (see `docs/live-verification.md`). The receiver and parser are covered by tests, including a loopback HTTP POST and a full OTel → SQLite → report e2e fixture test.

---

## Phase 2 — Source comparison

Do **not** treat these as interchangeable.

### A. OpenTelemetry (`claude_code.api_request`)

- Per API request: yes.
- Token counts: final usage for that request, with cache broken out.
- `request_id`: stable when present; fall back to `client_request_id`.
- Local: yes, via loopback OTLP HTTP JSON. No Aqua hosted server.
- Incremental: yes, append-only JSONL + insert-if-new.
- Cost: opt-in telemetry. User must enable it. Events can include account identifiers (`user.email`, `user.account_uuid`) on the OTLP record; Aqua's POC persists only the usage fields listed above.
- Not yet wired into `aqua-tokens report`.

### B. Statusline

JSON on stdin after each turn. Useful fields:

- `context_window.total_input_tokens` / `total_output_tokens` — **current context window**, not session cumulative, as of Claude Code v2.1.132. `total_input_tokens` **includes cache reads and writes**.
- `context_window.current_usage` — last API call broken into `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. `null` before the first call and after `/compact`.
- `cost.total_cost_usd` — estimated **session** cost, resets on `/clear`. Not a per-request event and not a bill.

Statusline is a live snapshot, not an event log. Consuming it without scraping is possible (custom statusline script writes JSONL), but:

- It is easy to misread `total_input_tokens` as cumulative usage. Before v2.1.132 those fields *were* cumulative; after that they are context occupancy. Version-dependent.
- Cache is mixed into the combined totals.
- No durable `request_id`.
- Aqua would have to be installed as the user's statusline, which is invasive and still would not survive Claude being used without that statusline.

**Do not use statusline `total_input_tokens` / `total_output_tokens` as cumulative usage.**

Statusline does expose a cache breakdown (`current_usage`) that JSONL also has, so it does not uniquely unlock accounting. Session cost is extra but unverified against a bill.

### C. JSONL (`~/.claude/projects/**/*.jsonl`)

Existing parser. Assistant rows with `message.usage`:

- `input_tokens`, `output_tokens` (required)
- `cache_read_input_tokens`, `cache_creation_input_tokens` (optional)
- `message.id` — stable across `/resume` replays (Aqua dedupes on this)
- `requestId` / `request_id` — present on some rows when Claude persisted the API id
- `message.model` — skip `<synthetic>`

Local, incremental, survives Claude restarts (files remain). Fail-loud on unknown schema.

Caveats:

- These are transcript usage blocks, not a dedicated billing export.
- Streaming/intermediate assistant rows: Aqua only accepts rows with numeric `input_tokens`/`output_tokens` and skips 0+0. Replayed `/resume` rows share `message.id` and are ignored.
- Zero-token synthetic login failures are skipped (observed on this machine).
- Not every Claude Code version writes `request_id` onto the transcript.

JSONL remains the **report fallback** and the current `report` Claude source.

### Comparison

| Source | Accuracy | Local | Incremental | Recommended |
|---|---|---|---|---|
| OTel `api_request` | High — per-request final API usage, cache broken out, `request_id` | Yes, loopback only | Yes | **Preferred primary once a live event is captured and compared to Claude's own usage display** |
| Statusline | Low for Aqua totals — context window / last-call snapshot, version-dependent meaning of `total_*` | Yes | No (snapshot) | **Not a usage source.** Do not scrape. |
| JSONL `message.usage` | Medium-high — same usage block family, `message.id` dedupe, cache fields present | Yes | Yes | **Current report source and fallback** |

No final cutover of `report` to OTel until a live Claude Code `api_request` is captured and checked against the usage UI.

---

## Phase 3 — v1 token-accounting rule

Stored in `water-methodology.json` → `token_accounting` and applied by `countedTokens()`.

### Included

- `input_tokens`
- `output_tokens`

### Excluded

- `cache_read_tokens` / `cache_read_input_tokens`
- `cache_creation_tokens` / `cache_creation_input_tokens`

### Rationale

Li et al. report 10–50 mL for a **~500–2,500 token inference query**. That band is the query itself. A 200k cache read is not 80 extra queries; counting it would invent water the methodology cannot support.

Cache **reads** reuse already-processed context. Including them double-counts work that was billed/processed earlier (or is a cache hit, not new generation at the same intensity).

Cache **creation** is also outside the paper's query-size band. v1 records the field when present and excludes it rather than silently widening the denominator.

Aqua therefore does **not** call the result "total AI token usage" or "billed tokens". The report states: API-request input + output only; cache read/write recorded but excluded.

### Caveat shown to users

Copied from `token_accounting.caveat` onto every report:

> Counted tokens are API-request input + output only. Cache reads and cache writes are recorded when present but excluded from water. This is not a billed-token total.

This rule is explicit. Do not change it silently.

---

## SQLite event store

`~/.aqua-tokens/history.sqlite` is an **insert-if-new** event store.

```text
usage source → UsageEvent → dedupe by id → SQLite INSERT OR IGNORE → aggregate → report
```

Reprocessing the same JSONL, or restarting Aqua, must not increase totals. Historical events are kept if a source file later disappears.

Dedup keys:

| Source | `id` |
|---|---|
| Claude JSONL | `claude:${message.id}` |
| Claude OTel | `claude-otel:${request_id\|client_request_id}` |

OTel events are **not** ingested into this store by `report` yet.

---

## Not in this milestone

- Other platforms (including Cursor)
- Background daemon / watchers / notifications
- `aqua-tokens start|stop|status`
- Switching `report` to OTel as the primary Claude source
- `aqua-tokens share`
