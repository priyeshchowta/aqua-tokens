# aqua-tokens

> **Make AI usage visible. Make unnecessary usage harder to ignore.**

A local-first CLI that tracks **available Claude Code usage data** and converts **counted request tokens** into an estimated **water-footprint range**.

Aqua is built around a simple idea: **AI usage should be visible and accountable.**

No Aqua server. No Aqua account. No hosted dashboard. Aqua stores its usage history locally on your machine in `~/.aqua-tokens/history.sqlite`.

> **Status:** Early development. Claude Code OpenTelemetry support is available for testing, but live usage verification is still pending.

## Why Aqua?

AI has made it incredibly easy to consume compute.

A developer can send another prompt, regenerate an answer, run another search, ask an agent to retry a task, or keep iterating on something that could have been solved with fewer requests. Each individual action feels almost free because the underlying resource consumption is invisible.

Aqua makes that usage tangible.

Instead of only showing:

```text
You've used 1.2M tokens.
```

Aqua aims to show:

```text
You've used 1.2M tokens.

Estimated water footprint:
12–60 L
```

The goal isn't to shame people for using AI or to suggest that every prompt is wasteful.

The goal is **awareness and accountability**.

Aqua encourages users to ask:

- How much AI am I actually using?
- Am I repeatedly asking the same question?
- Do I really need another generation?
- Could this task have been completed with fewer requests?
- Is the additional compute worth it?

Aqua puts an environmental estimate next to usage so that these decisions are no longer completely invisible.

## What it does

```text
Claude Code usage
        ↓
request tokens counted by Aqua
        ↓
water-footprint methodology
        ↓
estimated water range
```

Aqua reports **request tokens counted by Aqua**:

```text
input_tokens + output_tokens
```

This is **not**:

- a provider billing invoice;
- a claim of every token processed by the model;
- a measurement of physical water consumed by a specific request.

Cache read/write fields may be stored when available, but they are **currently excluded** from the water calculation.

Aqua does **not** claim to reproduce a provider's billing total.

## Example

```text
$ aqua-tokens report

🌊 Lifetime: 1.2M tokens · 12–60 L, scope-1+2
  Source: Claude Code

  Period      Tokens  Water (scope-1+2)
  ---------  ------  -----------------
  Today        12.4K  124–620 mL
  This week      80K  0.8–4 L
  All-time      1.2M  12–60 L

  ~2 toilet flushes, conservative estimate (lifetime low end)

  Estimates vary 30x+ depending on scope, model version, query complexity, and data center location.
  Counted tokens are API-request input + output only. Cache reads and cache writes are recorded when present but excluded from water. This is not a billed-token total.
  Li, P., Yang, J., Islam, M.A., Ren, S. "Making AI Less Thirsty: Uncovering and Addressing the Secret Water Footprint of AI Models." UC Riverside, 2023 / Commun. ACM 2024. https://arxiv.org/abs/2304.03271
  Totals are per-machine. Logs are local-only; a second computer is a separate total.
```

**Example output — values are illustrative.**

The range is intentional. Aqua does not present a single precise-looking number when the underlying environmental estimate contains substantial uncertainty.

## Supported source

**Claude Code only** for v1.

| Role | Source |
|---|---|
| Intended primary source | OpenTelemetry `claude_code.api_request` — live verification pending |
| Current report source / fallback | Claude Code JSONL `message.usage` |

The OpenTelemetry implementation is currently a local proof of concept:

```bash
aqua-tokens otel-poc
```

It is **not yet the production source for `report`**.

Today, `aqua-tokens report` reads Claude Code JSONL usage data. OTel is the intended primary usage path once live verification is complete.

Other AI platforms are out of scope for v1.

## How it works

```text
Claude Code
    ↓
available usage data
    ↓
Aqua UsageEvent
    ↓
local SQLite history
    ↓
aggregation
    ↓
water methodology
    ↓
estimated water range
```

Aqua stores its usage history locally:

```text
~/.aqua-tokens/history.sqlite
```

There is no Aqua cloud service involved in the current architecture.

Today, `aqua-tokens report` reads JSONL. The OTel path is available for local verification via `otel-poc` and is not yet wired into `report`.

## Installation

Requires **Node.js ≥ 22.5**.

Clone the repository and build it locally:

```bash
git clone https://github.com/priyeshchowta/aqua-tokens.git
cd aqua-tokens
npm install
npm test
npm run build
```

Optionally, make the local CLI available as `aqua-tokens`:

```bash
npm link
```

Without linking, you can run the CLI directly from the repository:

```bash
npx tsx src/cli.ts report
```

## Basic usage

```bash
aqua-tokens report
aqua-tokens report --scope1
aqua-tokens report --json
```

For the OpenTelemetry proof of concept:

```bash
aqua-tokens otel-poc --print-config
aqua-tokens otel-poc --listen
```

`report` currently reads Claude Code JSONL usage data from the local Claude Code data directories.

JSONL should not be treated as authoritative billed usage until it has been verified against an appropriate Claude usage reference.

## Test with Claude Code

The OTel proof of concept can be tested with your own Claude Code installation.

You do not need access to the author's machine, you do not share your Claude account with Aqua, and you should not upload raw Claude logs.

### 1. Clone and build

```bash
git clone https://github.com/priyeshchowta/aqua-tokens.git
cd aqua-tokens
npm install
npm run build
```

### 2. Start the local OTel listener

The listener uses loopback by default:

```text
127.0.0.1:4318
```

Start it using the command supported by the current CLI:

```bash
aqua-tokens otel-poc --listen
```

