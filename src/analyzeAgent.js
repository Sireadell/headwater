// Phase 2 deliverable (BUILD_PLAN.md): pick real registered ERC-8004
// agents, produce a funding-based fraud read for each, side by side with
// their public review count.
//
// For each agent this pulls the real reviewer wallets from the
// Reputation Registry, then runs findDirectFunder (the funding-provenance
// signal, already wired to Monad in phase 1) against each reviewer
// wallet to see who funded them. A shared funder across reviewers of the
// same agent is exactly the pattern this product exists to catch: it
// means "independent" reviewers are not independent.
//
// Honest limit, disclosed not hidden: findDirectFunder is bounded to a
// lookback window (~50,000 blocks, ~4.2 hours) behind the current chain
// tip, see monadClient.js. A reviewer funded outside that window shows up
// as "no funder found in window", not "clean". Full-history funder
// lookup needs an indexer (Envio, phase 3), not per-request log scanning.

import { getAgentWallet, getReviewers, getReputationSummary, readAllFeedback } from './core/rpc/erc8004Registry.js';
import { findDirectFunder } from './core/signals/fundingRelationship.js';

/**
 * @param {number} agentId
 * @returns {Promise<object>} a funding-based read for one agent, or an explicit UNVALIDATED result if it has no reviewers yet
 */
export async function analyzeAgent(agentId) {
  const [wallet, reviewers] = await Promise.all([
    getAgentWallet(agentId),
    getReviewers(agentId),
  ]);

  if (reviewers.length === 0) {
    return {
      agentId,
      wallet,
      reviewCount: 0,
      status: 'UNVALIDATED',
      reason: 'no_reviewers_yet',
    };
  }

  const [summary, feedback] = await Promise.all([
    getReputationSummary(agentId, reviewers),
    readAllFeedback(agentId, reviewers),
  ]);

  const reviewerFunding = await Promise.all(
    reviewers.map(async (reviewer) => {
      const evidence = await findDirectFunder(reviewer, {});
      return { reviewer, funder: evidence?.asset?.from ?? null, evidence };
    })
  );

  const funderCounts = new Map();
  for (const { funder } of reviewerFunding) {
    if (!funder) continue;
    funderCounts.set(funder, (funderCounts.get(funder) ?? 0) + 1);
  }
  const sharedFunders = [...funderCounts.entries()].filter(([, count]) => count > 1);
  const fundersFoundInWindow = reviewerFunding.filter((r) => r.funder).length;

  return {
    agentId,
    wallet,
    reviewCount: Number(summary.count),
    averageScore: Number(summary.summaryValue),
    scoreDecimals: Number(summary.summaryValueDecimals),
    reviewerFunding,
    fundersFoundInWindow,
    fundersOutOfWindow: reviewers.length - fundersFoundInWindow,
    sharedFunders: sharedFunders.map(([funder, count]) => ({ funder, reviewerCount: count })),
    status: sharedFunders.length > 0 ? 'FLAGGED' : 'CLEAN_IN_WINDOW',
    tags: feedback.map((f) => `${f.tag1}${f.tag2 ? '/' + f.tag2 : ''}`),
  };
}
