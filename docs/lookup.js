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

// Each signal's query fragment, kept separate so the page can ask for
// only the ones the connected deployment actually has.
//
// Envio issues a new endpoint URL per deployment, and serving from one
// fixed address is a paid feature, so config.js can easily end up
// pointing at an older build than the code expects. Asking for an entity
// that build does not have fails the WHOLE query, taking working signals
// down with the missing one. Introspecting first and omitting what is
// absent means an older endpoint shows the signals it does support and
// says plainly which ones it predates.
const SIGNAL_FRAGMENTS = {
  CrossAgentOverlap: `
  CrossAgentOverlap(where: { id: { _in: $ids } }) {
    id
    agentIds
    agentCount
  }`,
  CircularFunding: `
  CircularFunding(where: { _or: [{ walletA: { _in: $ids } }, { walletB: { _in: $ids } }] }) {
    id
    walletA
    walletB
  }`,
  FunderFanOut: `
  FunderFanOut(where: { funder: { _in: $ids }, thresholdMet: { _eq: true } }) {
    id
    funder
    recipientCount
    spanSeconds
  }`,
  WalletBirth: `
  WalletBirth(where: { id: { _in: $ids }, foundActivity: { _eq: true } }) {
    id
    wallet
    firstSeenBlock
    firstSeenTimestamp
  }`,
  // Includes the agent's own owner alongside its reviewers, because the
  // sharpest version of this is an owner and its reviewers tracing back
  // to one payer.
  WalletFunder: `
  WalletFunder(where: { wallet: { _in: $walletsWithOwner } }) {
    id
    wallet
    funder
    firstFundedTimestamp
    valueRaw
    source
    isDust
  }`,
  // Needed to tell a coordinator from a faucet. One live Monad wallet has
  // funded nearly two thousand reviewers; from a single agent's handful of
  // wallets it is indistinguishable from an operator, so the global count
  // has to come from the indexer.
  FunderProfile: `
  FunderProfile(where: { distributorShaped: { _eq: true } }, limit: 500) {
    id
    funder
    distinctWalletsFunded
  }`,
  // What this agent's OWNER has paid for. The sharpest finding in the live
  // data was an owner funding the owners of five other agents, none of
  // whom ever reviewed anything, so it only becomes visible by asking
  // about the owner's outbound edges directly.
  "WalletFunder::ownerFunded": `
  ownerFunded: WalletFunder(where: { funder: { _eq: $owner }, isDust: { _eq: false } }, limit: 200) {
    wallet
    firstFundedTimestamp
    valueRaw
    source
  }`,
  ReviewCadence: `
  ReviewCadence(where: { agent_id: { _eq: $agentId }, automationSuspected: { _eq: true } }) {
    id
    reviewer_id
    reviewCount
    intervalCount
    meanIntervalSeconds
    minIntervalSeconds
    maxIntervalSeconds
    coefficientOfVariation
  }`,
};

const INTROSPECT_QUERY = `query { __schema { queryType { fields { name } } } }`;

// Which signal entities this endpoint knows about. Resolved once per page
// load and reused.
let availableEntities = null;

async function resolveAvailableEntities() {
  if (availableEntities !== null) return availableEntities;
  try {
    const data = await graphql(INTROSPECT_QUERY, {});
    availableEntities = new Set(data.__schema.queryType.fields.map((f) => f.name));
  } catch (err) {
    // If introspection is unavailable, assume the endpoint is current
    // rather than hiding every signal. A genuinely missing entity will
    // still surface as a query error, which is the old behaviour.
    availableEntities = null;
  }
  return availableEntities;
}

function hasEntity(name) {
  return availableEntities === null || availableEntities.has(name);
}

