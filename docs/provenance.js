// Funding provenance for an ERC-8004 agent's raters, computed in the page.
//
// The question this answers is not "does this agent have good reviews". The
// registry already shows that, and on Monad the number is close to
// meaningless: of 10,254 registered agents only 84 have ever been rated, and
// a single agent holds 83% of all feedback on the chain.
//
// The question is where the raters' money came from, because that is the one
// part of a reputation a farm cannot fake without spending real MON through
// addresses that stay on chain afterwards.
//
// Three things here are deliberately different from the obvious version:
//
//   1. Two hops, not one. Checking only `owner -> rater` is defeated by any
//      farm that puts one burner wallet in the middle, and one wallet is a
//      few seconds of work. `owner -> X -> rater` costs one more query and
//      closes that route.
//   2. Owner identity beats distributor shape. Our own indexer marks any
//      wallet that funded a great many others as distributor-shaped, so a
//      public faucet does not flag every agent on the chain. That rule is
//      right in general and catastrophic in one specific case: the funder
//      behind agent 182's 7,665 raters funded exactly 7,665 wallets AND is
//      that agent's own owner. Shape said faucet, identity said self-dealing,
//      and identity is the one that matters. Verified on chain 2026-09-23.
//   3. A rater that is a contract is not a person. Agents 153 to 158 look
//      like a coordinated ring until the rating contracts are decoded and
//      turn out to expose createGame, games and getRound. Every one of their
//      transactions carries one positive and one negative score, which is a
//      winner and a loser. Calling that manipulation would be wrong, so the
//      classifier names it instead.

const RPC_URL = "https://rpc.monad.xyz";

// Function selectors that identify a rating contract as an application
// writing outcomes rather than an opinion about service quality. Found by
// decoding the raters on agents 153 to 158 against the 4byte directory on
// 2026-09-23. A selector appears in a contract's dispatcher as a literal
// 4-byte push, so a substring search over the deployed code is enough to
// recognise one without an ABI.
const APP_SELECTORS = {
  "48e837b9": "createGame(uint256)",
  "117a5b90": "games(uint256)",
  "39ec68a3": "getRound(uint256,uint256)",
};

// How many raters to classify over RPC. Contract detection is one request per
// address and agent 182 has 7,665 raters, so the full set would be tens of
// thousands of requests from a browser. A sample answers the question the
// verdict actually asks ("are these raters people or code") and the number
// sampled is always reported next to the result, so a reader can see the
// claim's basis rather than trusting a round number.
const MAX_CLASSIFY = 40;

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

// Returns Map(address -> { isContract, app }) where `app` names the
// application a rating contract belongs to, or null if it is code we cannot
// identify. An address that fails to resolve is simply absent from the map
// rather than guessed at, so a flaky RPC weakens the answer instead of
// falsifying it.
async function classifyRaters(addresses) {
  const out = new Map();
  const sample = addresses.slice(0, MAX_CLASSIFY);
  const results = await Promise.allSettled(
    sample.map(async (addr) => {
      const code = await rpcCall("eth_getCode", [addr, "latest"]);
      const isContract = typeof code === "string" && code.length > 2;
      let app = null;
      if (isContract) {
        const hits = Object.entries(APP_SELECTORS)
          .filter(([sel]) => code.includes(sel))
          .map(([, sig]) => sig);
        if (hits.length > 0) app = hits;
      }
      return [addr, { isContract, app }];
    }),
  );
  for (const r of results) if (r.status === "fulfilled") out.set(r.value[0], r.value[1]);
  return { classified: out, sampled: sample.length, total: addresses.length };
}

// One WalletFunder lookup for a set of wallets. Returns Map(wallet -> [{funder,
// isDust}]). Dust is kept rather than dropped: a gas top-up does not prove who
// capitalised a wallet, but it is still a link between two parties and the
// caller decides what weight to give it.
async function fundersOf(wallets) {
  if (wallets.length === 0) return new Map();
  const map = new Map();
  // Two separate caps bite here and neither announces itself. The endpoint
  // returns at most 1,000 rows however large a `limit` is asked for, and a
  // very long `_in` list fails the whole query outright ("database query
  // error" at 7,665 ids, verified 2026-09-23). So the wallets are sent in
  // modest batches, and each batch is walked with an offset until a short
  // page proves it is exhausted. Agent 182 has 7,665 raters, so a silent
  // truncation here would quietly turn "all of them" into "the first
  // thirteen percent of them" while still reading as a complete answer.
  const BATCH = 500;
  const PAGE = 1000;
  for (let i = 0; i < wallets.length; i += BATCH) {
    const batch = wallets.slice(i, i + BATCH);
    for (let offset = 0; ; offset += PAGE) {
      const query = `
        query Funders($wallets: [String!]!, $offset: Int!) {
          WalletFunder(where: { wallet: { _in: $wallets } }, limit: ${PAGE}, offset: $offset, order_by: { id: asc }) {
            wallet
            funder
            isDust
          }
        }`;
      const data = await graphql(query, { wallets: batch, offset });
      const rows = data.WalletFunder || [];
      for (const row of rows) {
        if (!map.has(row.wallet)) map.set(row.wallet, []);
        map.get(row.wallet).push({ funder: row.funder, isDust: row.isDust });
      }
      if (rows.length < PAGE) break;
    }
  }
  return map;
}

