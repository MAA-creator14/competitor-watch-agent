# Tide Competitor Agent — Build Summary

## What This Is

A weekly autonomous AI agent that sweeps 10 competitors for Tide's Payroll & Invoicing product area, writes a sourced 1-page Markdown report, and emails it every Monday via GitHub Actions.

---

## What Was Built

### v0 (starting point)
Single file `src/index.ts` — hardcoded competitor list, no memory, no tracing, runs locally only.

### v1 (this session)

| Feature | Implementation |
|---------|---------------|
| **Notion watchlist** | `@notionhq/client` fetches the competitor DB at startup; `npm run setup-notion` created + seeded it |
| **MEMORY.md** | Read at startup, injected into system prompt; agent appends a dated entry per run |
| **Report skill** | `.claude/skills/competitor-1-pager/SKILL.md` — format + rules extracted from system prompt |
| **Langfuse tracing** | `src/telemetry.ts` using `@langfuse/otel` + OpenInference; graceful no-op if keys absent |
| **GitHub Actions** | `.github/workflows/competitor-watch.yml` — Monday 08:00 UTC cron + SendGrid email + artifact upload |

---

## Key Files

```
src/
  index.ts          — main agent entrypoint
  telemetry.ts      — Langfuse/OpenTelemetry setup
scripts/
  setup-notion.ts   — one-time DB creation + seeding (already run)
.claude/skills/
  competitor-1-pager/SKILL.md   — report format template
  langfuse/SKILL.md             — Langfuse skill (installed from github.com/langfuse/skills)
.github/workflows/
  competitor-watch.yml          — weekly cron trigger
.env                            — all secrets (gitignored)
MEMORY.md                       — cross-run memory (gitignored)
output/                         — generated reports (gitignored)
```

---

## Notion Setup

- Database ID: `361f8a0a-1f16-813a-a470-ed4858d241b2`
- 10 competitors seeded: Qonto, N26, Revolut Business, Monzo, ICICI Bank, Gusto, FreeAgent, QuickBooks, Xero, Rippling
- To add/remove competitors: edit the Notion database directly — no code change needed

---

## Environment Variables (all in `.env`)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API |
| `NOTION_API_KEY` | Notion integration token |
| `NOTION_WATCHLIST_DB_ID` | Competitor database ID |
| `LANGFUSE_PUBLIC_KEY` | Langfuse tracing |
| `LANGFUSE_SECRET_KEY` | Langfuse tracing |
| `LANGFUSE_BASE_URL` | `https://cloud.langfuse.com` |

GitHub Actions also needs: `SENDGRID_API_KEY`, `SENDGRID_TO`, `SENDGRID_FROM`

---

## Non-Obvious Issues Solved

**`@notionhq/mcp` doesn't exist** — the Notion MCP server package name was wrong. Fixed by fetching the competitor list in TypeScript at startup using `@notionhq/client` instead.

**ESM read-only module namespace** — `manuallyInstrument()` from OpenInference can't patch an ESM module namespace directly (read-only). Fixed per Langfuse docs: spread a mutable shallow copy (`{ ...ClaudeAgentSDKModule }`) and instrument that. `index.ts` imports `query` via `ClaudeAgentSDK.query()` from `telemetry.ts`, not directly from the SDK.

---

## Running Locally

```bash
npm start          # run the agent
npm run setup-notion  # one-time: create/seed Notion DB (already done)
```

---

## Costs (observed)

| Run | Cost | Duration |
|-----|------|----------|
| v0 initial | $1.33 | 9.4 min |
| v1 (no tracing) | $0.19 | 0.8 min (Notion MCP failed, stopped early) |
| v1 (working) | $1.25 | 8.9 min |
| v1 (with Langfuse) | $1.25 | 8.9 min |
