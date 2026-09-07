# Live verification checklist

This checklist is for a **real** Claude Code session against Aqua's local OTel POC.
Automated tests and synthetic fixtures do **not** complete it.

**How to run the check:** see `docs/verify-with-claude-code.md`.

**Supported source (v1):** Claude Code only.

Live Claude verification status: **accepted with caveats (final test machine = company laptop / LiteLLM)**.

Treat results with a **pinch of salt**: no personal / direct-Anthropic machine is available, so this proxied capture is the last live test we will wait on.

---

## Acceptance decision (2026-09-07)

| Decision | Choice |
| --- | --- |
| Final live test machine | Company laptop (LiteLLM / corporate proxy) |
| Further non-proxied capture | **Not planned** (no personal laptop available) |
| Confidence | **Pinch of salt** — transport proven; token-field fidelity vs first-party Claude UI **not** proven |
| Wire OTel into `report` now? | **No** — keep JSONL as `report` source; keep OTel as POC |
| What we trust | Loopback receive, parse, sanitize, ID fallback on real events |
| What we do not trust yet | `request_id` presence, `input_tokens` semantics under cache-heavy / proxied sessions, usage-UI parity |

---

## Claude Code

- [x] OTel is enabled (`CLAUDE_CODE_ENABLE_TELEMETRY=1` and the env block from `aqua-tokens otel-poc --print-config`).
- [x] Aqua is listening on localhost (`aqua-tokens otel-poc --listen` → `127.0.0.1:4318`).
- [x] A real Claude Code request was made (normal chat / tool use — not a synthetic login failure).
- [x] A real `claude_code.api_request` was received and printed by Aqua. **12 events captured.**
- [~] `input_tokens` is non-zero when expected. **Technically non-zero but constant at `2` across all 12 events — see Finding 2.**
- [x] `output_tokens` is non-zero when expected. **Range 133–3,814.**
- [ ] Request ID is present/stable (`request_id`, or `client_request_id` on timeouts). **FAILS: both `null` in 12/12 events — see Finding 1.**
- [x] Cache fields are understood (`cache_read_tokens` / `cache_creation_tokens` stored; excluded from water). **Impact quantified — see Finding 3.**
- [x] Event can be mapped to `UsageEvent`. **Via fallback `claude-otel:<session_id>:<timestamp>`, not `claude-otel:<request_id>`.**
- [x] No prompt/tool/private content is required (do not enable `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`).

### Verification against Claude

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Claude Code version | 2.1.263 |
| Model | `claude-opus-5` (as reported by telemetry) |
| Aqua input tokens | 24 total across 12 events (constant `2` per event) |
| Aqua output tokens | 11,416 total across 12 events (133–3,814 per event) |
| Claude usage reference | **Not available** — LiteLLM proxy, no first-party Claude usage UI |
| Result | **accepted with caveats** |
| Notes | Company laptop is the final test machine. Findings 1–3 stand; do not over-claim fidelity. |

### Environment caveat

Capture used `ANTHROPIC_BASE_URL` → **LiteLLM proxy**, not Anthropic directly.

1. Missing `request_id` may be proxy artifact or Claude Code behavior — **cannot distinguish** without a direct capture (not available).
2. `cost_usd` reflects proxy-side pricing.
3. Aqua transport / parse / sanitize / ID fallback are still verified by this run.

---

## Findings

### Finding 1 — `request_id` and `client_request_id` null in 12/12

Fallback id used:

```text
claude-otel:<session_id>:<timestamp>
```

12 events → 12 unique ids. Same-millisecond collision risk remains theoretical.

**Accepted risk:** keep fallback; harden later (e.g. sequence) before any OTel→`report` wiring.

### Finding 2 — `input_tokens` constant at `2`

Real prompt mass appears in cache fields. v1 `input + output` counting behaves like **output-only** for this cache-heavy agentic session.

Not an Aqua parse bug — telemetry values were reflected faithfully.

### Finding 3 — v1 accounting captured ~0.8% of processed tokens

| Field | Tokens |
| --- | --- |
| Counted (`input` + `output`) | 11,440 |
| Excluded cache | 1,408,871 |
| Grand total processed | 1,420,311 |

Water (scope-1+2): counted **114–572 mL** vs cache-inclusive **~14.2–71 L** (~124×). Cache exclusion remains intentional methodology; magnitude should stay visible in docs/product copy.

---

## What automated tests already cover

| Layer | Status |
| --- | --- |
| Unit / fixture parsers (Claude JSONL + OTel) | Covered by `npm test` |
| Synthetic OTel → UsageEvent → SQLite → report | Covered by e2e fixture test |
| Live Claude Code OTel — transport + parse + sanitize | **Verified 2026-09-07** (company laptop) |
| Live Claude Code OTel — vs first-party Claude usage UI | **Not available** — accepted gap |

## Product implication

- Keep **`aqua-tokens report`** on Claude JSONL for now.
- Keep **`otel-poc`** as the live OTel path.
- Do **not** start daemon / notifications / share on the back of this partial gate.
- Optional later work (not blocked on another laptop): harden OTel id fallback; surface cache-excluded volume in reports; revisit OTel→`report` only with eyes open on Findings 1–3.