### 3. Get the Claude Code configuration

Print the configuration generated by Aqua:

```bash
aqua-tokens otel-poc --print-config
```

Put the printed `env` block into `~/.claude/settings.json`, or export the same variables in your shell before starting Claude Code.

### 4. Keep telemetry minimal

Do **not** enable telemetry options that collect additional content such as:

```text
OTEL_LOG_USER_PROMPTS
OTEL_LOG_TOOL_CONTENT
OTEL_LOG_RAW_API_BODIES
```

Aqua only needs usage-related attributes for this verification.

### 5. Run Claude Code

Run one or two normal Claude Code requests and allow enough time for telemetry to be exported.

### 6. Look for the API request event

The event Aqua is trying to verify is:

```text
claude_code.api_request
```

The relevant usage information includes fields such as:

```text
event.name
request_id
model
input_tokens
output_tokens
cache_read_tokens
cache_creation_tokens
cost_usd
timestamp
session_id
```

Only the fields required for usage accounting should be retained or shared.

### 7. Live verification

Live verification is still pending.

A real Claude Code session needs to produce a `claude_code.api_request` that can be inspected and compared against an appropriate Claude usage reference.

Record the result in:

```text
docs/live-verification.md
```

Passing automated or synthetic tests does **not** constitute live verification.

### Privacy when sharing test data

Before sharing a fixture publicly:

- redact `request_id`;
- redact `session_id`;
- remove prompts;
- remove tool contents;
- remove source code;
- remove credentials;
- do not share raw OTLP payloads.

## Water methodology

Every Aqua water estimate is presented as a **range** and labeled with its scope.

| Scope | Rate (Aqua interpolation) | Notes |
|---|---:|---|
| **scope-1+2** (default) | 10–50 mL / 1,000 tokens | Li et al. query-band interpolation |
| **scope-1** (`--scope1`) | 0.26–0.32 mL / 1,000 tokens | On-site cooling only (undercount) |

Rates are defined in:

```text
water-methodology.json
```

These are **Aqua's methodology/interpolation rates**. They should not be interpreted as a universal per-token water constant.

Estimates can vary substantially with scope, model, workload, and data-center conditions.

See Li et al.:

https://arxiv.org/abs/2304.03271

### v1 accounting

Aqua currently counts:

```text
input_tokens + output_tokens
```

Cache read/write tokens are stored when available but excluded from the water calculation.

The methodology is intentionally conservative about what Aqua claims to know. The resulting value is an **estimated water-footprint range**, not a direct measurement of physical water consumption.

## Privacy

Aqua is designed around local processing.

- Aqua stores its usage history locally on your machine.
- Aqua does not upload that history to an Aqua server.
- Aqua does not require an Aqua cloud account.
- Aqua does not need prompts to calculate token-based usage.
- Aqua does not need tool contents or raw API bodies.
- OTel verification uses a localhost collector (`127.0.0.1`).
- Do not upload raw Claude logs or private session data.
- Sanitize fixtures before committing or sharing them publicly.

## Limitations

Aqua is intentionally transparent about what it does not currently know.

### Usage data

- Live Claude Code OTel verification is **pending**.
- `report` currently uses Claude Code JSONL until OTel is verified and wired into `report`.
- JSONL should not be treated as an authoritative provider billing record.
- Statusline context-window fields are not treated as a usage source.

### Environmental estimates

- Water values are estimates rather than direct measurements.
- Water rates are Aqua's interpolation rather than a universal per-token formula.
- Actual environmental impact can vary with model, workload, data-center location, cooling systems, energy sources, and accounting scope.

### Product scope

- Totals are currently per-machine; there is no synchronization.
- Background monitoring is not implemented.
- Notifications are not implemented.
- Share cards are not implemented.
- Other AI platforms are out of scope for v1.

## Verification status

| Area | Status |
|---|---|
| Claude JSONL parser | Implemented |
| Claude OTel proof of concept | Implemented |
| Synthetic OTel testing | Verified |
| SQLite persistence | Implemented |
| Water calculation | Implemented |
| End-to-end synthetic flow | Covered by tests |
| Live Claude Code OTel | **Pending** |
| Background monitoring | Not implemented |
| Notifications | Not implemented |
| Other AI platforms | Out of scope for v1 |

> **Live Claude Code OTel verification is pending** until a real Claude Code session produces a `claude_code.api_request` that can be inspected and compared with an appropriate Claude usage reference.

For more detail, see:

- `docs/usage-sources.md`
- `docs/live-verification.md`
- `PROJECT_OVERVIEW.md`

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Run the CLI directly during development:

```bash
npx tsx src/cli.ts report
```

Automated tests should not require:

- a Claude subscription;
- a Claude account;
- Cursor;
- API keys;
- network access to an AI provider.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Aqua v1 is intentionally Claude-Code-only. Future directions are documented in [ROADMAP.md](ROADMAP.md).

Changes to usage sources or the water methodology should include tests and corresponding documentation.

Please do not include Claude prompts, tool output, raw telemetry, credentials, source code, or other private data in issues or pull requests.

If you have access to Claude Code and can help with **live OTel verification**, sanitized verification results are especially useful.

## Philosophy

Aqua is not trying to tell developers:

> "Don't use AI."

It is trying to make the invisible cost of AI usage **visible**.

AI is extremely useful. But when computation becomes effortless, unnecessary computation becomes easy to overlook.

Aqua's purpose is to add a small piece of friction in the right place:

> **See what you're consuming. Think about what you need. Make the next request count.**

## License

MIT. See [LICENSE](LICENSE).
