// Queries the live headwater-indexer GraphQL endpoint. Field/type names
// below match schema.graphql as authored (PascalCase entity names,
// Hasura's standard `_by_pk` convention for a single-row lookup by id).
// Verified 2026-09-21 directly against the live endpoint: Agent_by_pk
// requires a chainId argument alongside id (Hasura's full primary key on
// this multichain-shaped schema), even though only one chain -- Monad,
// 143 -- is actually indexed. The where-filtered queries below don't need
// it since they're not pk lookups.
const AGENT_QUERY = `
query AgentLookup($agentId: String!) {
  Agent_by_pk(id: $agentId, chainId: 143) {
    id
    owner
    agentURI
    registeredAtBlock
    registeredAtTimestamp
    feedbacks {
      id
      timestamp
      reviewer {
        id
        distinctAgentCount
        distinctAgentIds
      }
    }
  }
}`;

// SharedFunder stores its funded reviewers as an array, and Hasura's
// array `_contains` means "contains all of these", not "any of these".
// Matching any one of an agent's reviewers therefore needs a separate
// clause per reviewer, which cannot be expressed with a single variable.
// The ids are hex addresses straight from our own indexer, but they are
// re-validated here anyway before being written into the query text,
// since interpolating unvalidated input into a query is how injection
// happens. Anything that is not a plain 0x-prefixed address is dropped.
function sharedFunderClause(ids) {
  const safe = ids.filter((id) => /^0x[0-9a-f]{40}$/i.test(id));
  if (safe.length === 0) return "";
  const anyOf = safe.map((id) => `{ fundedReviewers: { _contains: ["${id}"] } }`).join(", ");
  return `
  SharedFunder(where: { thresholdMet: { _eq: true }, _or: [${anyOf}] }) {
    id
    funder
    fundedReviewers
    fundedReviewerCount
  }`;
}

const walletDetailQuery = (ids) => `
query WalletDetail($ids: [String!]!, $agentId: String!) {${sharedFunderClause(ids)}
  CrossAgentOverlap(where: { id: { _in: $ids } }) {
    id
    agentIds
    agentCount
  }
  CircularFunding(where: { _or: [{ walletA: { _in: $ids } }, { walletB: { _in: $ids } }] }) {
    id
    walletA
    walletB
  }
  FunderFanOut(where: { funder: { _in: $ids }, thresholdMet: { _eq: true } }) {
    id
    funder
    recipientCount
    spanSeconds
  }
  WalletBirth(where: { id: { _in: $ids }, foundActivity: { _eq: true } }) {
    id
    wallet
    firstSeenBlock
    firstSeenTimestamp
  }
  ReviewCadence(where: { agent_id: { _eq: $agentId }, automationSuspected: { _eq: true } }) {
    id
    reviewer_id
    reviewCount
    intervalCount
    meanIntervalSeconds
    minIntervalSeconds
    maxIntervalSeconds
    coefficientOfVariation
  }
  WalletLabel(where: { id: { _in: $ids } }) {
    id
    nansen_label
    nansen_category
    nansen_risk_score
  }
}`;

async function graphql(query, variables) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