// Did the rater ever pay the agent's owner, and did it pay before or after
// rating?
//
// This is the filter a reasonable person reaches for first: a rating from
// somebody who actually paid for the service ought to be worth more than a
// rating from a stranger. It is measured here before it is trusted, and the
// measurement says it certifies almost nothing on this chain. Across all 84
// rated agents there are 7,771 (agent, rater) relationships. In 7,670 of them
// the rater did send native MON to the agent's owner. In exactly 3 of them the
// payment came BEFORE the rating. Measured 2026-09-23 against the live
// endpoint; ProofLines published the same 3 from an independent pipeline, so
// two different methods agree on the number.
//
// What the other 7,667 are is the interesting part, and it is why a
// payment-backed filter used on its own would read this chain exactly
// backwards. On agent 182 the owner sends a wallet 11 MON, the wallet rates
// the agent seconds later, and the wallet sends about 10.93 MON straight back
// to the owner. The money makes a round trip and the owner is out only the
// gas. Taken alone, "this rater paid the agent" would certify all 7,665 of
// those as customers.
//
// So the payment is recorded with its direction and its timing, never as a
// bare yes or no.
//
// One stated limit: the indexer keeps the earliest payment from each payer to
// each wallet, so "paid before rating" means the payer's FIRST payment to the
// owner predates its first rating. A later payment by an already-paying wallet
// is not separately timed here.
async function tracePayments(owner, raterIds, firstRatedAt) {
  const ownerLc = (owner || "").toLowerCase();
  const raters = raterIds.map((r) => r.toLowerCase());
  if (!ownerLc || raters.length === 0) {
    return { paidBefore: [], paidAfter: [], paidUnknownTime: [], tracedRaters: raters.length };
  }

  // Same two caps as fundersOf: at most 1,000 rows come back however large a
  // limit is asked for, and a very long `_in` list fails the whole query. So
  // the raters go out in batches and each batch is walked to exhaustion.
  const BATCH = 500;
  const PAGE = 1000;
  const paidBefore = [];
  const paidAfter = [];
  const paidUnknownTime = [];

  for (let i = 0; i < raters.length; i += BATCH) {
    const batch = raters.slice(i, i + BATCH);
    for (let offset = 0; ; offset += PAGE) {
      const query = `
        query Payments($owner: String!, $raters: [String!]!, $offset: Int!) {
          WalletFunder(
            where: { wallet: { _eq: $owner }, funder: { _in: $raters } },
            limit: ${PAGE}, offset: $offset, order_by: { id: asc }
          ) {
            funder
            isDust
            valueRaw
            firstFundedTimestamp
          }
        }`;
      const data = await graphql(query, { owner: ownerLc, raters: batch, offset });
      const rows = data.WalletFunder || [];
      for (const row of rows) {
        const rater = (row.funder || "").toLowerCase();
        const record = {
          rater,
          isDust: row.isDust,
          valueRaw: row.valueRaw,
          paidAt: row.firstFundedTimestamp,
        };
        const ratedAt = firstRatedAt ? firstRatedAt.get(rater) : undefined;
        if (ratedAt === undefined || row.firstFundedTimestamp === undefined || row.firstFundedTimestamp === null) {
          paidUnknownTime.push(record);
        } else if (row.firstFundedTimestamp <= ratedAt) {
          paidBefore.push(record);
        } else {
          paidAfter.push(record);
        }
      }
      if (rows.length < PAGE) break;
    }
  }

  return { paidBefore, paidAfter, paidUnknownTime, tracedRaters: raters.length };
}


