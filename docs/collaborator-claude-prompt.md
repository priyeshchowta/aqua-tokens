# Paste into Claude Code — optional live re-check

Copy everything below the line into Claude Code if you want to re-verify Aqua's local OTel POC on your machine.

---

You are helping re-verify the local `aqua-tokens` package against a real Claude Code OpenTelemetry session.

## Context

- Repo root should be the `aqua-tokens` clone.
- `aqua-tokens report` (JSONL) is the current report path and already works.
- Live OTel transport was previously verified with caveats (`docs/live-verification.md`). OTel is **not** wired into `report` yet.
- If this machine uses a corporate proxy / custom `ANTHROPIC_BASE_URL`, document that honestly. Do not bypass IT policy.
- Prefer deliverables as chat/markdown text if file attachments may be DRM-encrypted.

## Procedure

1. From repo root: `npm install && npm run verify && npm run build && npm link`
2. Document environment: `claude --version`, OS, whether `ANTHROPIC_BASE_URL` is set (redact internal hostnames when sharing publicly).
3. Start: `aqua-tokens otel-poc --listen --output ./api-request.json`
4. Merge the Aqua OTel `env` block from `aqua-tokens otel-poc --print-config` into `~/.claude/settings.json` (keep any required local/company vars).
5. Do not enable `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`.
6. After Claude restart, send 1–2 normal prompts; wait for flush.
7. Summarize captured `claude_code.api_request` fields and totals (counted vs cache).
8. Update `docs/live-verification.md` only if new evidence changes findings.
9. Paste a redacted event JSON in chat (`request_id` / `session_id` → `"REDACTED"`; no prompts/tools/raw bodies).

## Deliverables

- Short caveated summary
- Redacted JSON pasted as text
- Optional PR if docs need a factual refresh

## Do not

- Bypass security / proxy controls
- Wire OTel into `report` unless maintainers ask
- Build daemon / notifications / share
- Claim first-party Claude usage-UI parity without evidence
- Publish internal hostnames, credentials, prompts, or raw OTLP payloads