function shortAddr(addr) {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function renderOffline() {
  document.getElementById("results").innerHTML = `
    <div class="empty-state">
      No live endpoint configured yet. Set <code>GRAPHQL_ENDPOINT</code> in
      <code>config.js</code> once the Envio Cloud deployment is confirmed
      live, then reload this page.
    </div>`;
}

function renderLoading() {
  document.getElementById("results").innerHTML = `<div class="loading-state">Querying live Monad data...</div>`;
}

function renderError(message) {
  document.getElementById("results").innerHTML = `<div class="error-state">Query failed: ${message}</div>`;
}

function renderAgent(agentId, agent, walletDetail) {
  if (!agent) {
    document.getElementById("results").innerHTML = `<div class="empty-state">No agent found with id ${agentId}.</div>`;
    return;
  }

  // A wallet can leave many separate feedback entries on the same agent
  // (repeat reviews, revoke-and-resubmit, etc), so agent.feedbacks.length
  // is a feedback-entry count, not a reviewer count. Dedupe by wallet id
  // for anything that claims to describe "how many reviewers."
  const reviewers = Array.from(
    new Map(agent.feedbacks.map((f) => [f.reviewer.id, f.reviewer])).values(),
  );
  const overlapById = Object.fromEntries((walletDetail.CrossAgentOverlap || []).map((o) => [o.id, o]));
  const circular = walletDetail.CircularFunding || [];
  const fanOut = walletDetail.FunderFanOut || [];
  const cadence = walletDetail.ReviewCadence || [];
  const sharedFunders = walletDetail.SharedFunder || [];
  const births = walletDetail.WalletBirth || [];
  const labelById = Object.fromEntries((walletDetail.WalletLabel || []).map((l) => [l.id, l]));

  const overlapFlagged = reviewers.some((r) => overlapById[r.id]);
  const circularFlagged = circular.length > 0;
  const fanOutFlagged = fanOut.length > 0;
  // Birth clustering is decided here rather than in the indexer, because
  // it is a property of THIS agent's reviewer set, not of any wallet on
  // its own: the same wallet can sit in a tight cluster for one agent and
  // a loose spread for another.
  //
  // Needs at least three wallets. Two wallets created near each other is
  // a coincidence that will happen constantly across thousands of
  // reviewers; three or more inside a single day is the batch-provisioning
  // shape worth surfacing.
  const BIRTH_CLUSTER_WINDOW_SECONDS = 24 * 60 * 60;
  const MIN_BIRTH_CLUSTER_WALLETS = 3;

  const birthTimes = births
    .map((b) => b.firstSeenTimestamp)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  // Largest group of birth times falling inside one window, found by
  // sliding over the sorted list.
  let birthCluster = { size: 0, spanSeconds: 0, earliest: 0, latest: 0 };
  for (let i = 0; i < birthTimes.length; i++) {
    let j = i;
    while (j + 1 < birthTimes.length && birthTimes[j + 1] - birthTimes[i] <= BIRTH_CLUSTER_WINDOW_SECONDS) {
      j++;
    }
    const size = j - i + 1;
    if (size > birthCluster.size) {
      birthCluster = {
        size,
        spanSeconds: birthTimes[j] - birthTimes[i],
        earliest: birthTimes[i],
        latest: birthTimes[j],
      };
    }
  }
  const birthClusterFlagged = birthCluster.size >= MIN_BIRTH_CLUSTER_WALLETS;

  // How soon after a wallet first existed did it start reviewing this
  // agent. A wallet created and used within minutes was made for the job.
  const firstReviewByWallet = {};
  for (const f of agent.feedbacks) {
    const w = f.reviewer.id;
    if (firstReviewByWallet[w] === undefined || f.timestamp < firstReviewByWallet[w]) {
      firstReviewByWallet[w] = f.timestamp;
    }
  }
  const quickStarts = births
    .map((b) => ({ wallet: b.wallet, gap: (firstReviewByWallet[b.id] ?? 0) - b.firstSeenTimestamp }))
    .filter((x) => x.gap >= 0 && x.gap <= 3600)
    .sort((a, b) => a.gap - b.gap);

  const cadenceFlagged = cadence.length > 0;
  const sharedFunderFlagged = sharedFunders.length > 0;
  const anyFlagged =
    overlapFlagged || circularFlagged || cadenceFlagged || sharedFunderFlagged || birthClusterFlagged;

  const humanDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
    return `${(seconds / 86400).toFixed(1)} days`;
  };

  const overlappingReviewers = reviewers.filter((r) => overlapById[r.id]);

  const signals = [
    {
      title: "Cross-agent review overlap",
      triggered: overlapFlagged,
      desc: overlapFlagged
        ? `${overlappingReviewers.length} distinct reviewer wallet(s) on this agent also reviewed other agents: ${overlappingReviewers.map((r) => overlapById[r.id].agentIds.join(", ")).join(" / ")}.`
        : "No reviewer on this agent has reviewed any other agent, based on full registry history.",
    },
    {
      title: "Circular funding",
      triggered: circularFlagged,
      badge: circularFlagged ? "TRIGGERED" : "CLEAR",
      desc: circularFlagged
        ? `${circular.length} wallet pair(s) among this agent's reviewers show funding flowing in both directions.`
        : "No reviewer wallet has independently sent AUSD back to a wallet that funded it, checked across the indexed funding history.",
    },
    {
      title: "Funder fan-out",
      triggered: fanOutFlagged,
      circumstantial: true,
      desc: fanOutFlagged
        ? `A funder connected to this agent's reviewers paid ${fanOut[0].recipientCount}+ distinct recipients. Exchange/payment-processor shaped; never sufficient alone to call something risky.`
        : "No connected funder shows exchange/payment-processor-shaped payout behavior.",
    },
    {
      title: "Wallets created together",
      triggered: birthClusterFlagged,
      desc: birthClusterFlagged
        ? `${birthCluster.size} of this agent's reviewer wallets first appeared on chain within ${humanDuration(birthCluster.spanSeconds)} of each other (${new Date(birthCluster.earliest * 1000).toUTCString().replace("GMT", "UTC")}).${
            quickStarts.length > 0
              ? ` ${quickStarts.length} of them began reviewing within an hour of existing at all, the soonest after ${humanDuration(quickStarts[0].gap)}.`
              : ""
          } Independent reviewers have no reason to share a creation date.`
        : births.length > 0
          ? `This agent's reviewer wallets were created at unrelated times, so there is no sign of batch provisioning.`
          : "No wallet creation dates have been resolved for this agent's reviewers yet.",
    },
    {
      title: "Shared funding source",
      triggered: sharedFunderFlagged,
      desc: sharedFunderFlagged
        ? `${sharedFunders.length} wallet(s) bankrolled more than one reviewer of this agent. ${sharedFunders
            .map((f) => `${shortAddr(f.funder)} funded ${f.fundedReviewerCount} reviewers`)
            .join("; ")}. Funders that pay out at exchange scale are excluded, so this is not simply a busy wallet.`
        : "No single wallet is known to have funded more than one of this agent's reviewers.",
    },
    {
      title: "Automated review timing",
      triggered: cadenceFlagged,
      desc: cadenceFlagged
        ? `${cadence.length} reviewer wallet(s) worked through this agent on a near-fixed clock. ${cadence
            .map(
              (c) =>
                `${shortAddr(c.reviewer_id)} left ${c.reviewCount} reviews at ${c.minIntervalSeconds}-${c.maxIntervalSeconds}s intervals (average ${Math.round(Number(c.meanIntervalSeconds))}s, variation ${Number(c.coefficientOfVariation).toFixed(2)})`,
            )
            .join("; ")}. Human review timing is ragged and scores well above 1.00; a scripted loop scores near zero. Measured per agent, so a burst here is not diluted by the same wallet's activity elsewhere.`
        : "No reviewer on this agent posts reviews at machine-like regular intervals.",
    },
    {
      // Deliberately reports itself as inactive rather than as a clean
      // result. The handler's Nansen call targets an endpoint that returns
      // 404 and no API key is configured, so the WalletLabel table is empty
      // chain-wide. Rendering that emptiness as "no wallet matched a known
      // exchange" would read as a completed check that passed, which is the
      // opposite of what happened: the check never ran.
      title: "Wallet reputation labels",
      triggered: false,
      inactive: true,
      desc: "Not active. This check is wired up but has no working data source, so no wallet on this agent has actually been screened against exchange, market-maker or institutional labels. Treated as unknown, not as clean.",
    },
  ];

  document.getElementById("results").innerHTML = `
    <div class="lookup-body">
      <div class="agent-panel">
        <div class="info-card">
          <div class="info-card-title">Agent ${agentId}</div>
          <div class="info-row">
            <div>
              <div class="info-item-label">Owner wallet</div>
              <div class="info-item-value mono">${shortAddr(agent.owner)}</div>
            </div>
            <div>
              <div class="info-item-label">Registered at block</div>
              <div class="info-item-value mono">${agent.registeredAtBlock.toLocaleString()}</div>
            </div>
            <div>
              <div class="info-item-label">Distinct reviewer wallets</div>
              <div class="info-item-value mono">${reviewers.length}${agent.feedbacks.length !== reviewers.length ? ` (${agent.feedbacks.length} feedback entries)` : ""}</div>
            </div>
            <div>
              <div class="info-item-label">Feedback entries</div>
              <div class="info-item-value mono">${agent.feedbacks.length}</div>
            </div>
          </div>
        </div>
        <div class="verdict-card ${anyFlagged ? "verdict-flagged" : "verdict-clean"}">
          <div class="verdict-head">
            <div class="verdict-dot ${anyFlagged ? "dot-red" : "dot-green"}"></div>
            <span class="verdict-label mono ${anyFlagged ? "label-red" : "label-green"}">OVERALL: ${anyFlagged ? "FLAGGED" : "CLEAR"}</span>
          </div>
          <p class="verdict-body">${anyFlagged ? "One or more signals triggered. See breakdown for what was and was not established." : "No signal triggered on this agent's reviewers, based on full indexed history."}</p>
        </div>
      </div>
      <div style="flex-grow:1;">
        <div class="signals-title disp">Signal breakdown</div>
        <div class="signals-list">
          ${signals.map((s) => `
            <div class="signal-row">
              <span class="badge ${s.inactive ? "badge-mut" : s.triggered ? (s.circumstantial ? "badge-amber" : "badge-red") : "badge-mut"} mono">${s.inactive ? "NOT ACTIVE" : s.triggered ? (s.circumstantial ? "CIRCUMSTANTIAL" : "TRIGGERED") : "CLEAR"}</span>
              <div>
                <div class="signal-title">${s.title}</div>
                <div class="signal-desc">${s.desc}</div>
              </div>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
}

