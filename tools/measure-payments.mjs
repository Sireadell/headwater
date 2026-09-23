// Recomputes, from the live endpoint alone, the two numbers the payment claim
// rests on. Run it and the figures on the methodology page either come back or
// they do not.
//
//   node tools/measure-payments.mjs
//
// Why this exists: "raters who paid the agent are more trustworthy" is the
// filter everyone reaches for, including us, and it is worth almost nothing on
// this chain. Saying so is only credible if the reader can rebuild the number
// without trusting us. Published 2026-09-23:
//
//   7,771  (agent, rater) relationships across all 84 rated agents
//   7,670  where the rater sent native MON to that agent's owner
//       3  where the payment arrived BEFORE the rating
//       2  distinct wallets behind those 3
//
// ProofLines (github.com/ColinkaMir/monad-agent-trust) built the same filter
// independently, from their own RPC scan rather than from this index, and
// publish the same 3 pairs from the same 2 wallets. Two pipelines, one answer.
//
// The chain keeps moving, so a later run may differ. A run that differs in the
// first two numbers by a few is the registry growing. A run where the third
// number jumps is a finding, and the methodology page is then wrong and should
// be corrected rather than defended.
import { graphql, ratersOf } from "./lib.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(readFileSync(join(root, "docs/api/index.json"), "utf8"));
const ids = index.agents.map((a) => a.agentId);

const PAGE = 1000;

// The endpoint throttles a back-to-back walk of 84 agents and answers 429. A
// short pause between agents is cheaper than a retry storm and keeps a full
// run reproducible on a first attempt.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fundersOfOwner(owner) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const data = await graphql(
      `query F($w: String!, $o: Int!) {
         WalletFunder(where: { wallet: { _eq: $w } }, limit: ${PAGE}, offset: $o, order_by: { id: asc }) {
           funder
           firstFundedTimestamp
         }
       }`,
      { w: owner, o: offset },
    );
    const page = data.WalletFunder || [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

let pairs = 0;
let paid = 0;
const independentPairs = [];

for (const id of ids) {
  const agentData = await graphql(
    `query A($id: String!) { Agent(where: { id: { _eq: $id } }) { id owner } }`,
    { id },
  );
  const owner = agentData.Agent?.[0]?.owner?.toLowerCase();
  if (!owner) continue;

  const { raters, firstRatedAt } = await ratersOf(id);
  // Earliest payment from each payer to this owner.
  const paidAt = new Map();
  for (const row of await fundersOfOwner(owner)) {
    const f = (row.funder || "").toLowerCase();
    const prev = paidAt.get(f);
    if (prev === undefined || row.firstFundedTimestamp < prev) paidAt.set(f, row.firstFundedTimestamp);
  }
  // Who this owner paid, so an owner-funded rater is not counted as independent.
  const ownerFunded = new Set();
  for (let i = 0; i < raters.length; i += 500) {
    const batch = raters.slice(i, i + 500);
    const d = await graphql(
      `query O($o: String!, $w: [String!]!) {
         WalletFunder(where: { funder: { _eq: $o }, wallet: { _in: $w } }, limit: ${PAGE}) { wallet }
       }`,
      { o: owner, w: batch },
    );
    for (const r of d.WalletFunder || []) ownerFunded.add(r.wallet.toLowerCase());
  }

  pairs += raters.length;
  for (const rater of raters) {
    const p = paidAt.get(rater);
    if (p === undefined) continue;
    paid++;
    const ratedAt = firstRatedAt.get(rater);
    if (ratedAt !== undefined && p <= ratedAt && !ownerFunded.has(rater)) {
      independentPairs.push({ agentId: id, rater, paidAt: p, ratedAt });
    }
  }
  process.stdout.write(".");
  await sleep(600);
}

const wallets = new Set(independentPairs.map((p) => p.rater));
console.log("\n");
console.log(`agents rated                         ${ids.length}`);
console.log(`(agent, rater) relationships         ${pairs}`);
console.log(`rater sent native MON to the owner   ${paid}`);
console.log(`payment arrived BEFORE the rating,`);
console.log(`and the owner never funded the rater ${independentPairs.length}`);
console.log(`distinct wallets behind those        ${wallets.size}`);
console.log("");
for (const p of independentPairs) {
  console.log(`  agent ${p.agentId}  rater ${p.rater}  paid ${p.paidAt}  rated ${p.ratedAt}`);
}
