# Roadmap

v1 is **Claude Code only**. Cursor and other platforms stay out of scope until that decision changes.

## Live verification (closed with caveats)

Final live test machine: **company laptop via LiteLLM**. No personal / direct-Anthropic capture is planned.

Status: **accepted with caveats** — see `docs/live-verification.md`.

- Trusted: OTel loopback transport, parse, sanitize, ID fallback on real events.
- Not trusted: first-party usage-UI parity; `request_id` presence; `input_tokens` under cache-heavy proxied sessions.
- **`report` stays on Claude JSONL.** OTel remains POC. Do not treat this as a green light to make OTel the primary report source.

## Next (optional, deliberate)

1. Document / surface cache-excluded token volume more clearly in report copy (methodology, not silent).
2. Harden OTel event-id fallback before any future OTel→`report` wiring.
3. Only then reconsider wiring OTel into `report` — with Findings 1–3 disclosed.

## Later (still gated)

- Background monitoring (`start` / `stop` / `status`)
- Notifications
- Share cards (`aqua-tokens share`)

Do not start the daemon, notifications, or share cards while OTel is only caveated-POC.

## Explicit non-goals for now

- Hosted dashboard, Aqua accounts, or cloud telemetry
- Guessing tokens from character length or statusline context-window fields
- Point water estimates (always a labeled range)
- Waiting on a personal laptop for “perfect” live verification
