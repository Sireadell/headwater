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
      reviewer {
        id
        distinctAgentCount
        distinctAgentIds
      }
    }
  }
}`;

const WALLET_DETAIL_QUERY = `
query WalletDetail($ids: [String!]!) {
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
  const labelById = Object.fromEntries((walletDetail.WalletLabel || []).map((l) => [l.id, l]));

  const overlapFlagged = reviewers.some((r) => overlapById[r.id]);
  const circularFlagged = circular.length > 0;
  const fanOutFlagged = fanOut.length > 0;
  const anyFlagged = overlapFlagged || circularFlagged;

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
    const reviewerIds = agent ? agent.feedbacks.map((f) => f.reviewer.id) : [];
    const walletDetail = reviewerIds.length > 0
      ? await graphql(WALLET_DETAIL_QUERY, { ids: reviewerIds })
      : { CrossAgentOverlap: [], CircularFunding: [], FunderFanOut: [], WalletLabel: [] };
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