// Traces owner money to raters over one and two hops.
//
// Hop one is the direct `owner -> rater` payment. Hop two is
// `owner -> intermediary -> rater`, which is what a farm produces the moment
// it stops paying its raters from the same wallet that registered the agent.
// Only the funders actually seen at hop one are followed, so the second query
// stays small.
async function traceOwnerFunding(owner, raterIds) {
  const ownerLc = (owner || "").toLowerCase();
  const raters = raterIds.map((r) => r.toLowerCase());
  const hop1 = await fundersOf(raters);

  const direct = [];
  const viaCandidates = new Map(); // intermediary -> raters it funded
  for (const [wallet, rows] of hop1) {
    for (const row of rows) {
      const funder = (row.funder || "").toLowerCase();
      if (funder === ownerLc) {
        direct.push({ rater: wallet, isDust: row.isDust });
      } else if (funder) {
        if (!viaCandidates.has(funder)) viaCandidates.set(funder, []);
        viaCandidates.get(funder).push(wallet);
      }
    }
  }

  // Who funded the intermediaries. If the agent's own owner shows up here,
  // the raters were paid for by the owner through a wallet that exists only
  // to break the direct link.
  const hop2 = await fundersOf([...viaCandidates.keys()]);
  const indirect = [];
  for (const [intermediary, rows] of hop2) {
    if (!rows.some((r) => (r.funder || "").toLowerCase() === ownerLc)) continue;
    for (const rater of viaCandidates.get(intermediary) || []) {
      indirect.push({ rater, via: intermediary });
    }
  }

  return {
    direct,
    indirect,
    tracedRaters: raters.length,
    ratersWithKnownFunder: hop1.size,
  };
}

