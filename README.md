# Headwater

Independent funding-provenance audit for ERC-8004 agent reputation on
Monad. Monad Metropolis submission.

An empirical study of ERC-8004 across Ethereum, BSC and Base found most
reviewer activity was Sybil-coordinated, not real. The one live tool that
screens for this scores by reviewer wallet age. Age is easy to fake, and
it structurally misses the two patterns Headwater looks for: one wallet
funding many "independent" reviewers, and one relayer paying gas for many
wallets that each look unrelated on their own.

See `ORIGIN.md` for where the detection code came from and what does and
does not run on Monad yet. See `hackathons/monad-metropolis/BUILD_PLAN.md`
in the wider hackathons folder for the full build plan.

## Running the tests

```
npm test
```

## Seeing it work

```
node scripts/demo.mjs
```

Finds real registered ERC-8004 agents on Monad mainnet, pulls their real
public reviews, and checks whether reviewers share a funder. No mocks, no
setup beyond `npm install`. Takes under 20 seconds.
