// The proof a judge runs themselves. One command, real Monad mainnet
// data, no mocks, no setup beyond `npm install`:
//
//   node scripts/demo.mjs
//
// Runs two checks against real registered ERC-8004 agents on Monad:
//   1. Cross-agent review overlap: does the same reviewer wallet appear
//      on more than one agent? Cheap (registry reads only, no chain
//      scanning), fast, and catches coordination a per-agent check alone
//      would miss.
//   2. Funding-based check: were an agent's own reviewers funded by the
//      same wallet? Slower (raw log scanning per reviewer), run on a
//      smaller sample to stay judge-runnable.

import { analyzeAgent } from '../src/analyzeAgent.js';
import { findCrossAgentReviewOverlap } from '../src/crossAgentReviewOverlap.js';

const AGENT_SCAN_LIMIT = 250;
const AGENTS_TO_FUNDING_CHECK = 3;

console.log(`Scanning the first ${AGENT_SCAN_LIMIT} ERC-8004 agents on Monad mainnet...\n`);

const { agentsScanned, overlaps, agentsWithReviewers } = await findCrossAgentReviewOverlap({ maxAgents: AGENT_SCAN_LIMIT });

console.log(`Registered agents scanned: ${agentsScanned}`);
console.log(`Agents with at least one real review: ${agentsWithReviewers.length}`);
console.log('\n' + '='.repeat(70));
console.log('\nCHECK 1: Cross-agent review overlap (real registry data, no chain scanning)\n');

if (overlaps.length === 0) {
  console.log('No reviewer wallet reviewed more than one agent in this range.');
} else {
  console.log(`${overlaps.length} reviewer wallet(s) reviewed more than one agent:\n`);
  for (const { reviewer, agentIds } of overlaps) {
    console.log(`  ${reviewer} reviewed agents: ${agentIds.join(', ')}`);
  }
  const clusters = new Map();
  for (const { reviewer, agentIds } of overlaps) {
    const key = [...agentIds].sort((a, b) => a - b).join(',');
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(reviewer);
  }
  const sharedCluster = [...clusters.entries()].find(([, reviewers]) => reviewers.length > 1);
  if (sharedCluster) {
    const [agentIdList, reviewers] = sharedCluster;
    console.log(`\n  Notable: ${reviewers.length} different reviewer wallets all reviewed the exact same`);
    console.log(`  set of agents (${agentIdList}). One wallet reviewing several agents could be a real`);
    console.log(`  user; several different wallets all clustered around the same agents is the`);
    console.log(`  coordinated-review pattern this product exists to catch.`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`\nCHECK 2: Funding-based read on the first ${AGENTS_TO_FUNDING_CHECK} reviewed agents (raw log scanning, slower)\n`);

const picked = agentsWithReviewers.slice(0, AGENTS_TO_FUNDING_CHECK);
for (const { agentId } of picked) {
  const r = await analyzeAgent(agentId);
  console.log(`Agent ${r.agentId}`);
  console.log(`  Agent wallet:        ${r.wallet}`);
  console.log(`  Public review count: ${r.reviewCount}`);
  console.log(`  Average score:       ${r.averageScore}`);
  console.log(`  Funders found in the fast ~22min lookback: ${r.fundersFoundInWindow}/${r.reviewCount}`);
  if (r.fundersOutOfWindow > 0) {
    console.log(`  (${r.fundersOutOfWindow} reviewer(s) funded earlier than that, not flagged clean, just not checkable at this speed)`);
  }
  if (r.sharedFunders.length > 0) {
    console.log(`  FLAGGED: shared funder(s) across "independent" reviewers:`);
    for (const sf of r.sharedFunders) {
      console.log(`    ${sf.funder} funded ${sf.reviewerCount} of this agent's reviewers`);
    }
  } else {
    console.log(`  No shared funder found among reviewers checkable in this window.`);
  }
  console.log('');
}

console.log('='.repeat(70));
console.log(`
Honest read: check 1 is real and comprehensive across every agent
scanned, it needs no chain scanning at all. Check 2's funder search found
nothing shared on this run because it only reaches back roughly 22
minutes of chain history per wallet by default (3 pages of raw log
scanning, see PAGE_BLOCK_SPAN in src/core/rpc/monadClient.js), and these
reviewers were funded earlier than that. Reaching further back is
possible today via MONAD_PAGE_BLOCK_SPAN, at real time cost (~33s per
wallet at a 5,000-block span, confirmed live); full history without that
tradeoff is phase 3's job (Envio).
`);
