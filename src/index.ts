import "dotenv/config";
import { Client as NotionClient } from "@notionhq/client";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
// Import ClaudeAgentSDK from telemetry — not directly from the SDK package.
// telemetry.ts spreads a mutable copy so manuallyInstrument() can patch query().
import { ClaudeAgentSDK, initTelemetry, shutdownTelemetry } from "./telemetry.js";

// ---------------------------------------------------------------------------
// v1 — Tide Payroll & Invoicing competitor watch
//
// Changes from v0:
//   - Watchlist loaded from Notion MCP database (not hardcoded)
//   - MEMORY.md read at start / appended at end for cross-run continuity
//   - Report format moved to .claude/skills/competitor-1-pager/SKILL.md
//   - Langfuse tracing via OpenInference instrumentation
// ---------------------------------------------------------------------------

// Reporting window: last 7 days, ending today.
const now = new Date();
const today = now.toISOString().slice(0, 10);
const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const REPORT_FILE = `./output/report-${today}.md`;
console.log(REPORT_FILE);
async function main() {
  console.log(process.env);
  const missing = ["ANTHROPIC_API_KEY", "NOTION_API_KEY", "NOTION_WATCHLIST_DB_ID"].filter(
    (k) => !process.env[k]
  );
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}\nCopy .env.example to .env and fill them in.`);
    process.exit(1);
  }

  // Fetch competitor watchlist from Notion before starting the agent.
  const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
  const dbResponse = await notion.databases.query({
    database_id: process.env.NOTION_WATCHLIST_DB_ID!,
  });

  const watchlistBlock = dbResponse.results
    .map((page: any, i: number) => {
      const name = page.properties.Name?.title?.[0]?.plain_text ?? "Unknown";
      const type = page.properties.Type?.select?.name ?? "unknown";
      const context = page.properties.Context?.rich_text?.[0]?.plain_text ?? "";
      return `${i + 1}. ${name} — ${type} — ${context}`;
    })
    .join("\n");

  console.log(`Watchlist: ${dbResponse.results.length} competitors loaded from Notion\n`);

  initTelemetry();

  await mkdir(resolve(process.cwd(), "output"), { recursive: true });

  // Load prior memory if it exists — gives the agent cross-run continuity.
  let priorMemory = "No prior runs recorded.";
  try {
    priorMemory = await readFile(resolve(process.cwd(), "MEMORY.md"), "utf8");
    console.log("[memory] Loaded MEMORY.md");
  } catch {
    console.log("[memory] No MEMORY.md found — this is the first run.");
  }

  console.log(`[${new Date().toISOString()}] Tide competitor watch — v1`);
  console.log(`Reporting window: ${weekAgo} → ${today}`);
  console.log(`Output file: ${REPORT_FILE}\n`);

  const systemPrompt = `You are a competitive intelligence analyst for the Payroll & Invoicing product area at Tide, a UK SMB business banking and financial platform.

Each week you produce a concise 1-page Markdown report covering what each of the watchlist competitors has shipped or published in the last 7 days that is relevant to SMB payroll, invoicing, business banking, or adjacent fintech topics.

# Watchlist (${dbResponse.results.length} competitors, loaded from Notion)
${watchlistBlock}

# Reporting window
${weekAgo} to ${today} (inclusive). Ignore anything older than ${weekAgo}.

# Memory — previous runs
${priorMemory}

Use the memory above to avoid re-reporting findings already captured in prior runs. If a competitor had notable activity last week, focus this week's search on NEW activity.

# Process
For each competitor on the watchlist, in order:
1. Use WebSearch to find recent activity. Useful query patterns:
   - "<company name> announces" / "<company name> launches" / "<company name> introduces"
   - "<company name> press release"
   - "<company name> blog"
   - "site:<their primary domain>" once you know it
2. Use WebFetch on the most promising 1–3 URLs to read the actual content. Confirm the date is within the reporting window.
3. Classify the item as either:
   (a) Product release / pricing / feature change
   (b) Thought leadership or leadership-authored content (blog, podcast, exec interview, conference talk, LinkedIn post)
   (c) Not relevant or outside the window — skip
4. Capture at most one finding per competitor with a source URL and the publication date. If you cannot find anything dated within the window, mark "No notable activity this period." Do not speculate.

When all competitors are processed:
1. Use the Write tool to update ./MEMORY.md. Append a new section at the end:
   ## ${today}
   - <CompetitorName>: <one-line finding, or "no activity">
   (one line per competitor; preserve all prior entries verbatim)
2. Invoke the competitor-1-pager skill for the exact report format and rules, then write the report to: ${REPORT_FILE}`;

  let assistantTextTurns = 0;
  let toolCalls = 0;

  for await (const message of ClaudeAgentSDK.query({
    prompt: "Begin the weekly competitor sweep now and produce the report as specified in your instructions.",
    options: {
      model: "claude-sonnet-4-6",
      systemPrompt,
      // bypassPermissions: this is an autonomous, headless run. Do NOT use in
      // interactive or untrusted environments.
      permissionMode: "bypassPermissions",
      allowedTools: ["WebSearch", "WebFetch", "Write", "Read"],
      skills: ["competitor-1-pager"],
      settingSources: ["project"],
      cwd: process.cwd(),
    },
  })) {
    if (message.type === "assistant") {
      const blocks = message.message.content as Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; name: string; input: unknown }
        | { type: string; [k: string]: unknown }
      >;
      for (const block of blocks) {
        if (block.type === "text" && typeof (block as any).text === "string" && (block as any).text.trim()) {
          assistantTextTurns++;
          console.log(`\n[assistant] ${(block as any).text}`);
        } else if (block.type === "tool_use") {
          toolCalls++;
          const preview = JSON.stringify((block as any).input).slice(0, 200);
          console.log(`[tool: ${(block as any).name}] ${preview}`);
        }
      }
    } else if (message.type === "result") {
      const result = message as any;
      console.log(`\n--- Run complete (${result.subtype ?? "ok"}) ---`);
      console.log(`Assistant text turns: ${assistantTextTurns}`);
      console.log(`Tool calls: ${toolCalls}`);
      if (result.usage) {
        console.log("Token usage:", result.usage);
      }
      if (typeof result.total_cost_usd === "number") {
        console.log(`Estimated cost: $${result.total_cost_usd.toFixed(4)}`);
      }
      if (typeof result.duration_ms === "number") {
        console.log(`Duration: ${(result.duration_ms / 1000).toFixed(1)}s`);
      }
    }
  }

  await shutdownTelemetry();
}

main().catch((err) => {
  console.error("Fatal error in agent run:", err);
  process.exit(1);
});
