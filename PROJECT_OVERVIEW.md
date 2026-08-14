# aqua-tokens — Project Overview

## Summary

aqua-tokens is a **local Node.js CLI** that reads real token usage from Claude Code and Cursor session logs and converts it into an estimated **water-consumption range**. No server, no accounts, no network calls.

It exists because token trackers (aiusage, tokscale) don’t convert to water, and water estimators (tokenwater) don’t read real logs.

v1 is intentionally narrow: two platforms, one shareable lifetime number, a today / this week / all-time breakdown, always shown as a range with citation and caveat.

---

## Current state (2026-08-15)

`aqua-tokens report` and `aqua-tokens otel-poc` are implemented and tested (`npm test`: 45 passing). Usage-source notes: `docs/usage-sources.md`.

The pre-collector milestone is **code-complete**. The remaining gate before a background collector is a **live** Claude Code `api_request` compared to Claude’s usage UI. Do not start the daemon until that capture exists.

### Done

| Item | Notes |
|------|--------|
| Ren-Research notebooks reviewed | Training-run / datacenter-hour only; no per-token formula. Rates are our interpolation. |
| CLI: `--help`, `report`, `--scope1`, `--json` | End-to-end on this machine. |
| Claude Code JSONL parser | Current `report` Claude source and fallback. Cache fields stored, excluded from water. |
| Claude Code OpenTelemetry POC | `aqua-tokens otel-poc --listen` / `--file` / `--print-config`. Loopback `127.0.0.1:4318` only. Parses `claude_code.api_request`. **Not wired into `report`.** |
| Statusline evaluated | Context-window snapshot, not a usage source. `total_input_tokens` is not cumulative usage. |
| Source comparison | OTel vs statusline vs JSONL documented in `docs/usage-sources.md`. |
| v1 token-accounting rule | Counted: `input_tokens` + `output_tokens`. Excluded: cache read/write. Caveat on every report. |
| `UsageEvent` | Stable `id` plus `requestId`, `model`, cache fields, `source`. |
| SQLite event store | `~/.aqua-tokens/history.sqlite`. Insert-if-new (`ON CONFLICT DO NOTHING`). Reprocess/restart does not double-count. Historical events kept. |
| Water conversion | `water.ts` + `water-methodology.json`. Range only; scope-1 and scope-1+2. |
| Report | Lifetime headline + today / week / all-time × platform. Range, scope, water caveat, accounting caveat, citation. |
| Cross-platform log paths | macOS / Linux / Windows. |
| Fail loud on unrecognized schema | Claude JSONL and Cursor DB. |
| Claude fixtures | Normal, multi-request, duplicate id, zero-token, missing fields, cache, malformed, re-read. |
| Cursor local parser | `state.vscdb` + transcripts. Schema parse works. All-zero `tokenCount` warns that zero is **not** proof of no usage. Does not guess from character length or `contextTokensUsed`. |
| README / `THIRD_PARTY_NOTICES` | Range rationale, per-machine totals, notebooks reviewed not copied. |
| Tests | 45 passing. |

### Pending

**Gate (do this before the collector):** capture one real Claude Code `api_request` with `aqua-tokens otel-poc --listen` and compare it to Claude’s own usage display. The POC today is proven against a fixture and a synthetic loopback POST. This machine’s JSONL is still a `<synthetic>` login-failure with 0 tokens.

| Item | Why it is waiting |
|------|-------------------|
| Live OTel capture vs Claude usage UI | Milestone gate. Fixture/loopback POC is not a live session. |
| Wire OTel into `report` / SQLite ingest | Do not cut over from JSONL until the live event matches Claude’s usage UI. |
| `generateReport()` end-to-end test | Ingest is covered in store tests; no full parse → ingest → report integration test yet. |
| Background collector / daemon | Phase 7. Accuracy first. |
| `aqua-tokens start` / `stop` / `status` | Phase 8. After the collector is stable. |
| Optional OS notifications | Phase 9. After `status` and persistence are reliable. Default: not every prompt. |
| Cursor billed usage | Local `tokenCount` is always 0 on current desktop builds. Keep the parser; do not fabricate; no API/CSV (breaks local-only). |
| Definition-of-done vs each platform’s usage UI | Claude JSONL/OTel not yet checked against a non-zero real session. Cursor UI will show more than Aqua. |
| `aqua-tokens share` (local PNG/SVG card) | Stretch. After numbers are trusted. |

### Live run on this machine

`node dist/cli.js report` succeeded. Result was **0 tokens / 0–0 mL** because:

