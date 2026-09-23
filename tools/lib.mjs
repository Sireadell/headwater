// Loads the provenance logic out of the page's own source, so the API, the MCP
// server and the website cannot drift apart.
//
// docs/provenance.js is a plain browser script, not an ES module: the site
// loads it with a <script> tag alongside config.js and lookup.js, and it reads
// a couple of globals those files define. Converting it to a module would mean
// a build step for a static site that currently needs none, and keeping a
// second Node copy of the same rules would mean the API and the page could
// answer the same question differently. Evaluating the file and lifting the
// functions out costs a few lines here and removes both problems.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export const ENDPOINT = (() => {
  const src = readFileSync(join(root, "docs/config.js"), "utf8");
  const m = src.match(/GRAPHQL_ENDPOINT\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("no GRAPHQL_ENDPOINT found in docs/config.js");
  return m[1];
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries on rate limiting and on transient server errors, and on nothing
// else. The page makes a handful of requests when a person clicks Check; a
// full API build makes thousands back to back and will be throttled partway
// through. Failing the whole build on one 429 means the generated API is
// missing whichever agents came after it, which is the kind of gap that looks
// like data rather than an outage.
//
// A GraphQL-level error is never retried. Those are deterministic here (a bad
// field, a query too large) and repeating them just burns the rate limit.
export async function graphql(query, variables, attempt = 0) {
  const MAX_ATTEMPTS = 6;
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) throw err;
    await sleep(2 ** attempt * 500);
    return graphql(query, variables, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`GraphQL request failed: HTTP ${res.status} after ${MAX_ATTEMPTS} retries`);
    }
    // Honour Retry-After when the server sends one, since guessing shorter
    // than it asks for is how a throttle turns into a ban.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 500;
    await sleep(waitMs);
    return graphql(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`GraphQL request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

// provenance.js calls `graphql` as a global, the same way it does in the
// browser, so it is provided here rather than passed in.
globalThis.graphql = graphql;

const provenanceSrc = readFileSync(join(root, "docs/provenance.js"), "utf8");
export const { classifyRaters, traceOwnerFunding, buildVerdict } = new Function(
  `${provenanceSrc}\nreturn { classifyRaters, traceOwnerFunding, buildVerdict };`,
)();

const PAGE = 1000;

// Every rater of an agent, deduped. The endpoint returns at most 1,000 rows
// whatever limit is asked for and never says it truncated, so a short page is
// the only reliable signal that the walk is finished.
export async function ratersOf(agentId) {
  const ids = [];
  for (let offset = 0; ; offset += PAGE) {
    const data = await graphql(
      `query Raters($agentId: String!, $offset: Int!) {
         Feedback(where: { agent_id: { _eq: $agentId } }, limit: ${PAGE}, offset: $offset, order_by: { id: asc }) {
           reviewer_id
         }
       }`,
      { agentId, offset },
    );
    const rows = data.Feedback || [];
    for (const r of rows) ids.push(r.reviewer_id.toLowerCase());
    if (rows.length < PAGE) break;
    if (offset > 50000) break;
  }
  return { raters: [...new Set(ids)], feedbackCount: ids.length };
}

// The whole answer for one agent, in the shape the API and the MCP tool both
// return. An agent that does not exist returns null rather than an empty
// verdict, because "no such agent" and "an agent nobody has rated" are
// different answers and collapsing them would mislead a caller.
export async function checkAgent(agentId) {
  const data = await graphql(
    `query Agent($id: String!) { Agent(where: { id: { _eq: $id } }) { id owner agentURI registeredAtTimestamp } }`,
    { id: String(agentId) },
  );
  const agent = data.Agent?.[0];
  if (!agent) return null;

  const owner = agent.owner.toLowerCase();
  const { raters, feedbackCount } = await ratersOf(String(agentId));
  const funding = await traceOwnerFunding(owner, raters);
  const raterTypes = await classifyRaters(raters);
  const selfRated = raters.includes(owner) ? 1 : 0;
  const verdict = buildVerdict({
    owner,
    reviewers: raters,
    feedbackCount,
    funding,
    raterTypes,
    selfRated,
  });

  return {
    agentId: String(agentId),
    owner,
    agentURI: agent.agentURI || null,
    registeredAt: agent.registeredAtTimestamp || null,
    verdict: verdict.label,
    tone: verdict.tone,
    summary: verdict.summary,
    findings: verdict.findings,
    evidence: {
      feedbackCount,
      distinctRaters: raters.length,
      selfRated: selfRated === 1,
      ownerFundedDirect: funding.direct.length,
      ownerFundedViaIntermediary: funding.indirect.length,
      intermediaries: [...new Set(funding.indirect.map((i) => i.via))],
      ratersWithKnownFunder: funding.ratersWithKnownFunder,
      ratersTraced: funding.tracedRaters,
      contractRaters: [...raterTypes.classified.values()].filter((v) => v.isContract).length,
      applicationRaters: [...raterTypes.classified.values()].filter((v) => v.app).length,
      ratersCheckedForCode: raterTypes.sampled,
    },
    // Stated on every response, because a caller deciding whether to pay an
    // agent needs to know that a verdict of "no link found" rests on two hops
    // of native MON and a sample of the raters, not on omniscience.
    limits: {
      fundingHops: 2,
      fundingAsset: "native MON only",
      codeCheckSample: raterTypes.sampled,
      codeCheckTotal: raterTypes.total,
      note:
        "A verdict is a statement about where money came from, not about anyone's intent. " +
        "Absence of a funding link is weaker evidence than a link, because funding moved by " +
        "an internal contract call is not visible in top-level transactions.",
    },
    source: ENDPOINT,
    generatedAt: new Date().toISOString(),
  };
}
