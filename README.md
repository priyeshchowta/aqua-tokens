# aqua-tokens

Local CLI that tracks **Claude Code** usage on your machine and converts the measured usage into an estimated **water-footprint range**.

No Aqua server. No Aqua account. No hosted dashboard. History stays in `~/.aqua-tokens/history.sqlite`.

## Why it exists

Token trackers show usage but not water. Water estimators often invent a single constant without reading real logs. Aqua reads **local Claude Code usage** (when available) and converts **request tokens counted by Aqua** into a **labeled range** with methodology caveat and citation — not a viral point estimate.

```
$ aqua-tokens report

🌊 Lifetime: 1.2M tokens · 12–60 L, scope-1+2
  Source: Claude Code

  Period      Tokens  Water (scope-1+2)
  ---------  ------  -----------------
  Today        12.4K  124–620 mL
  This week    80.0K  800 mL–4.0 L
  All-time      1.2M  12–60 L
```

## What it does

Claude Code usage → request tokens counted by Aqua → water range (with caveat and citation).

Aqua reports **request tokens counted by Aqua** (`input_tokens + output_tokens`), not a billed invoice total and not “every token the model processed.” Cache read/write fields are stored when present but excluded from water.

## Supported source

**Claude Code only** (v1).

| Role | Source |
| --- | --- |
| Primary candidate | OpenTelemetry `claude_code.api_request` (local POC; live verification pending) |
| Fallback / current `report` | Claude Code JSONL `message.usage` |

No other platforms in v1.

## How it works

```
Claude Code
    ↓
usage telemetry (OTel api_request preferred; JSONL fallback)
    ↓
Aqua (UsageEvent → SQLite, insert-if-new)
    ↓
aggregation + water methodology
    ↓
water range report
```

## Installation

Requires **Node.js ≥ 22.5**.

```bash
git clone https://github.com/priyeshchowta/aqua-tokens.git
cd aqua-tokens
npm install
npm test
npm run build
npm link   # optional
```

Or without linking: `npx tsx src/cli.ts report`

## Basic usage

```bash
aqua-tokens report
aqua-tokens report --scope1
aqua-tokens report --json
aqua-tokens otel-poc --print-config
aqua-tokens otel-poc --listen
aqua-tokens otel-poc --listen --output ./api-request.json
```

`report` currently reads Claude Code JSONL under `~/.claude/projects/` (and `transcripts/`). Do not treat JSONL as authoritative billed usage until verified against Claude’s usage UI.

## Test with Claude Code

A developer can verify the local OTel path with their own Claude Code install — no access to the author’s machine, no Claude account shared with Aqua, and no uploading raw logs.

1. **Clone and build**

   ```bash
   git clone https://github.com/priyeshchowta/aqua-tokens.git
   cd aqua-tokens
   npm install && npm run build
   ```

2. **Start the local OTel listener** (loopback only: `127.0.0.1:4318`)

   ```bash
   aqua-tokens otel-poc --listen --output ./api-request.json
   ```

3. **Configure Claude Code** — print the exact env block:

   ```bash
   aqua-tokens otel-poc --print-config
   ```

   Put that `env` object in `~/.claude/settings.json`, or export the same variables in your shell.

4. **Do not enable** `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`. Aqua only needs usage attributes.

5. **Run one or two normal Claude Code requests**, wait a second for export, then stop Claude.

6. **Inspect the received `claude_code.api_request`.** Aqua prints / writes only:

   - `event.name`, `request_id`, `model`
   - `input_tokens`, `output_tokens`
   - `cache_read_tokens`, `cache_creation_tokens`
   - `cost_usd`, `timestamp`, `session_id`

7. **Live accuracy verification is still required.** Compare Aqua’s token fields to an appropriate Claude usage reference, then fill in `docs/live-verification.md`. Passing unit tests is not live verification.

Before sharing a fixture publicly, redact `request_id` / `session_id`. Never share prompts, tool results, or raw OTLP payloads.

## Water methodology

Every number is a **range**, labeled with scope:

| Scope | Rate (Aqua interpolation) | Notes |
| --- | --- | --- |
| **scope-1+2** (default) | 10–50 mL / 1,000 tokens | Li et al. query-band interpolation |
| **scope-1** (`--scope1`) | 0.26–0.32 mL / 1,000 tokens | On-site cooling only (undercount) |

Rates live in `water-methodology.json`. Estimates vary 30×+ with scope, model, query complexity, and data-center location. See Li et al. https://arxiv.org/abs/2304.03271

**v1 accounting:** counted = `input_tokens + output_tokens`. Cache excluded.

## Privacy

- Aqua processes usage **locally**.
- Aqua does not need prompts, tool contents, or raw API bodies.
- Aqua does not need a cloud account.
- SQLite history stays on the machine.
- OTel verification uses a **localhost** collector (`127.0.0.1`).
- Do not upload raw Claude logs; sanitize fixtures before publishing.

## Limitations

- Live Claude Code OTel verification is **pending**.
- `report` still uses JSONL until OTel is verified and wired in.
- Statusline context-window fields are **not** a usage source.
- Water rates are Aqua’s interpolation, not a per-token formula stated by Li et al.
- Totals are per-machine (no sync).
- Background daemon, notifications, and share cards are **not** implemented.

## Development

```bash
npm install
npm test
npm run build
npm run verify
npx tsx src/cli.ts report
npx tsx src/cli.ts otel-poc --file tests/fixtures/otel/api-request.json
```

## Verification status

| Kind | Status |
| --- | --- |
| Automated tests | `npm test` (offline) |
| Synthetic OTel → report | Covered by e2e fixture test |
| Live Claude Code OTel | **Pending** until a real `claude_code.api_request` is captured and compared |

> Live Claude Code OTel verification is pending until a real Claude Code session produces a `claude_code.api_request` that can be inspected and compared with an appropriate Claude usage reference.

Details: `docs/usage-sources.md`, `docs/live-verification.md`, `PROJECT_OVERVIEW.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and live Claude OTel verification notes (via `docs/live-verification.md`) are especially welcome. Please do not open PRs that add other platforms, a daemon, or notifications until live OTel verification is done.
