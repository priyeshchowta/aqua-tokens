# aqua-tokens — Project Overview

## Summary

aqua-tokens is a **local Node.js CLI** that tracks **Claude Code** usage and converts measured request tokens into an estimated **water-footprint range**.

**v1 supported source: Claude Code only.** Cursor and other platforms are out of scope for v1.

No Aqua server, no Aqua accounts, no hosted dashboard. Totals are labeled **request tokens counted by Aqua** (`input + output`), not billed usage.

---

## Current state (2026-09-08)

| Layer | Status |
|-------|--------|
| Platform scope | **Claude Code only** |
| Automated tests / `npm run verify` | Pass offline |
| Synthetic OTel → UsageEvent → SQLite → report | Covered |
| OTel POC (`otel-poc`) | Loopback `127.0.0.1:4318`; sanitized export |
| Live Claude `api_request` | **Accepted with caveats** (transport verified; usage-UI parity not proven — see `docs/live-verification.md`) |
| Claude JSONL → `report` | Current report source / fallback |
| Cursor | **Out of scope for v1** (removed from product surface and production collect path) |
| Background daemon / notifications / `share` | **Not implemented** |

### Architecture (intended)

```
Claude Code
    ↓
OpenTelemetry api_request   ← primary candidate (POC; not wired into report yet)
    ↓
Aqua usage ingestion
    ↓
UsageEvent → SQLite (insert-if-new)
    ↓
aggregation → water calculation → report
```

**Current `report` path:** Claude Code JSONL `message.usage`. Do not claim JSONL is authoritative billed usage.

### Done

- Claude Code JSONL parser (report source / fallback)
- Claude Code OTel POC (`--listen`, `--print-config`, `--file`, `--output`)
- Idempotent SQLite store; deterministic event ids
- Water methodology + range report (Claude-only table)
- Public docs + live-verification checklist
- Synthetic e2e OTel → report test
- Cursor removed from production collection and user-facing claims

### Live verification decision

Live OTel is **accepted with caveats**: transport/parse verified on real events in a proxied environment; first-party Claude usage-UI comparison was not available. Keep JSONL as `report`; OTel stays POC. Details: `docs/live-verification.md`.

Do **not** start the daemon, notifications, or share cards while OTel is only caveated-POC. Independent re-checks welcome.

### Known limitations

- Water rates are Aqua’s interpolation (`water-methodology.json`).
- Cache read/write excluded from water.
- OTel not yet the `report` source.
- Node ≥ 22.5 (`node:sqlite`).

---

## Tech stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js ≥ 22.5 (ESM) |
| Language | TypeScript (strict) |
| CLI | `commander` |
| SQLite | `node:sqlite` |
| Tests | Vitest |
| Build | `tsc` → `dist/cli.js` |

---

## Methodology

See `water-methodology.json` and README. Counted = `input_tokens + output_tokens`. Cache excluded. Range + scope + caveat + citation on every report.

---

## Data flow (current `report`)

```
Claude Code JSONL (~/.claude/projects, transcripts)
        ↓
parser → UsageEvent[]
        ↓
~/.aqua-tokens/history.sqlite  (insert-if-new by stable id)
        ↓
today / week / all-time → water range
```

POC (not in `report` yet):

```
Claude Code OTEL → 127.0.0.1:4318/v1/logs → sanitized api_request JSONL / --output
```

Ids: `claude:<message.id>`, `claude-otel:<request_id>`.

---

## CLI

```bash
aqua-tokens report
aqua-tokens report --scope1
aqua-tokens report --json
npm run otel-poc -- --print-config
npm run otel-poc -- --listen
npm run otel-poc -- --listen --output ./api-request.json
```

No `start` / `stop` / `status` in this milestone.

---

## Commands

```bash
npm install && npm test && npm run build
npm run verify
npx tsx src/cli.ts report
npx tsx src/cli.ts otel-poc --print-config
```

---

## v1 non-goals

- Cursor or any second platform
- Hosted dashboard, accounts, cloud telemetry
- Background daemon / watchers / notifications
- `aqua-tokens share`
- Guessing tokens / point water estimates
- Statusline as cumulative usage