const walletDetailQuery = (ids) => `
query WalletDetail($ids: [String!]!, $agentId: String!, $walletsWithOwner: [String!]!, $owner: String!) {${hasEntity("SharedFunder") ? sharedFunderClause(ids) : ""}${Object.entries(
  SIGNAL_FRAGMENTS,
)
  // A key may be "Entity::alias" when one entity is queried twice under
  // different aliases; only the part before "::" is an entity name.
  .filter(([name]) => hasEntity(name.split("::")[0]))
  .map(([, fragment]) => fragment)
  .join("")}
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

function renderAgent(agentId, agent, walletDetail, provenance) {
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

  // Group wallets by who paid them. Dust is excluded from the verdict:
  // a gas top-up is not the same relationship as capitalising a wallet,
  // and conflating them was a live-caught mistake in an earlier project.
  const funderRows = walletDetail.WalletFunder || [];
  // Faucets and distributors pay thousands of unrelated wallets. Including
  // them would flag every agent on the chain, which reads as a working
  // signal while being meaningless.
  const distributors = new Set(
    (walletDetail.FunderProfile || []).map((p) => p.funder),
  );
  const walletsByFunder = {};
  for (const row of funderRows) {
    if (row.isDust) continue;
    if (distributors.has(row.funder)) continue;
    (walletsByFunder[row.funder] ||= new Set()).add(row.wallet);
  }
  const sharedOrigins = Object.entries(walletsByFunder)
    .map(([funder, wallets]) => ({ funder, wallets: Array.from(wallets) }))
    .filter((x) => x.wallets.length > 1)
    .sort((a, b) => b.wallets.length - a.wallets.length);
  const sharedOriginFlagged = sharedOrigins.length > 0;

  // Wallets this agent's owner paid that turned out to own agents of
  // their own. Excludes this agent, and excludes the owner paying itself.
  const ownerFundedAgents = (walletDetail.ownerFundedAgents || []).filter(
    (a) => a.id !== agentId && a.owner !== agent.owner,
  );
  const ownerFundedAgentsFlagged = ownerFundedAgents.length > 0;

  const cadenceFlagged = cadence.length > 0;
  const sharedFunderFlagged = sharedFunders.length > 0;
  const anyFlagged =
    overlapFlagged ||
    circularFlagged ||
    cadenceFlagged ||
    sharedFunderFlagged ||
    birthClusterFlagged ||
    (sharedOriginFlagged && hasEntity("FunderProfile")) ||
    ownerFundedAgentsFlagged;

  const humanDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
    return `${(seconds / 86400).toFixed(1)} days`;
  };

  const overlappingReviewers = reviewers.filter((r) => overlapById[r.id]);

  const signals = [
    {
      // Listed first because it is the strongest thing this tool can show:
      // a direct funding edge, not an inference from behaviour.
      title: "Owner funded other agents",
      triggered: ownerFundedAgentsFlagged,
      inactive: !hasEntity("WalletFunder"),
      desc: !hasEntity("WalletFunder")
        ? "Not available on the connected indexer build, which predates this check. Treated as unknown, not as clean."
        : ownerFundedAgentsFlagged
          ? `This agent's owner wallet paid for the wallets that own ${ownerFundedAgents.length} other agent${ownerFundedAgents.length === 1 ? "" : "s"}: ${ownerFundedAgents
              .map((a) => `agent ${a.id}`)
              .join(", ")}. Agents with different owner wallets look independent; a shared payer says they are not. This is a funding transaction on chain, not a pattern read from review behaviour.`
          : "This agent's owner has not been seen paying for any other agent's owner wallet.",
    },
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
      title: "Shared funding origin",
      // Without the global per-funder counts, a faucet that pays thousands
      // of unrelated wallets is indistinguishable from an operator that
      // paid these five. Reporting a flag in that state would mark every
      // agent on the chain as suspicious, so the check withholds a verdict
      // instead of guessing.
      triggered: sharedOriginFlagged && hasEntity("FunderProfile"),
      inactive: !hasEntity("WalletFunder") || !hasEntity("FunderProfile"),
      desc: !hasEntity("WalletFunder")
        ? "Not available on the connected indexer build, which predates this check. Treated as unknown, not as clean."
        : !hasEntity("FunderProfile")
          ? "Withheld. This indexer build cannot yet separate faucets from real funders, and one wallet on Monad has funded nearly two thousand reviewers. Reporting a result without that distinction would flag every agent on the chain."
          : sharedOriginFlagged
          ? `${sharedOrigins
              .map(
                (o) =>
                  `${shortAddr(o.funder)} paid ${o.wallets.length} of the wallets behind this agent (${o.wallets.map(shortAddr).join(", ")})`,
              )
              .join("; ")}. Wallets that appear to be separate parties but were capitalised by the same payer are not independent. Gas top-ups are excluded, as are faucets and distributors that pay thousands of unrelated wallets, so this reflects a specific funding relationship rather than everyone who has ever received tokens from the same tap.`
          : "This agent's owner and reviewer wallets were funded from unrelated sources, or only from shared faucets that pay the whole chain.",
    },
    {
      title: "Wallets created together",
      triggered: birthClusterFlagged,
      // A signal the connected deployment has never computed must not
      // render as CLEAR. An empty result and an absent check look
      // identical in the data and mean opposite things.
      inactive: !hasEntity("WalletBirth"),
      desc: !hasEntity("WalletBirth")
        ? "Not available on the connected indexer build, which predates this check. Treated as unknown, not as clean."
        : birthClusterFlagged
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
      inactive: !hasEntity("SharedFunder"),
      desc: !hasEntity("SharedFunder")
        ? "Not available on the connected indexer build, which predates this check. Treated as unknown, not as clean."
        : sharedFunderFlagged
        ? `${sharedFunders.length} wallet(s) bankrolled more than one reviewer of this agent. ${sharedFunders
            .map((f) => `${shortAddr(f.funder)} funded ${f.fundedReviewerCount} reviewers`)
            .join("; ")}. Funders that pay out at exchange scale are excluded, so this is not simply a busy wallet.`
        : "No single wallet is known to have funded more than one of this agent's reviewers.",
    },
    {
      title: "Automated review timing",
      triggered: cadenceFlagged,
      inactive: !hasEntity("ReviewCadence"),
      desc: !hasEntity("ReviewCadence")
        ? "Not available on the connected indexer build, which predates this check. Treated as unknown, not as clean."
        : cadenceFlagged
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

  // The provenance verdict leads, because it is the only part of this page
  // computed from money movement rather than from review behaviour, and it is
  // the part that survived being wrong. Everything below it is supporting
  // detail. It renders even when the trace failed, saying so, rather than
  // quietly leaving a gap that reads as a clean result.
  const prov = provenance
    ? `
    <div class="prov-card prov-${provenance.verdict.tone}">
      <div class="prov-head">
        <span class="badge badge-${provenance.verdict.tone} mono">${provenance.verdict.label}</span>
        <span class="prov-title">Where this agent's reputation came from</span>
      </div>
      <p class="prov-summary">${provenance.verdict.summary}</p>
      ${provenance.verdict.findings.length > 0 ? `<ul class="prov-findings">${provenance.verdict.findings.map((f) => `<li>${f}</li>`).join("")}</ul>` : ""}
      <p class="prov-basis mono">Traced ${provenance.funding.tracedRaters} rater${provenance.funding.tracedRaters === 1 ? "" : "s"} over two funding hops. ${provenance.raterTypes.sampled} of ${provenance.raterTypes.total} checked for contract code.</p>
    </div>`
    : `
    <div class="prov-card prov-mut">
      <div class="prov-head">
        <span class="badge badge-mut mono">NOT TRACED</span>
        <span class="prov-title">Where this agent's reputation came from</span>
      </div>
      <p class="prov-summary">The funding trace did not complete for this agent, so no provenance verdict is shown. This is a missing answer, not a clean one.</p>
    </div>`;

  document.getElementById("results").innerHTML = prov + `
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
    // Must run before any query is built, since the query's shape depends
    // on what this endpoint supports.
    await resolveAvailableEntities();
    const agentData = await graphql(AGENT_QUERY, { agentId });
    const agent = agentData.Agent_by_pk;
    // Deduped: an agent's feedback list repeats a wallet once per entry,
    // and one wallet already has 19 entries on a single agent, so the raw
    // list would send the same address to the query many times over.
    const reviewerIds = agent
      ? Array.from(new Set(agent.feedbacks.map((f) => f.reviewer.id)))
      : [];
    const walletDetail = reviewerIds.length > 0
      ? await graphql(walletDetailQuery(reviewerIds), {
          ids: reviewerIds,
          agentId,
          walletsWithOwner: Array.from(new Set([...reviewerIds, agent.owner])),
          owner: agent.owner,
        })
      : { CrossAgentOverlap: [], CircularFunding: [], FunderFanOut: [], ReviewCadence: [], SharedFunder: [], WalletBirth: [] };

    // Second hop: of the wallets this agent's owner paid, which ones own
    // agents themselves? That is the "six agents, one operator" finding,
    // and it needs the funded list before it can be asked.
    const fundedWallets = (walletDetail.ownerFunded || []).map((r) => r.wallet);
    walletDetail.ownerFundedAgents = fundedWallets.length > 0
      ? (await graphql(
          `query($owners: [String!]!) { Agent(where: { owner: { _in: $owners } }) { id owner registeredAtTimestamp } }`,
          { owners: fundedWallets },
        )).Agent
      : [];

    // Provenance runs last and is allowed to fail on its own. It makes
    // RPC calls to a public endpoint that the rest of the page does not
    // depend on, and a rate limit there must not blank out signals that
    // already loaded successfully.
    let provenance = null;
    if (agent) {
      try {
        const raterAddrs = reviewerIds.map((id) => id.toLowerCase());
        const funding = await traceOwnerFunding(agent.owner, raterAddrs);
        const raterTypes = await classifyRaters(raterAddrs);
        const selfRated = raterAddrs.includes(agent.owner.toLowerCase()) ? 1 : 0;
        provenance = {
          funding,
          raterTypes,
          verdict: buildVerdict({
            owner: agent.owner,
            reviewers: reviewerIds,
            feedbackCount: agent.feedbacks.length,
            funding,
            raterTypes,
            selfRated,
          }),
        };
      } catch (provErr) {
        console.warn("provenance trace failed:", provErr.message);
      }
    }

    renderAgent(agentId, agent, walletDetail, provenance);
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
