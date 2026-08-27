# Contributing

Thanks for helping with aqua-tokens.

## Before you start

1. Read `README.md` and `PROJECT_OVERVIEW.md`.
2. Read `docs/usage-sources.md` (OTel vs JSONL vs statusline).
3. v1 is **Claude Code only**. Do not add Cursor or other platforms without an explicit scope decision.
4. Live Claude Code OTel verification is still **pending** (`docs/live-verification.md`). That is the next milestone — not a background daemon.

## Local setup

```bash
npm install
npm test
npm run build
# or
npm run verify
```

Requires Node.js ≥ 22.5.

## What we welcome

- Bug reports with fixtures (sanitized — no prompts, tools, or raw API bodies)
- Improvements to Claude JSONL / OTel parsing accuracy
- Completing `docs/live-verification.md` from a real Claude Code session
- Documentation clarity

## What to avoid for now

- Background daemon / `start` / `stop` / notifications / share cards
- New platforms
- Guessing tokens from character length or context-window fields
- Changing water rates or input/output/cache accounting without methodology review
- Enabling or documenting `OTEL_LOG_USER_PROMPTS` / `OTEL_LOG_RAW_API_BODIES` as required

## Pull requests

- Keep changes focused.
- Add or update tests when behavior changes.
- Ensure `npm run verify` passes.
- Do not commit local SQLite DBs, `.env`, or raw Claude logs.
