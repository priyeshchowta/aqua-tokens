# Contributing

Thanks for helping with aqua-tokens.

## We especially need your help with

Two things would unblock the biggest open accuracy questions in this project:

1. **A non-proxied, direct-Anthropic Claude Code session comparison.** If you run Claude Code directly against Anthropic (no corporate proxy, no custom `ANTHROPIC_BASE_URL`), please run `aqua-tokens report` alongside Claude Code's own usage display and share the two numbers side by side (sanitized — no prompts, no raw logs). All live verification so far (`docs/live-verification.md`) was captured through a corporate LLM proxy, so we don't yet know how the JSONL-derived counts compare to Claude's own first-party usage UI on a direct connection. See `docs/verify-with-claude-code.md` for the checklist.
2. **Discussion on whether cache read/write tokens should count toward the water estimate.** Aqua v1 excludes `cache_read_tokens` and `cache_creation_tokens` from the water calculation (see `water-methodology.json`). In real-session testing, cache tokens made up ~99% of total tokens processed, so this exclusion can undercount a cache-heavy session's footprint by up to ~135x (Finding 3, `docs/live-verification.md`). Cache reads and writes still represent real server compute and storage, even at a lower marginal cost than fresh generation. Open an issue or comment on the pinned discussion with your take — we want informed opinions before changing the methodology, not just a quiet default.

## Before you start

1. Read `README.md` and `PROJECT_OVERVIEW.md`.
2. Read `docs/usage-sources.md` (OTel vs JSONL vs statusline).
3. v1 is **Claude Code only**. Do not add Cursor or other platforms without an explicit scope decision.
4. Live OTel verification is **accepted with caveats** (`docs/live-verification.md`). `report` still uses JSONL; do not wire OTel into `report` or build a background daemon without an explicit decision.

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
- Independent live re-checks (`docs/verify-with-claude-code.md`), especially on direct (non-proxied) Claude Code
- Documentation clarity
- Clearer reporting of cache-excluded token volume (methodology-aware, labeled)

## What to avoid for now

- Background daemon / `start` / `stop` / notifications / share cards
- New platforms
- Guessing tokens from character length or context-window fields
- Changing water rates or input/output/cache accounting without methodology review
- Enabling or documenting `OTEL_LOG_USER_PROMPTS` / `OTEL_LOG_RAW_API_BODIES` as required
- Publishing internal proxy hostnames, credentials, or raw Claude logs

## Pull requests

- Keep changes focused.
- Add or update tests when behavior changes.
- Ensure `npm run verify` passes.
- Do not commit local SQLite DBs, `.env`, or raw Claude logs.
