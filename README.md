# Headwater

Independent funding-provenance audit for ERC-8004 agent reputation on
Monad. Monad Metropolis submission.

An empirical study of ERC-8004 across Ethereum, BSC and Base found most
reviewer activity was Sybil-coordinated, not real. The one live tool that
screens for this scores by reviewer wallet age. Age is easy to fake, and
it structurally misses the patterns Headwater looks for: the same
reviewer wallet showing up across agents it has no real reason to know,
one wallet funding many "independent" reviewers, and one relayer paying
gas for many wallets that each look unrelated on their own.

See `HONESTY.md` for exactly what's real, what's simplified and disclosed,
and what isn't built yet. See `ORIGIN.md` for where the detection code
came from. See `hackathons/monad-metropolis/BUILD_PLAN.md` in the wider
hackathons folder for the full build plan.

## Live indexer (Envio + Nansen)

A separate deployed service, [`Sireadell/headwater-indexer`](https://github.com/Sireadell/headwater-indexer)
on Envio Cloud, indexes AUSD funding transfers back roughly 300,000
blocks (not full chain history -- bounded on purpose, see that repo's
`config.yaml` for why: a wider window exceeded Envio Cloud's free-tier
event quota, since AUSD settles activity across all of Monad, not just
agent wallets), about 6x deeper than this repo's own `monadClient.js`
fast-path (~50,000-block / ~4.2-hour default cap, which still runs
independently as the fallback). It also computes circular
funding and funder fan-out as live, continuously-updated entities, and
cross-checks flagged wallets against Nansen. That repo's `config.yaml` and
`schema.graphql` are the source of truth for exactly what's indexed.

## Running the tests

```
npm test
```

## Seeing it work

```
node scripts/demo.mjs
```

Runs two checks against real registered ERC-8004 agents on Monad mainnet,
no mocks, no setup beyond `npm install`, under a minute:

1. Cross-agent review overlap: does the same reviewer wallet show up on
   more than one agent? Registry data only, no chain scanning, fast. On
   the first live run this caught five different reviewer wallets all
   clustered around reviewing the exact same six agents.
2. Funding check: were an agent's own reviewers funded by the same
   wallet? Slower (raw log scanning per reviewer), run on a smaller
   sample to stay judge-runnable.

Every real finding gets logged to `data/predictions.json` as an explicit,
dated claim.

## The scoreboard

```
node scripts/scoreboard.mjs
```

Shows the running track record: every claim this tool has made, whether
it's since been confirmed, refuted, or is still honestly labeled
`UNVALIDATED` because nothing external exists yet to check it against.

```
node scripts/generateScoreboardPage.mjs
```

Regenerates `docs/scoreboard.html`, a static page version of the same
thing, open it directly in a browser.
