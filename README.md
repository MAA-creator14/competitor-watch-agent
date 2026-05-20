# Tide Payroll & Invoicing — Competitor Watch Agent (v0)

A minimal Claude Agent SDK script that produces a weekly 1-page Markdown report on competitor releases and thought leadership in the SMB payroll, invoicing, and business-banking space.

This is **v0**: hardcoded watchlist, built-in web tools, single run, output to a local file. The plan for v1 (Notion MCP watchlist, MEMORY.md, Skill template, Langfuse traces, GitHub Actions cron) is at the bottom.

## What v0 does

On each run, the agent:

1. Walks the 10-competitor watchlist hardcoded in `src/index.ts`.
2. For each one, uses `WebSearch` to find activity in the last 7 days, then `WebFetch` on the most promising pages.
3. Classifies each item as a product release / pricing change, thought leadership, or not relevant.
4. Writes a 1-pager to `output/report-YYYY-MM-DD.md` covering the executive summary, per-competitor findings, implications for Tide, and sources.

## Watchlist (v0)

Direct: Qonto, N26, Revolut Business, Monzo, ICICI Bank.
Indirect: Gusto, FreeAgent, QuickBooks, Xero, Rippling.

To add or remove a competitor in v0, edit the `COMPETITORS` array in `src/index.ts`. In v1 this list will come from a Notion database so you can edit it without touching code.

## Setup

```
cp .env.example .env
# then put your Anthropic API key in .env

npm install
```

Get an Anthropic API key from the [Claude Console](https://platform.claude.com/settings/keys).

## Run

```
npm start
```

This runs `tsx src/index.ts`. You'll see:

- A header with the reporting window and output path
- Each tool call as it happens (`[tool: WebSearch] ...`, `[tool: WebFetch] ...`, `[tool: Write] ...`)
- A summary at the end with assistant turns, tool calls, token usage, cost, and duration

The final report lands in `output/report-YYYY-MM-DD.md`.

## Configuration notes

- **Model** — set to `claude-sonnet-4-6` in `src/index.ts`. Switch to `claude-opus-4-6` for higher-quality synthesis or `claude-haiku-4-5-20251001` for lower cost while iterating.
- **`permissionMode: "bypassPermissions"`** — this is an autonomous, headless run. Don't use this mode in an interactive context or against an untrusted environment.
- **`allowedTools`** — `WebSearch`, `WebFetch`, `Write`, `Read`. Deliberately *not* including `Bash` or `Edit` since v0 doesn't need them.
- **Reporting window** — last 7 days. Adjust the `weekAgo` calculation in `src/index.ts` if you want a different cadence.

## File layout

```
Tide Competitor Agent/
├── package.json
├── tsconfig.json
├── .env.example          # copy to .env and fill in
├── .gitignore
├── README.md
├── src/
│   └── index.ts          # watchlist + system prompt + run loop
└── output/               # generated reports, gitignored
```

## What's planned for v1

In the order it should be built, with the harness feature each step exercises:

1. **Notion MCP watchlist.** Replace the hardcoded `COMPETITORS` array with a `notion-fetch` against a "Competitor Watchlist" database. Editing the watchlist becomes a Notion edit, not a code change. (Exercises MCP server config.)
2. **`MEMORY.md`.** A file the agent reads at start (so it doesn't repeat last week's findings) and updates at end (so next week knows what was covered). (Exercises file-based persistence and the agent's own bookkeeping.)
3. **Skill for the 1-pager template.** Move the report format out of the system prompt and into a Skill in `.claude/skills/competitor-1-pager/`. (Exercises Agent Skills.)
4. **Langfuse traces and cost.** Wire `@arizeai/openinference-instrumentation-claude-agent-sdk` + `@langfuse/otel` per [the Langfuse cookbook](https://langfuse.com/integrations/frameworks/claude-agent-sdk-js). Every `query()` call is auto-traced with token counts, tool-call breakdown, and computed cost.
5. **GitHub Actions cron.** Move the trigger off your laptop. One YAML file in the repo, runs weekly, posts the report to email or Slack on completion.

## Known unknowns to verify against the latest SDK

The SDK is iterating quickly. Two things to sanity-check the first time you run it:

- `permissionMode: "bypassPermissions"` actually grants the web tools (see [issue #19](https://github.com/anthropics/claude-agent-sdk-typescript/issues/19) and [issue #14279](https://github.com/anthropics/claude-code/issues/14279) for known prior bugs in this area). If you see permission prompts, switch temporarily to `acceptEdits` and add explicit `allowedTools` overrides.
- The model id `claude-sonnet-4-6` is still resolvable. If you get an "unknown model" error, drop to `claude-sonnet-4-5` or check the [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview).
