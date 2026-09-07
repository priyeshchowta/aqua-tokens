# Paste this into Claude Code (company laptop = final test machine)

Copy everything below the line into Claude Code.

---

You are helping with a **final caveated live check** of `aqua-tokens` on a **company laptop**.

## Important policy

- This company laptop (often LiteLLM / corporate proxy) is the **last** live test machine we will use.
- Do **not** ask for a personal laptop or direct-Anthropic-only setup.
- Take results with a **pinch of salt** and document caveats honestly.
- Prefer deliverables as **chat/markdown text** (company file DRM previously made JSON attachments unreadable).

## Context

- `aqua-tokens report` (JSONL) already works.
- Prior OTel run: transport worked; `request_id` null; `input_tokens` often `2`; cache tokens huge.
- Repo docs already accept this environment with caveats (`docs/live-verification.md`). Your job is to refresh/confirm artifacts if needed, not to unblock a non-proxied retest.

## Procedure

1. From repo root: `npm install && npm run verify && npm run build && npm link`
2. Document environment: `claude --version`, OS, whether `ANTHROPIC_BASE_URL` / LiteLLM is set (do not bypass IT).
3. Start: `aqua-tokens otel-poc --listen --output ./api-request.json`
4. Ensure Claude `~/.claude/settings.json` `env` includes the Aqua OTel block from `aqua-tokens otel-poc --print-config` (keep required company vars).
5. Do not enable `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`.
6. After Claude restart, send 1–2 normal prompts; wait for flush.
7. Summarize captured `claude_code.api_request` fields and totals (counted vs cache).
8. Update `docs/live-verification.md` only if new evidence changes findings; keep status as accepted-with-caveats unless something clearly regresses.
9. Paste a redacted event JSON in chat (`request_id` / `session_id` → `"REDACTED"`).

## Deliverables

- Short caveated summary in chat
- Redacted JSON pasted as text
- Optional PR only if docs need a factual refresh

## Do not

- Bypass company proxy/security
- Wire OTel into `report`
- Build daemon / notifications / share
- Claim first-party Claude usage-UI parity
