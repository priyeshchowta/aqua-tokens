# Roadmap

v1 is **Claude Code only**. Cursor and other platforms stay out of scope until that decision changes.

## Next milestone

1. **Live Claude Code OTel verification** — capture a real `claude_code.api_request` and compare it to Claude's usage reference (`docs/live-verification.md`).
2. Only then wire OTel into `aqua-tokens report` as the primary usage path (JSONL remains fallback).

## After that gate

- Background monitoring (`start` / `stop` / `status`)
- Notifications
- Share cards (`aqua-tokens share`)

Do not start the daemon, notifications, or share cards before live verification.

## Explicit non-goals for now

- Hosted dashboard, Aqua accounts, or cloud telemetry
- Guessing tokens from character length or statusline context-window fields
- Point water estimates (always a labeled range)
