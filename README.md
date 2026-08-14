# aqua-tokens

A local CLI that reads real token usage from **Claude Code** and **Cursor** session logs and converts it into an estimated **water consumption range**.

No server. No account. No network calls. One machine, one number you can actually defend.

```
$ aqua-tokens report

🌊 Lifetime: 1.2M tokens · 12–60 L, scope-1+2

  Period     Platform      Tokens  Water (scope-1+2)
  ---------  ------------  ------  -----------------
  Today      Claude Code    12.4K  124–620 mL
  ...

  ~2 toilet flushes, conservative estimate (lifetime low end)

  Estimates vary 30x+ depending on scope, model version, query complexity, and data center location.
  Li, P., Yang, J., Islam, M.A., Ren, S. "Making AI Less Thirsty..." https://arxiv.org/abs/2304.03271
  Totals are per-machine. Logs are local-only; a second computer is a separate total.
```

## Why a range, not a single number

AI water estimates are a contested topic. A point figure (100 mL per 1,000 tokens, 519 mL per prompt, etc.) travels well on social media and falls apart under citation-checking.

Li et al. themselves say the footprint of a query can vary **30× or more** with:

- **scope** — on-site cooling only vs cooling + the water used to generate electricity (up to ~75% of the total)
- **model version and query complexity**
- **data center location and season** (WUE and the grid's fuel mix)

So every number this tool prints is a **range**, labeled with the scope it measures, plus the paper's own caveat. If that feels unsatisfying, the alternative is a false precision the underlying data cannot support. Open an issue with a source if the rates in `water-methodology.json` need updating — that file is the only place the conversion lives.

## Install

Requires Node.js 22.5+.

```bash
cd aqua-tokens
npm install
npm run build
npm link
```

Or run without linking:

```bash
npx tsx src/cli.ts report
```

## Usage

```bash
aqua-tokens report           # default: scope-1+2 (cooling + electricity generation)
aqua-tokens report --scope1  # conservative on-site cooling only
aqua-tokens report --json
```

`--scope1` is the Google / Altman on-site-cooling band (~0.26–0.32 mL per ~1,000-token query). It is labeled as an undercount.

## What is counted

Water is applied to **input + output tokens combined**. Cache-read / cache-write tokens are parsed when present but **not** folded into the water total — the paper's 500–2,500 token query band is about the query itself, and treating a 200k cache hit as 80 extra queries would invent a number the methodology does not support.

Claude Code totals can be checked against the usage block in `~/.claude/projects/**/*.jsonl` (`message.usage.input_tokens` + `output_tokens`). Cursor totals come from per-bubble `tokenCount` in `state.vscdb` when Cursor actually stored it; many sessions omit tokens locally, in which case the report warns and undercounts rather than guessing from character length.

## Log locations (per OS)

Claude Code (override with `CLAUDE_CONFIG_DIR`):

| OS | Path |
| --- | --- |
| macOS / Linux / Windows | `~/.claude/projects/` and `~/.claude/transcripts/` |

Cursor desktop DB:

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux | `$XDG_CONFIG_HOME/Cursor/User/globalStorage/state.vscdb` (default `~/.config/Cursor/...`) |
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |

Cursor agent transcripts, when present: `~/.cursor/projects/*/agent-transcripts/`.

If a log file exists but does not match the expected schema, the CLI **exits with** `unrecognized log format, please open an issue` instead of inventing a parse.

## Totals are per-machine

Storage is local (`~/.aqua-tokens/history.sqlite`). Using Claude Code or Cursor on a laptop and a desktop produces two separate lifetimes. That is by design, not a sync bug.

## Methodology

The [Ren-Research notebooks](https://github.com/Ren-Research/Making-AI-Less-Thirsty) (MIT licensed) compute water as:

```text
water ≈ power × (on-site WUE + off-site EWIF × PUE)
```

over **datacenter hours / training runs** (LaMDA, hourly EIA fuel mix, wet-bulb WUE). They do not expose a per-query or per-token formula, so this tool does **not** pretend to port one.

**Fallback used here** — an interpolation from the paper's published query-scale figures, stored in `water-methodology.json`:

| Scope | Rate (this tool's interpolation) | Source |
| --- | --- | --- |
| **scope-1+2** (default) | 10–50 mL per 1,000 tokens | Li et al.: 10–50 mL per a ~500–2,500 token query. Midpoint reference = 1,000 tokens. Example: 1.2M tokens → 12–60 L. |
| **scope-1** (`--scope1`) | 0.26–0.32 mL per 1,000 tokens | Google 2025 Environmental Report (median Gemini prompt) and Sam Altman's June 2025 ChatGPT disclosure, on-site cooling only. |

This per-token rate is **ours**, not a number Li et al. state directly. The paper notes power-plant water can be up to 75% of a query's footprint, which is why scope-1-only badly understates the real number.

### Why not tokenwater's 100 mL / 1,000 tokens?

[tokenwater](https://github.com/Lesterhau/tokenwater) is prior art for the "show water, not just tokens" idea. Its single constant (100 mL per 1,000 tokens) does not cleanly reconcile with the Li et al. figures it cites: back-calculating from their 519 mL / 100-word example implies a rate roughly 40× higher than 100 mL / 1,000 tokens. That is why aqua-tokens uses a **labeled range** instead of one more viral constant.

## Data sources

- Li, P., Yang, J., Islam, M.A., Ren, S. "Making AI Less Thirsty: Uncovering and Addressing the Secret Water Footprint of AI Models." UC Riverside, 2023 / Commun. ACM 2024. https://arxiv.org/abs/2304.03271 — primary source. MIT-licensed code: https://github.com/Ren-Research/Making-AI-Less-Thirsty
- OpenAI (Sam Altman, June 2025) and Google 2025 Environmental Report — scope-1 on-site figures
- Luccioni, A.S. et al. (2023). "Power Hungry Processing." https://arxiv.org/abs/2311.16863 — supporting context on per-model inference energy variance
- tokenwater (Lesterhau/tokenwater) — prior art, see above

## v1 non-goals

No hosted dashboard, accounts, leaderboard, shareable public URL, browser extension, or 13-platform sweep. Two platforms parsed accurately beats many parsed shallow. `aqua-tokens share` (a local PNG/SVG card) is explicitly a stretch goal for after these numbers are trusted.

## Development

```bash
npm test
npm run build
```
