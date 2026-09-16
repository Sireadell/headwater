# Where this code came from

Headwater is a new product, but it does not start from zero. The nine
funding-provenance detection signals it runs are tested code, copied on
2026-09-16 from two existing projects and adjusted only where Monad
required it:

- `telegraph-sentinel` (private repo): fundingRelationship, circularFunding,
  clustering, fanOut, convergentRelayFunding, outboundRelationships,
  contractControlRisk, liveSolvencyRisk, knownEntities, knownRisk,
  subjectApplicability, and the evidence data model.
- `PulseVerify` (private repo): gasSponsor, the relayer-hiding check.

Copied as files rather than a shared package dependency, on purpose:
telegraph-sentinel is a private repo, and a judge cloning Headwater needs
to be able to build and run it without access to anything private. See
`hackathons/monad-metropolis/BUILD_PLAN.md` for the reasoning.

New in this repo, not present in either source project:
- `src/core/rpc/monadClient.js` and `src/core/rpc/client.js`, the Monad
  transport layer (raw `eth_getLogs` scanning, since Ankr's Advanced API
  does not cover Monad).
- `src/config.js` and `src/core/chains.js`, trimmed to Monad only.

The detection logic inside the copied signal files is unchanged from the
source projects; only the transport underneath them is new.

## What this checked, copying the tests over too

Copied the matching unit tests from both source projects (106 tests,
`node --test test/core/*.test.js`, all passing). That surfaced two real
things worth stating plainly rather than leaving quiet:

- `liveSolvencyRisk.js` only knows Aave v3 on Ethereum mainnet, a
  hardcoded contract address. It correctly declines to run on Monad
  (`config.chain !== 'eth'`) rather than guessing, so it currently
  contributes nothing on Monad. Real, not broken, just out of scope until
  a Monad lending market gets added.
- `contractControlRisk.js`'s known-exchange exemption list has no Monad
  addresses in it yet, so nothing gets auto-exempted there either. Same
  situation: honest gap, not a bug.

Both signals still run their generic checks (contract bytecode reads,
admin-key detection) on Monad, since those don't depend on the exchange
list or Aave. Only the shortcut paths are Ethereum-only right now.
