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

Full chain-history funding data, plus live circular-funding and funder
fan-out detection, run as a separate deployed service:
[`Sireadell/headwater-indexer`](https://github.com/Sireadell/headwater-indexer)
on Envio Cloud. That repo's `config.yaml` and `schema.graphql` are the
source of truth for what's actually indexed; this repo's own
`monadClient.js` (bounded, ~22-minute lookback) still runs independently
as the fast-path fallback.

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
