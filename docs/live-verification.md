# Live verification checklist

This checklist is for a **real** Claude Code session against Aqua's local OTel POC.
Automated tests and synthetic fixtures do **not** complete it.

**How to run the check:** see `docs/verify-with-claude-code.md`.

**Supported source (v1):** Claude Code only.

Live Claude verification status: **accepted with caveats** (proxied environment; pinch of salt).

Transport, parse, sanitize, and ID fallback are verified against real `claude_code.api_request` events. Token-field fidelity against a first-party Claude usage UI was **not** available in the verification environment.

---

## Acceptance decision

| Decision | Choice |
| --- | --- |
| Live OTel transport / parse | **Verified** on real events |
| First-party Claude usage-UI comparison | **Not available** in the verification environment |
| Confidence | **Pinch of salt** — do not over-claim billing or UI parity |
| Wire OTel into `report` now? | **No** — keep JSONL as `report` source; keep OTel as POC |
| What we trust | Loopback receive, parse, sanitize, ID fallback |
| What we do not trust yet | `request_id` presence under proxies, `input_tokens` under cache-heavy sessions, usage-UI parity |

---

## Claude Code

- [x] OTel is enabled (`CLAUDE_CODE_ENABLE_TELEMETRY=1` and the env block from `aqua-tokens otel-poc --print-config`).
- [x] Aqua is listening on localhost (`aqua-tokens otel-poc --listen` → `127.0.0.1:4318`).
- [x] A real Claude Code request was made (normal chat / tool use — not a synthetic login failure).
- [x] A real `claude_code.api_request` was received and printed by Aqua. **27 events** in the refresh capture (earlier sample was 12).
- [~] `input_tokens` is non-zero when expected. **Quantized small values (`2` ×25, `94` ×2) — see Finding 2.**
- [x] `output_tokens` is non-zero when expected. **Range 82–4,328.**
- [ ] Request ID is present/stable (`request_id`, or `client_request_id` on timeouts). **FAILS: both null in 27/27 — see Finding 1.**
- [x] Cache fields are understood (`cache_read_tokens` / `cache_creation_tokens` stored; excluded from water). **Impact quantified — see Finding 3.**
- [x] Event can be mapped to `UsageEvent`. **Via fallback `claude-otel:<session_id>:<timestamp>`, not `claude-otel:<request_id>`.** 27→27 unique ids, no collisions.
- [x] No prompt/tool/private content is required (do not enable `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`).

### Verification against Claude

| Field | Value |
| --- | --- |
| Date | 2026-09-07 (refresh capture) |
| Claude Code version | 2.1.263 |
| Node | v22.19.0 |
| OS | Windows 11 |
| Model | `claude-opus-5` (as reported by telemetry) |
| API path | Corporate LiteLLM-style proxy (`ANTHROPIC_BASE_URL` set — host redacted) |
| Aqua input tokens | Small / quantized — mostly `2`, two events at `94` |
| Aqua output tokens | 82–4,328 (counted input+output total **25,772**) |
| Claude usage reference | **Not available** — proxied session, no first-party Claude usage UI |
| Result | **accepted with caveats** |
| Notes | Findings 1–3 stand. Do not over-claim fidelity. |

### Environment caveat

Capture used a **corporate LLM proxy** via `ANTHROPIC_BASE_URL`, not Anthropic directly.

1. Missing `request_id` may be proxy artifact or Claude Code behavior — cannot distinguish without a direct capture.
2. `cost_usd` reflects proxy-side pricing.
3. Aqua transport / parse / sanitize / ID fallback are still verified by this run.

---

## Findings

### Finding 1 — `request_id` and `client_request_id` null in 27/27

Fallback id used:

```text
claude-otel:<session_id>:<timestamp>
```

27 events → 27 unique ids. Same-millisecond collision risk remains theoretical.

**Accepted risk:** keep fallback; harden later (e.g. sequence) before any OTel→`report` wiring.

### Finding 2 — `input_tokens` is quantized / negligible vs cache

An early 12-event sample looked like a hard constant `input_tokens: 2`. At **27 events** the values are two quantized buckets (`2` ×25, `94` ×2) — not a single constant, but still not proportional to real prompt mass.

Real prompt mass appears in cache fields. v1 `input + output` counting remains effectively **output-dominated** for this cache-heavy agentic session.

Not an Aqua parse bug — telemetry values were reflected faithfully.

### Finding 3 — v1 accounting captured ~0.74% of processed tokens

Refresh totals (27 events):

| Field | Tokens |
| --- | --- |
| Counted (`input` + `output`) | 25,772 |
| Excluded cache | 3,461,495 |
| Grand total processed | 3,487,267 |

Water (scope-1+2): counted **258–1,289 mL** vs cache-inclusive **~34.9–174.4 L** (~**135×**). The gap can grow as cache reads accumulate over a long agentic session.

Cache exclusion remains intentional methodology; magnitude should stay visible in docs/product copy.

---

## What automated tests already cover

| Layer | Status |
| --- | --- |
| Unit / fixture parsers (Claude JSONL + OTel) | Covered by `npm test` |
| Synthetic OTel → UsageEvent → SQLite → report | Covered by e2e fixture test |
| Live Claude Code OTel — transport + parse + sanitize | **Verified** (proxied environment; 27-event refresh) |
| Live Claude Code OTel — vs first-party Claude usage UI | **Not available** — accepted gap |

## Product implication

- Keep **`aqua-tokens report`** on Claude JSONL for now.
- Keep **`otel-poc`** as the live OTel path.
- Do **not** start daemon / notifications / share on the back of this caveated gate.
- Optional later work: harden OTel id fallback; surface cache-excluded volume in reports; revisit OTel→`report` only with Findings 1–3 disclosed.
- Independent re-checks on direct (non-proxied) Claude Code are welcome — see `docs/verify-with-claude-code.md`.
