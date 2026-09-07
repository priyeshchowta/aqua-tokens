# Live verification checklist

This checklist is for a **real** Claude Code session against Aqua's local OTel POC.
Automated tests and synthetic fixtures do **not** complete it.

**How to run the check:** see `docs/verify-with-claude-code.md`.

**Supported source (v1):** Claude Code only.

Live Claude verification status: **pending**.

---

## Claude Code

- [ ] OTel is enabled (`CLAUDE_CODE_ENABLE_TELEMETRY=1` and the env block from `aqua-tokens otel-poc --print-config`).
- [ ] Aqua is listening on localhost (`aqua-tokens otel-poc --listen` → `127.0.0.1:4318`).
- [ ] A real Claude Code request was made (normal chat / tool use — not a synthetic login failure).
- [ ] A real `claude_code.api_request` was received and printed by Aqua.
- [ ] `input_tokens` is non-zero when expected.
- [ ] `output_tokens` is non-zero when expected.
- [ ] Request ID is present/stable (`request_id`, or `client_request_id` on timeouts).
- [ ] Cache fields are understood (`cache_read_tokens` / `cache_creation_tokens` stored; excluded from water).
- [ ] Event can be mapped to `UsageEvent` (`claude-otel:<request_id>`).
- [ ] No prompt/tool/private content is required (do not enable `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`).

### How to run

```bash
npm install && npm run build
aqua-tokens otel-poc --listen --output ./api-request.json
# configure Claude Code with: aqua-tokens otel-poc --print-config
# make 1–2 normal Claude Code requests, then stop Claude
```

Compare the printed `input_tokens` / `output_tokens` to Claude's own usage display for the same request when possible.

### Verification against Claude

| Field | Value |
| --- | --- |
| Date | |
| Claude Code version | |
| Model | |
| Aqua input tokens | |
| Aqua output tokens | |
| Claude usage reference | |
| Result | pending / match / mismatch |
| Notes | |

---

## What automated tests already cover

| Layer | Status |
| --- | --- |
| Unit / fixture parsers (Claude JSONL + OTel) | Covered by `npm test` |
| Synthetic OTel → UsageEvent → SQLite → report | Covered by e2e fixture test |
| Live Claude Code OTel | **Pending** — this document |
