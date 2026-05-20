/**
 * One-time setup script: creates the "Competitor Watchlist" Notion database
 * and seeds it with the 10 initial competitors.
 *
 * Prerequisites:
 *   1. Create a Notion integration at https://www.notion.so/my-integrations
 *      and copy the token to NOTION_API_KEY in your .env file.
 *   2. Create or open the Notion page where you want the database to live.
 *      Share it with your integration (... → Connections → your integration).
 *      Copy the page ID from its URL: notion.so/<page-id>
 *      Set it as NOTION_PARENT_PAGE_ID in your .env file.
 *   3. Run: npx tsx scripts/setup-notion.ts
 *   4. Copy the printed NOTION_WATCHLIST_DB_ID value into your .env file.
 */
import "dotenv/config";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const COMPETITORS = [
  { name: "Qonto",            type: "direct",   context: "EU SMB business banking" },
  { name: "N26",              type: "direct",   context: "EU neobank with business accounts" },
  { name: "Revolut Business", type: "direct",   context: "Multi-currency business banking" },
  { name: "Monzo",            type: "direct",   context: "UK neobank with business accounts" },
  { name: "ICICI Bank",       type: "direct",   context: "India SMB banking" },
  { name: "Gusto",            type: "indirect", context: "US SMB payroll platform" },
  { name: "FreeAgent",        type: "indirect", context: "UK SMB accounting (owned by NatWest)" },
  { name: "QuickBooks",       type: "indirect", context: "Global SMB accounting and payroll" },
  { name: "Xero",             type: "indirect", context: "Global SMB accounting" },
  { name: "Rippling",         type: "indirect", context: "Global HR, payroll, and finance" },
] as const;

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error("NOTION_API_KEY is not set in .env");
    process.exit(1);
  }
  if (!process.env.NOTION_PARENT_PAGE_ID) {
    console.error(
      "NOTION_PARENT_PAGE_ID is not set in .env\n" +
      "Open Notion, navigate to the page where you want the database, " +
      "copy the page ID from the URL, and add it to .env."
    );
    process.exit(1);
  }

  console.log("Creating Competitor Watchlist database in Notion…");

  const db = await notion.databases.create({
    parent: { type: "page_id", page_id: process.env.NOTION_PARENT_PAGE_ID },
    title: [{ type: "text", text: { content: "Competitor Watchlist" } }],
    properties: {
      Name: { title: {} },
      Type: {
        select: {
          options: [
            { name: "direct",   color: "red"  },
            { name: "indirect", color: "blue" },
          ],
        },
      },
      Context: { rich_text: {} },
    },
  });

  console.log(`Database created (${db.id}). Seeding competitors…`);

  for (const c of COMPETITORS) {
    await notion.pages.create({
      parent: { database_id: db.id },
      properties: {
        Name:    { title:     [{ text: { content: c.name    } }] },
        Type:    { select:    { name: c.type } },
        Context: { rich_text: [{ text: { content: c.context } }] },
      },
    });
    console.log(`  ✓ ${c.name}`);
  }

  console.log(`
Done! Add this to your .env file:

NOTION_WATCHLIST_DB_ID=${db.id}

Then remove NOTION_PARENT_PAGE_ID (it is only needed for this setup step).
`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
