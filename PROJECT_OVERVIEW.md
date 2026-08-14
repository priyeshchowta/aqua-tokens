# aqua-tokens — Project Overview

## Summary

aqua-tokens is a **local Node.js CLI** that reads real token usage from Claude Code and Cursor session logs and converts it into an estimated **water-consumption range**. No server, no accounts, no network calls.

It exists because token trackers (aiusage, tokscale) don’t convert to water, and water estimators (tokenwater) don’t read real logs.

v1 is intentionally narrow: two platforms, one shareable lifetime number, a today / this week / all-time breakdown, always shown as a range with citation and caveat.

---

## Current state (2026-08-14)

**v1 core is implemented, tested, and runnable.** `aqua-tokens report` works end-to-end on this machine.

| Spec item | Status |
|-----------|--------|
| Review Ren-Research notebooks before writing conversion | Done — training-run / datacenter-hour only; no per-token formula |
| CLI skeleton (`--help`, `report`) | Done |
| Claude Code JSONL parser | Done |
| Local SQLite history (`~/.aqua-tokens/history.sqlite`) | Done |
| `water.ts` + `water-methodology.json` | Done — labeled interpolation, not a port of their notebooks |
| `report`: lifetime headline + today/week/all-time × platform | Done |
| Range, scope label, caveat, citation on every report | Done |
| `--scope1` | Done |
| Cross-platform log paths (macOS / Linux / Windows) | Done |
| Fail loud on unrecognized schema | Done |
| Cursor local parser (`state.vscdb` + agent-transcripts) | Done |
| README: why a range; per-machine totals; tokenwater note | Done |
| `THIRD_PARTY_NOTICES` | Done — notebooks reviewed, source not copied |
| Tests | 23 passing (`npm test`) |
| Stretch: `aqua-tokens share` (local PNG/SVG card) | **Not started** (spec: after numbers are trusted) |

### Live run on this machine

`node dist/cli.js report` succeeded. Result was **0 tokens / 0–0 mL** because:

- **Claude Code** — only `~/.claude/projects/.../4458e696-….jsonl` exists; the assistant row is a `<synthetic>` login-failure with `input_tokens: 0`. Correct skip.
- **Cursor** — `state.vscdb` (~1.1 GB) is readable, `cursorDiskKV` + `tokenCount.{inputTokens,outputTokens}` are present on bubbles, but **every stored count is 0**. Agent transcripts (`~/.cursor/projects/*/agent-transcripts/*.jsonl`) usually have no usage block. The CLI warns and does **not** guess from character length.

So parsers are behaving correctly; this laptop simply has no usable per-turn Cursor tokens locally. Totals should be checked against Claude Code `message.usage` and Cursor’s own usage UI on a machine/session that actually records non-zero counts (definition-of-done verification still pending).

### Known limitations

- Water rate is **our interpolation** (10–50 mL / 1,000 tokens for scope-1+2), not a formula Li et al. state per token. Flagged in README + `water-methodology.json`.
- Water uses **input + output only**. Cache read/write is parsed when present but excluded from the water total (paper query band is ~500–2,500 tokens, not cache hits).
- Cursor desktop often omits real token counts from local storage; report is then a **lower bound**.
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

No native addons, no network client.

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

Update rates only in `water-methodology.json`. Caveat and citation also live there so report copy can change without touching parsers.

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
              UsageEvent[] (input + output)
                          |
                          v
           ~/.aqua-tokens/history.sqlite  (replace-all snapshot)
                          |
                          v
        aggregate today / rolling 7 days / all-time × platform
                          |
                          v
        tokens × methodology range → report (text or --json)
```

`UsageEvent`: `id`, `platform` (`claude-code` | `cursor`), `sessionId`, `timestamp`, `inputTokens`, `outputTokens`, `sourceFile`.

---

## Parsers

### Claude Code (`src/parsers/claude-code.ts`)

- Roots: `~/.claude/projects/`, `~/.claude/transcripts/` (or `CLAUDE_CONFIG_DIR`). Same home-relative layout on Windows.
- Assistant lines with `message.usage.input_tokens` / `output_tokens`.
- Dedupes replayed `/resume` rows by `message.id`.
- Skips `<synthetic>` / zero-token rows.
- Unknown JSONL schema → `unrecognized log format, please open an issue`.
- JSONL split is `\n` only (not `readline`) so U+2028 inside strings does not tear lines.

### Cursor (`src/parsers/cursor.ts`)

- DB (per OS): `User/globalStorage/state.vscdb` under Cursor user-data (macOS Application Support, Linux XDG, Windows `%APPDATA%`). Copied with WAL/SHM before read.
- `cursorDiskKV`: `composerData:{id}` headers (`fullConversationHeadersOnly` and/or `conversation[]`) + `bubbleId:{composerId}:{bubbleId}` with `tokenCount`.
- Fallback scan of remaining `bubbleId:*` rows if a composer has no header list.
- Transcripts: `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` when they carry explicit `usage`. Skipped if that session already has DB tokens.
- Missing `cursorDiskKV` or malformed `tokenCount` → fail loud.
- All-zero / absent token fields → warning, not a fabricated estimate.

tokscale’s Cursor path is a **network CSV export**; this tool stays local-only, so it does not follow that.

---

## CLI

```bash
aqua-tokens report           # scope-1+2
aqua-tokens report --scope1
aqua-tokens report --json
aqua-tokens report --methodology <path> --store <path>
```

Headline: `🌊 Lifetime: 1.2M tokens · 12–60 L, scope-1+2`

Then a table (Today / This week / All-time × Claude Code / Cursor), toilet-flush comparison on the **lifetime low end**, caveat, citation, per-machine note.

---

## File structure

```
AquaToken/
├── src/
│   ├── cli.ts                 # bin entry; suppresses sqlite experimental warning
│   ├── main.ts                # commander
│   ├── run.ts                 # parse → store → report
│   ├── parsers/
│   │   ├── claude-code.ts
│   │   └── cursor.ts
│   ├── water.ts               # load methodology, tokens → range
│   ├── store.ts               # local sqlite snapshot
│   ├── aggregate.ts           # today / week / all-time
│   ├── report.ts              # text + JSON formatting
│   ├── format.ts
│   ├── paths.ts               # OS-specific log locations
│   ├── jsonl.ts
│   ├── types.ts
│   └── errors.ts
├── tests/                     # vitest + fixtures
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

- Hosted dashboard, accounts, leaderboard, public share URL
- Browser extension / memory-snippet self-report
- More than Claude Code + Cursor
- `aqua-tokens share` until core numbers are verified against each platform’s usage UI