// Builds the plain-language verdict shown above every other signal.
//
// Every branch states what was observed, never why anyone did it. "The owner
// paid for these raters" is checkable. "These reviews are fake" is a claim
// about somebody's intent, is not checkable, and was wrong the one time this
// project tried it.
function buildVerdict({ owner, reviewers, feedbackCount, funding, raterTypes, selfRated, payments }) {
  const findings = [];
  // Absent payment data is not the same as no payments, so an older caller
  // that does not supply it gets an empty record and no payment claim is made
  // in either direction.
  const pay = payments || { paidBefore: [], paidAfter: [], paidUnknownTime: [], tracedRaters: 0 };

  if (feedbackCount === 0) {
    return {
      label: "NO EVIDENCE",
      tone: "mut",
      summary:
        "This agent has never been rated. That is the normal case on Monad: " +
        "10,170 of 10,254 registered agents have no feedback at all. There is " +
        "nothing here to trust or distrust.",
      findings,
    };
  }

  const appRaters = [...raterTypes.classified.entries()].filter(([, v]) => v.app);
  const contractRaters = [...raterTypes.classified.entries()].filter(([, v]) => v.isContract);

  if (funding.direct.length > 0) {
    findings.push(
      `${funding.direct.length} of ${funding.tracedRaters} raters were paid directly by this agent's own owner.`,
    );
  }
  if (funding.indirect.length > 0) {
    const vias = new Set(funding.indirect.map((i) => i.via));
    findings.push(
      `${funding.indirect.length} more were paid by the owner through ${vias.size} ` +
        `intermediary wallet${vias.size === 1 ? "" : "s"}, which a direct owner-to-rater check does not see.`,
    );
  }
  // Money that left the owner and came back. Stated as a movement, because
  // that is all it is: the owner funded the rater, the rater rated, the rater
  // returned funds to the owner. Why anyone did that is not knowable from the
  // chain and is not claimed here.
  const ownerFundedSet = new Set([
    ...funding.direct.map((d) => d.rater),
    ...funding.indirect.map((i) => i.rater),
  ]);
  const roundTrip = pay.paidAfter.filter((p) => ownerFundedSet.has(p.rater));
  if (roundTrip.length > 0) {
    findings.push(
      `${roundTrip.length} rater${roundTrip.length === 1 ? " was" : "s were"} funded by this ` +
        `agent's owner and then sent funds back to that same owner after rating. The owner's ` +
        "money made a round trip.",
    );
  }
  const independentPaidBefore = pay.paidBefore.filter((p) => !ownerFundedSet.has(p.rater));
  if (independentPaidBefore.length > 0) {
    findings.push(
      `${independentPaidBefore.length} rater${independentPaidBefore.length === 1 ? "" : "s"} ` +
        `paid this agent's owner BEFORE rating it and ${independentPaidBefore.length === 1 ? "was" : "were"} ` +
        "not funded by that owner. That is the strongest grounding available here, and it is rare: " +
        "3 such relationships exist across the whole chain.",
    );
  }
  if (pay.paidAfter.length > 0 && roundTrip.length === 0) {
    findings.push(
      `${pay.paidAfter.length} rater${pay.paidAfter.length === 1 ? "" : "s"} paid this agent's ` +
        "owner, but only after rating it.",
    );
  }
  if (selfRated > 0) findings.push("The owner's own wallet is among the raters.");
  if (appRaters.length > 0) {
    findings.push(
      `${appRaters.length} of the ${raterTypes.sampled} raters checked are application contracts, not people. ` +
        `They expose ${appRaters[0][1].app.join(", ")}, so these scores are outcomes recorded by software.`,
    );
  } else if (contractRaters.length > 0) {
    findings.push(
      `${contractRaters.length} of the ${raterTypes.sampled} raters checked are contracts rather than wallets.`,
    );
  }
  if (reviewers.length === 1) findings.push("Every rating came from one single address.");

  const ownerPaid = funding.direct.length + funding.indirect.length;

  // Whether the raters are mostly software decides which fact leads, because
  // the two readings call for opposite reactions. An owner paying strangers to
  // rate it is a reason to discount the score. An application recording its own
  // outcomes is the standard working, and the owner paying that application's
  // gas is unremarkable. Leading with "owner funded" on agents 153 to 158 would
  // repeat this project's one serious mistake, so when most of the raters
  // checked are application contracts, that leads and the funding is reported
  // underneath rather than as a headline.
  const appMajority =
    raterTypes.sampled > 0 && appRaters.length >= Math.ceil(raterTypes.sampled / 2);

  if (appMajority) {
    return {
      label: "APP GENERATED",
      tone: "mut",
      summary:
        "These scores were written by application contracts recording outcomes, not by " +
        "people forming opinions. That is the standard being used as designed. It is not a " +
        "warning, but the score measures results inside one application rather than a " +
        "general reputation, and it should not be read as customers vouching for this agent." +
        (ownerPaid > 0
          ? " The owner has also funded raters here, which for an application contract usually " +
            "means paying its gas rather than buying an opinion."
          : ""),
      findings,
    };
  }
  // Ranked above OWNER FUNDED because it says strictly more: not only did the
  // owner pay for the raters, the money came back. It stays below APP
  // GENERATED, because an application contract paid its gas and returning a
  // balance is ordinary plumbing, and reading that as a round trip would
  // repeat this project's one serious mistake.
  if (roundTrip.length > 0) {
    const share = Math.round((roundTrip.length / Math.max(funding.tracedRaters, 1)) * 100);
    return {
      label: "ROUND TRIP",
      // Same reason as OWNER FUNDED: a half is a real finding and is not
      // painted the same as a whole.
      tone: share >= 50 ? "red" : "amber",
      summary:
        `${share}% of the traced raters were paid by this agent's own owner and then sent funds ` +
        "back to that same owner after rating it. The money left the owner and returned to the " +
        "owner. How much of it returned is not asserted here, only that it went both ways. This " +
        "describes where the money moved and not why anyone moved it, and a funded campaign can " +
        "be entirely legitimate. It does mean that a check asking only 'did the rater pay this " +
        "agent' would read this agent as customer-backed, which the direction and the timing of " +
        "the money both contradict.",
      findings,
    };
  }
  if (ownerPaid > 0) {
    const share = Math.round((ownerPaid / Math.max(funding.tracedRaters, 1)) * 100);
    return {
      label: "OWNER FUNDED",
      // A minority share is a real finding but not the whole picture, so it is
      // not dressed in the same colour as an agent whose entire rater base was
      // paid for by the party being rated.
      tone: share >= 50 ? "red" : "amber",
      summary:
        `Money for ${share}% of the traced raters came from the agent's own owner. That is ` +
        "not an accusation of fraud, and a paid campaign can be perfectly legitimate. It does " +
        "mean that much of the score is not independent evidence, because the party being " +
        "rated paid for those raters to exist.",
      findings,
    };
  }
  if (selfRated > 0) {
    return {
      label: "SELF REVIEWED",
      tone: "red",
      summary:
        "The wallet that owns this agent is among the wallets rating it.",
      findings,
    };
  }
  if (reviewers.length === 1) {
    return {
      label: "THIN",
      tone: "amber",
      summary:
        "Every rating on this agent came from a single address. 75 of the 84 rated agents on " +
        "Monad are in this position. One address agreeing with itself repeatedly is one " +
        "opinion, however many times it is recorded.",
      findings,
    };
  }
  return {
    label: "NO LINK FOUND",
    tone: "mut",
    summary:
      `No funding link was found between this agent's owner and its raters, across ` +
      `both direct payments and one intermediary wallet. ${funding.ratersWithKnownFunder} of ` +
      `${funding.tracedRaters} raters have a funding record at all, so absence of a link is ` +
      "weaker evidence than a link would be.",
    findings,
  };
}