- **Claude Code** — only `~/.claude/projects/.../4458e696-….jsonl` exists; the assistant row is a `<synthetic>` login-failure with `input_tokens: 0`. Correct skip.
- **Cursor** — see [Cursor local tokens are always zero](#issue-cursor-local-tokens-are-always-zero). The CLI warns and does **not** guess from character length.

Parsers are behaving correctly. Claude Code totals should still be checked against `message.usage` (and, after a live capture, against OTel `api_request`) on a machine that records non-zero counts. Cursor’s usage UI will almost certainly show a higher number than aqua-tokens; that gap is Cursor’s local storage, not a parse bug. Definition-of-done verification against each platform’s usage UI is still pending.

The OTel POC has **not** captured a live Claude Code session on this machine. `aqua-tokens otel-poc --file tests/fixtures/otel/api-request.json` prints a full usage event from a fixture; `--listen` is tested with a synthetic loopback POST.

### Issue: Cursor local tokens are always zero

Investigated 2026-08-14 on this machine while an agent chat was in progress. **Not a parser bug.** Cursor does not persist billed input/output locally, so a local-only report cannot be accurate for Cursor.

| Check | Result |
|-------|--------|
| `state.vscdb` `cursorDiskKV` | Readable (~1.1 GB). `composerData:*` + `bubbleId:*` present. |
| `bubbleId:*` `tokenCount` | **30,633 / 30,633** rows had `{ inputTokens, outputTokens }`. **Every value was 0.** |
| This session (`6b913e30-…`) | 72 bubbles written during the live chat; still `{0, 0}`. |
| Agent transcripts | JSONL is `role` / `message` / `turn_ended` only. No `usage` / `tokenCount`. |
| `composerData.usageData` | Present on 519 / 532 composers; always `{}`. |
| `~/.cursor/ai-tracking/ai-code-tracking.db` | Code hashes (which lines were AI-written). No token columns. |

Fields that *look* like tokens (`contextTokensUsed`, `contextTokenLimit`, `contextUsagePercent`, `promptTokenBreakdown`) are **current context-window occupancy**, not billed input+output. Using them for water would invent a number.

Billing lives on Cursor’s servers (Settings → Usage / usage CSV). tokscale reads that **network CSV**; aqua-tokens stays local-only, so Cursor totals remain a **lower bound** (zero on this laptop). Accurate Cursor water would require relaxing “no network” or waiting until Cursor writes real `tokenCount`s. Do not guess from character length.

### Known limitations

- Water rate is **our interpolation** (10–50 mL / 1,000 tokens for scope-1+2), not a formula Li et al. state per token. Flagged in README + `water-methodology.json`.
- Water uses **input + output only**. Cache read/write is parsed when present but excluded from the water total (paper query band is ~500–2,500 tokens, not cache hits). The report labels this as request tokens counted by Aqua, not "total AI token usage".
- Claude `report` still uses JSONL. OTel is a local POC (`aqua-tokens otel-poc`); do not cut over until a live `api_request` is compared to Claude's usage display.
- **Cursor local `tokenCount` is unused in practice** — every bubble on this machine is `{0, 0}`. Report is a lower bound; see issue above.
- History is **per-machine**. No sync.
- Scanning a large Cursor `state.vscdb` can take ~10–15s.
- `node:sqlite` is still an experimental Node API; the CLI suppresses that warning. Requires **Node ≥ 22.5**.

---

## Tech stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js ≥ 22.5 (ESM) |
| Language | TypeScript (strict) |
| CLI | `commander` |
| SQLite | `node:sqlite` (`DatabaseSync`) — Cursor DB + local store |
| Tests | Vitest |
| Dev run | `tsx src/cli.ts` |
| Build | `tsc` → `dist/cli.js` |

No native addons. The OTel POC listens on loopback only; it does not call the network.

---

## Methodology decision

[Ren-Research/Making-AI-Less-Thirsty](https://github.com/Ren-Research/Making-AI-Less-Thirsty) notebooks compute:

```text
water ≈ power × (on-site WUE + off-site EWIF × PUE)
```

over hourly fuel mix / wet-bulb weather for **LaMDA-scale training**, not per query. Spec fallback applies:

| Scope | Rate in `water-methodology.json` | Origin |
|-------|----------------------------------|--------|
| **scope-1+2** (default) | 10–50 mL per 1,000 tokens | Li et al. 10–50 mL per ~500–2,500 token query; midpoint reference = 1,000 tokens. 1.2M tokens → 12–60 L. |
| **scope-1** (`--scope1`) | 0.26–0.32 mL per 1,000 tokens | Google 2025 / Altman June 2025 on-site cooling only. Conservative undercount. |

Update rates only in `water-methodology.json`. Caveat, citation, and the v1 token-accounting rule also live there so report copy can change without touching parsers. Counted tokens are API-request input + output; cache read/write is excluded. See `docs/usage-sources.md`.

---

## Data flow

```
Claude Code JSONL          Cursor state.vscdb + agent-transcripts JSONL
        \                                    /
         \                                  /
          v                                v
     parsers (fail loud on unknown schema; never char-guess)
                          |
                          v
              UsageEvent[] (input + output counted; cache stored, excluded)
                          |
                          v
           ~/.aqua-tokens/history.sqlite  (insert-if-new by stable id)
                          |
                          v
        aggregate today / rolling 7 days / all-time × platform
                          |
                          v
        tokens × methodology range → report (text or --json)
```

Separate POC path (not in `report` yet):

```
Claude Code OTEL_LOGS_EXPORTER=otlp  →  127.0.0.1:4318/v1/logs  →  ~/.aqua-tokens/otel-poc.jsonl
```

`UsageEvent`: `id`, `platform` (`claude-code` | `cursor`), `sessionId`, `requestId?`, `timestamp`, `model?`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `source`, `sourceFile`.

Dedup key is `id`. Reprocessing the same source must not increase totals.

---

## Parsers

### Claude Code (`src/parsers/claude-code.ts`)

- Roots: `~/.claude/projects/`, `~/.claude/transcripts/` (or `CLAUDE_CONFIG_DIR`). Same home-relative layout on Windows.
- Assistant lines with `message.usage.input_tokens` / `output_tokens`. Cache fields stored, excluded from water.
- Dedupes replayed `/resume` rows by `message.id`.
- Skips `<synthetic>` / zero-token rows.
- Unknown JSONL schema → `unrecognized log format, please open an issue`.
- JSONL split is `\n` only (not `readline`) so U+2028 inside strings does not tear lines.

See `docs/usage-sources.md` for OTel vs statusline vs JSONL. Statusline `total_input_tokens` is **not** cumulative usage.

### Cursor (`src/parsers/cursor.ts`)

- DB (per OS): `User/globalStorage/state.vscdb` under Cursor user-data (macOS Application Support, Linux XDG, Windows `%APPDATA%`). Copied with WAL/SHM before read.
- `cursorDiskKV`: `composerData:{id}` headers (`fullConversationHeadersOnly` and/or `conversation[]`) + `bubbleId:{composerId}:{bubbleId}` with `tokenCount`.
- Fallback scan of remaining `bubbleId:*` rows if a composer has no header list.
- Transcripts: `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` when they carry explicit `usage`. Skipped if that session already has DB tokens.
- Missing `cursorDiskKV` or malformed `tokenCount` → fail loud.
- All-zero / absent token fields → warning that a zero Cursor total is **not proof that no usage occurred**.
- Do **not** fold `contextTokensUsed` / `promptTokenBreakdown` into water; those are context-window snapshots.

tokscale’s Cursor path is a **network CSV export**; this tool stays local-only, so it does not follow that. On current Cursor desktop builds the local `tokenCount` object is present but unused (always zero). See [Cursor local tokens are always zero](#issue-cursor-local-tokens-are-always-zero).

---

## CLI

```bash
aqua-tokens report           # scope-1+2
aqua-tokens report --scope1
aqua-tokens report --json
aqua-tokens report --methodology <path> --store <path>
aqua-tokens otel-poc --print-config
aqua-tokens otel-poc --file tests/fixtures/otel/api-request.json
aqua-tokens otel-poc --listen   # loopback OTLP HTTP JSON on 127.0.0.1:4318
```

Headline: `🌊 Lifetime: 1.2M tokens · 12–60 L, scope-1+2`

Then a table (Today / This week / All-time × Claude Code / Cursor), toilet-flush comparison on the **lifetime low end**, water caveat, token-accounting caveat, citation, per-machine note.

---

## File structure

```
AquaToken/
├── src/
│   ├── cli.ts                 # bin entry; suppresses sqlite experimental warning
│   ├── main.ts                # commander
│   ├── run.ts                 # parse → ingest → report
│   ├── accounting.ts          # v1 counted = input + output
│   ├── parsers/
│   │   ├── claude-code.ts
│   │   └── cursor.ts
│   ├── otel/                  # local-only api_request POC (not report yet)
│   ├── water.ts               # load methodology, tokens → range
│   ├── store.ts               # local sqlite insert-if-new
│   ├── aggregate.ts           # today / week / all-time
│   ├── report.ts              # text + JSON formatting
│   ├── format.ts
│   ├── paths.ts               # OS-specific log locations
│   ├── jsonl.ts
│   ├── types.ts
│   └── errors.ts
├── tests/                     # vitest + fixtures
├── docs/usage-sources.md      # OTel vs statusline vs JSONL + accounting rule
├── water-methodology.json
├── README.md
├── PROJECT_OVERVIEW.md        # this file
├── THIRD_PARTY_NOTICES
├── LICENSE                    # MIT
└── package.json
```

---

## Commands

```bash
npm install
npm test
npm run build
npx tsx src/cli.ts report
npm link                      # then: aqua-tokens report
```

Store path: `~/.aqua-tokens/history.sqlite`.

---

## v1 non-goals (still out of scope)

These are not the same as [pending](#pending) work. Pending items are planned; the list below is out of scope for v1.

- Hosted dashboard, accounts, leaderboard, public share URL
- Browser extension / memory-snippet self-report
- More than Claude Code + Cursor
- Cursor usage API / CSV import (tokscale’s path) — would break local-only
- Guessing Cursor tokens from character length or `contextTokensUsed`
- Point water estimates
- Using statusline `total_input_tokens` as cumulative usage
