---
name: aqua-tokens
description: >-
  Maintains the aqua-tokens local CLI: Claude Code usage collection (JSONL +
  OpenTelemetry POC), water-range conversion, local SQLite storage, and report
  output. Use when changing parsers, usage-source integrations,
  water-methodology.json, storage, collectors/watchers, notifications, report
  output, log paths, or when the user mentions aqua-tokens, token water,
  scope-1, scope-1+2, Claude Code usage, session JSONL, OpenTelemetry, or
  statusline.
---

# aqua-tokens

Local TypeScript CLI that converts **Claude Code** usage into a **water-consumption range**.

**v1 supports Claude Code only.** Do not add Cursor or other platforms without an explicit scope change.

The project is local-first:
- No Aqua server.
- No Aqua accounts.
- No hosted dashboard.
- No public URL.
- Do not introduce network-based usage collection without explicit architectural approval.
- The OTel POC listens on **127.0.0.1 only**. Do not point Claude Code at a remote collector from this project.

Read `PROJECT_OVERVIEW.md` and `docs/usage-sources.md` before making architectural changes.

---

## Current project state

Implemented:

- Claude Code JSONL parser (`report` source / fallback)
- Claude Code OpenTelemetry POC (`aqua-tokens otel-poc`) — loopback OTLP HTTP JSON + sanitized `api_request` export (`--output`)
- Idempotent SQLite event store (`INSERT OR IGNORE` by deterministic id)
- Water methodology + range report (scope-1 and scope-1+2)
- v1 token-accounting rule (input+output counted; cache excluded)
- Public-ready docs (README / Privacy / Test with Claude Code, `docs/live-verification.md`)
- Synthetic OTel → SQLite → report e2e test
- Tests (`npm run verify` = test + build)

**Not started** (still gated while OTel is caveated-POC — see `docs/live-verification.md`):

- Background daemon / watchers
- `aqua-tokens start|stop|status`
- Notifications
- `aqua-tokens share`

Do not build the daemon yet. Live OTel is **accepted with caveats**; `report` remains JSONL.

---

# Non-negotiables

## Accuracy

- Never fabricate token usage.
- Never estimate tokens from character count, text length, or arbitrary heuristics.
- Never silently convert context-window occupancy into billed/API token usage.
- Never present a point water estimate.
- Always present a **range**.
- Always label the scope:
  - `scope-1+2` by default
  - `scope-1` with `--scope1`
- Every report must include the methodology caveat, the token-accounting caveat, and the citation.
- If usage data is unavailable or incomplete, say so explicitly.

## Usage-source semantics

Do not treat these as interchangeable:

- API-request usage (OTel `claude_code.api_request`) — **primary candidate**
- transcript `message.usage` (Claude JSONL) — **fallback / current report**
- billing/usage data
- context-window usage (statusline `total_input_tokens`)
- transcript/message metadata
- local cache/context statistics

In particular, never fold into water:

- statusline `context_window.total_input_tokens` / `total_output_tokens` (context occupancy as of Claude Code v2.1.132; before that they were cumulative — version-dependent, do not use)

## v1 token accounting

Counted: `input_tokens` + `output_tokens`.

Excluded: `cache_read_tokens`, `cache_creation_tokens`.

Rationale lives in `water-methodology.json` → `token_accounting`. Do not silently change the methodology. Do not call the result "total AI token usage" or "billed tokens".

---

# Usage-source status

| Source | Role |
|---|---|
| OTel `api_request` | Preferred future primary. Local loopback collector works. Not wired into `report` until a live event is captured. |
| Claude JSONL | Current `report` source and fallback. Keep the parser. |
| Statusline | Not a usage source. |
| Other platforms | Out of scope for v1. |

Details: `docs/usage-sources.md`.

---

# Implementation notes

- Dedup by `UsageEvent.id`. Store is insert-if-new. Reprocessing must not increase totals.
- OTel POC protocol is `http/json` on `127.0.0.1:4318`. Protobuf/gRPC is out of scope for the POC.
- Do not enable `OTEL_LOG_USER_PROMPTS` / `OTEL_LOG_RAW_API_BODIES` from this project.
- Fail loud on unrecognized log schemas.
- Node ≥ 22.5 (`node:sqlite`).