async function checkAgent() {
  const agentId = document.getElementById("agentId").value.trim();
  if (!agentId) return;

  if (!GRAPHQL_ENDPOINT) {
    renderOffline();
    return;
  }

  renderLoading();
  try {
    const agentData = await graphql(AGENT_QUERY, { agentId });
    const agent = agentData.Agent_by_pk;
    // Deduped: an agent's feedback list repeats a wallet once per entry,
    // and one wallet already has 19 entries on a single agent, so the raw
    // list would send the same address to the query many times over.
    const reviewerIds = agent
      ? Array.from(new Set(agent.feedbacks.map((f) => f.reviewer.id)))
      : [];
    const walletDetail = reviewerIds.length > 0
      ? await graphql(walletDetailQuery(reviewerIds), { ids: reviewerIds, agentId })
      : { CrossAgentOverlap: [], CircularFunding: [], FunderFanOut: [], ReviewCadence: [], SharedFunder: [], WalletLabel: [] };
    renderAgent(agentId, agent, walletDetail);
  } catch (err) {
    renderError(err.message);
  }
}

document.getElementById("checkBtn").addEventListener("click", checkAgent);
document.getElementById("agentId").addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkAgent();
});

if (!GRAPHQL_ENDPOINT) {
  renderOffline();
} else {
  checkAgent();
}
