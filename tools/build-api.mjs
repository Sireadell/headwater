// Generates the static JSON API under docs/api/.
//
// The site is hosted on GitHub Pages, which serves files and runs nothing, so
// there is no server here to answer a request. Pre-computing every answer and
// publishing it as files gives callers a real HTTP endpoint with no
// infrastructure, no key and no rate limit, at the cost of being as fresh as
// the last build. The MCP server in mcp/ answers live for anything that needs
// current state, and both read the same rules out of docs/provenance.js.
//
// Only rated agents get a file. There are 10,254 registered agents and 84 have
// ever been rated, so publishing the other 10,170 would mean ten thousand
// identical "no evidence" documents. index.json says plainly that an id with
// no file has never been rated, which is a real answer rather than a 404 left
// to interpretation.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { graphql, checkAgent, ENDPOINT } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/api");
const agentsDir = join(outDir, "agents");

const PAGE = 1000;

async function ratedAgentIds() {
  const counts = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const data = await graphql(
      `query All($offset: Int!) {
         Feedback(limit: ${PAGE}, offset: $offset, order_by: { id: asc }) { agent_id }
       }`,
      { offset },
    );
    const rows = data.Feedback || [];
    for (const r of rows) counts.set(r.agent_id, (counts.get(r.agent_id) ?? 0) + 1);
    if (rows.length < PAGE) break;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

async function totalAgents() {
  // No aggregate is exposed on this endpoint, so the count is walked. It is
  // published in index.json because "84 of how many" is the whole point.
  let total = 0;
  for (let offset = 0; ; offset += PAGE) {
    const data = await graphql(
      `query Ids($offset: Int!) { Agent(limit: ${PAGE}, offset: $offset, order_by: { id: asc }) { id } }`,
      { offset },
    );
    const rows = data.Agent || [];
    total += rows.length;
    if (rows.length < PAGE) break;
  }
  return total;
}

const main = async () => {
  rmSync(agentsDir, { recursive: true, force: true });
  mkdirSync(agentsDir, { recursive: true });

  const ids = await ratedAgentIds();
  const registered = await totalAgents();
  console.log(`${registered} agents registered, ${ids.length} ever rated`);

  const summary = [];
  for (const id of ids) {
    const report = await checkAgent(id);
    if (!report) continue;
    writeFileSync(join(agentsDir, `${id}.json`), `${JSON.stringify(report, null, 2)}\n`);
    summary.push({
      agentId: report.agentId,
      verdict: report.verdict,
      distinctRaters: report.evidence.distinctRaters,
      feedbackCount: report.evidence.feedbackCount,
      ownerFunded: report.evidence.ownerFundedDirect + report.evidence.ownerFundedViaIntermediary,
    });
    console.log(`  ${id.padStart(6)}  ${report.verdict.padEnd(14)} ${report.evidence.distinctRaters} raters`);
  }

  const byVerdict = {};
  for (const s of summary) byVerdict[s.verdict] = (byVerdict[s.verdict] ?? 0) + 1;

  const index = {
    what:
      "Where each ERC-8004 agent's reputation on Monad actually came from. A verdict " +
      "describes the origin of the money behind an agent's raters. It is not a judgement " +
      "of anyone's intent, and a funded campaign can be entirely legitimate.",
    usage: {
      agent: "GET /headwater/api/agents/{agentId}.json",
      absent:
        "An agent id with no file here has never been rated. Treat that as the verdict " +
        "NO EVIDENCE, not as an error: it is the normal case on this chain.",
      live:
        "This is a static snapshot, as fresh as generatedAt below. For a live answer run " +
        "the MCP server at mcp/server.mjs, which applies the same rules against the " +
        "indexer directly.",
    },
    verdicts: {
      "NO EVIDENCE": "Never rated. Nothing to trust or distrust.",
      THIN: "Every rating came from a single address.",
      "SELF REVIEWED": "The owner's own wallet is among the raters.",
      "APP GENERATED": "Raters are application contracts recording outcomes, not people.",
      "OWNER FUNDED": "The agent's own owner paid for its raters, directly or via one hop.",
      "ROUND TRIP":
        "The owner paid its raters and the same wallets sent funds back to the owner after rating. " +
        "The money left the owner and returned to the owner.",
      "NO LINK FOUND": "No funding link found across two hops. Weaker evidence than a link.",
    },
    limits: {
      fundingHops: 2,
      fundingAsset: "native MON only",
      note:
        "Funding moved by an internal contract call does not appear in top-level " +
        "transactions, so absence of a link is weaker evidence than a link.",
    },
    counts: {
      agentsRegistered: registered,
      agentsEverRated: summary.length,
      byVerdict,
    },
    agents: summary,
    source: ENDPOINT,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`\nwrote ${summary.length} agent files and index.json`);
  console.log(byVerdict);
};

await main();
