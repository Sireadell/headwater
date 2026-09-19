# Honesty table

What in Headwater is real, what is simplified and disclosed, and what is
not built yet. Written 2026-09-16, kept up to date as the build moves.
Follows the pattern serial hackathon winners (GuildPay, Lynx) publish:
plain statements, not buried in comments, checkable in the code itself.

## Real

| Piece | What makes it real |
|---|---|
| ERC-8004 registry reads | `src/core/rpc/erc8004Registry.js` calls the actual Identity and Reputation registries live on Monad mainnet (`0x8004A169...`, `0x8004BAa1...`). Function signatures pulled from the real reference contracts on GitHub, not the spec doc, which doesn't give exact signatures. |
| Listing real registered agents | No enumeration function exists on the contract; `listAgents()` walks `ownerOf` ids until one reverts. Confirmed live: 250+ real agents found, real owners, real wallets. |
| Real reviewer data | `getReviewers`, `getReputationSummary`, `readAllFeedback` pull actual on-chain feedback, actual scores, actual tags, from real reviewer wallets. |
| Cross-agent review overlap | `src/crossAgentReviewOverlap.js`. Found a real cluster on the first live run: 5 different reviewer wallets all reviewing the exact same 6 agents, not a constructed example. |
| Funding-provenance signal on Monad | `src/core/signals/fundingRelationship.js` (unmodified, ported from telegraph-sentinel) reads real Monad AUSD transfer events via raw `eth_getLogs`, no Ankr Advanced API (Ankr doesn't cover Monad). Verified live against real wallets and real transactions multiple times this build. |
| 9 detection signals total | Copied from telegraph-sentinel and PulseVerify, both tested codebases before this build started. 106 tests copied and passing here, `npm test`. |
| Scoreboard | `src/scoreboard.js` logs every real finding `scripts/demo.mjs` makes to `data/predictions.json`. Not simulated data, the first entry is the real cluster found above. |
| Judge-runnable proof | `scripts/demo.mjs`, one command, real Monad mainnet calls, no mocks, confirmed under 90 seconds live. |

## Simplified, disclosed not hidden

| Piece | The real limit | Why it's an acceptable simplification for now |
|---|---|---|
| Funding lookback window | This repo's own direct RPC scan still only reaches ~22 minutes of chain history per wallet (3 pages × 1,500 blocks). **Superseded, not just planned:** a separate, real Envio HyperIndex deployment at [`Sireadell/headwater-indexer`](https://github.com/Sireadell/headwater-indexer) now indexes AUSD funding transfers back ~101M blocks (~100x deeper), plus computes circular-funding and funder-fan-out as live, continuously-updated entities -- see that repo's README for the live GraphQL endpoint and schema. |
| Token coverage | Only AUSD is tracked (`TRACKED_TOKENS` in `monadClient.js`), not every ERC-20 a wallet has touched. | An unbounded per-wallet token scan on Monad is the kind of query that made a similar project's backfill cost $990/month elsewhere (see `BUILD_PLAN.md`). A named, confirmed-live allowlist keeps every query scoped and fast; extend only after confirming a new token live, same as AUSD was. |
| Native MON transfers | Not tracked. `callMonad('monad_getTransactionsByAddress', ...)` returns an empty, honestly-flagged result (`_nativeTransferHistoryUnavailable: true`) rather than guessing. | Native transfers don't emit logs, reading them needs trace data. Envio has Monad traces (confirmed live), wiring that in is phase 3. |
| `liveSolvencyRisk` (Aave v3) | Correctly does nothing on Monad. It's hardcoded to Ethereum mainnet's real Aave v3 contract; there's no Monad equivalent wired in. | Copied code from telegraph-sentinel is Ethereum-only by design; it declines rather than guesses at a Monad answer it doesn't have. |
| Known-exchange exemption list | No Monad exchange addresses in it yet. | Same reasoning: an empty, honest list beats a guessed one. |

## Not built yet

| Piece | Why |
|---|---|
| ~~Envio integration (phase 3)~~ | **Done, 2026-09-19.** Deployed to Envio Cloud as a separate repo, [`Sireadell/headwater-indexer`](https://github.com/Sireadell/headwater-indexer). See that repo's README and HONESTY-equivalent notes for what's real there. |
| ~~Nansen second-opinion check (phase 3)~~ | **Done, 2026-09-19**, same repo. Wallets flagged by circular-funding or fan-out are screened against Nansen; known-legitimate categories (exchange, market-maker, liquidity pool, institutional) are filtered out rather than flagged. |
| MetaMask Agent Wallet hook (phase 5) | Not started. The gap it would fill is real and documented (their own security pipeline never checks whether the *other* agent being paid is real), but no code exists for it yet. |
| Registering Headwater itself as a listed ERC-8004 agent | A real transaction, needs gas and a wallet. Deliberately not done without the project owner's go-ahead; asked, not yet actioned. |
| `gasSponsor` wired into a live ERC-8004 check | The signal itself is real and tested (copied from PulseVerify, its own test suite passes), but nothing in this build calls it against real ERC-8004 data yet. The contract's `giveFeedback` always uses the caller's own address as the reviewer, so this signal's real use here (catching a sponsored relayer hiding behind many "clean" wallets) needs a concrete on-chain case to target, not yet found. |
| `recordValidation()` ever being called | The scoreboard has a real place to record a claim being confirmed or refuted, but nothing external exists yet to check a claim against, so nothing has called it. Not a stub, genuinely nothing to validate against yet. |
