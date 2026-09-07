# Verify aqua-tokens with Claude Code

Prove whether **aqua-tokens** can receive a **real** Claude Code `claude_code.api_request` over local OpenTelemetry, and whether the token counts look right vs Claude’s own usage UI.

Automated tests and synthetic fixtures do **not** count. We need one live capture plus a short verification note.

Also see: `docs/live-verification.md` (checklist + results table).

---

## Goal

1. Capture a real `claude_code.api_request` on localhost.
2. Compare Aqua token fields to Claude’s usage reference when possible.
3. Record the outcome so we know whether to wire OTel into `aqua-tokens report`.

---

## Prerequisites

- Node.js **≥ 22.5**
- Claude Code installed and logged in
- Access to the private repo `priyeshchowta/aqua-tokens`

---

## Steps

### 1. Clone, build, link

```bash
git clone https://github.com/priyeshchowta/aqua-tokens.git
cd aqua-tokens
npm install
npm run verify
npm run build
npm link
```

Confirm:

```bash
aqua-tokens --help
```

### 2. Start Aqua’s listener first

In terminal A (leave it running):

```bash
aqua-tokens otel-poc --listen --output ./api-request.json
```

You should see it listening on `127.0.0.1:4318`.

### 3. Configure Claude Code telemetry

In terminal B:

```bash
aqua-tokens otel-poc --print-config
```

Add the printed `env` block into `~/.claude/settings.json` (merge under `"env"` if that key already exists):

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "none",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318",
    "OTEL_LOGS_EXPORT_INTERVAL": "1000"
  }
}
```

Do **not** set:

- `OTEL_LOG_USER_PROMPTS`
- `OTEL_LOG_TOOL_CONTENT`
- `OTEL_LOG_RAW_API_BODIES`

Aqua only needs usage attributes for this verification.

### 4. Restart Claude Code and make real requests

1. Fully quit Claude Code so it picks up settings.
2. Start Claude Code again.
3. Send **1–2 normal prompts** (real chat / tool use — not a failed login).
4. Wait ~2–5 seconds after the reply so telemetry can flush.
5. Note Claude’s own usage numbers for those requests if the UI shows them.
6. Note Claude Code version (`claude --version`) and the model used.

### 5. Confirm Aqua received the event

In terminal A you should see a printed `claude_code.api_request` with fields like:

- `request_id`
- `model`
- `input_tokens`
- `output_tokens`
- `cache_read_tokens` / `cache_creation_tokens` (may be `0`)

Also check:

```bash
cat ./api-request.json
```

**Pass signal:** at least one event with non-zero `input_tokens` / `output_tokens` when the request produced real usage, plus a stable `request_id`.

**Fail signal:** listener stays empty, only non-API events, zeros when Claude clearly used tokens, or missing request id.

### 6. Optionally check the JSONL report path

```bash
aqua-tokens report
aqua-tokens report --json
```

This uses Claude JSONL (current `report` source). Useful as a second data point, but **OTel live capture is the gate**.

### 7. Fill the verification table

Update `docs/live-verification.md`, or send back the same table:

| Field | Value |
| --- | --- |
| Date | |
| Claude Code version | |
| Model | |
| Aqua input tokens | |
| Aqua output tokens | |
| Claude usage reference | |
| Result | match / mismatch / no event |
| Notes | |

Also tick the checklist in `docs/live-verification.md`.

### 8. What to send back (sanitized)

Share:

1. The filled verification table / a PR updating `docs/live-verification.md`
2. Sanitized `api-request.json` with `request_id` and `session_id` redacted
3. Claude Code version + OS
4. Pass/fail plus short notes (for example: “event arrived but tokens mismatch UI by X”)

Do **not** share:

- prompts
- tool contents
- raw OTLP dumps
- credentials
- unredacted session/request ids if posting publicly

---

## Definition of done

For this project, the company laptop (often LiteLLM) is the **final** live test machine. Results are **accepted with caveats** — pinch of salt, not first-party Claude UI parity.

We treat live OTel as good enough to trust transport/parse when:

1. A real `claude_code.api_request` arrived on localhost.
2. Environment/proxy caveats are documented.
3. `docs/live-verification.md` records findings honestly.

We still **do not** auto-wire OTel into `aqua-tokens report` from that alone. JSONL remains the report source until a deliberate product decision says otherwise.
