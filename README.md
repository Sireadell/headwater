# Headwater

Headwater is a reputation context tool for ERC-8004 agents on Monad.

I built it because reviews can look trustworthy and still mislead people.

Most people already understand this from normal internet life. An app can have thousands of good reviews and still be unsafe or low quality. A P2P trader can look reliable because their profile is full of positive feedback, then still delay payment, shortchange you, or behave differently once real money is involved.

Agent reputation has the same problem, but with higher stakes.

ERC-8004 gives agents a public reputation trail. That is useful, but a raw score is not enough. A score can be inflated by thin activity, self-review, repeated wallets, funded raters, or app-generated feedback that looks like human trust from the outside.

Headwater asks the question the score does not answer:

```txt
Before I trust this agent, what is its reputation actually made of?
```

Headwater does not call every suspicious pattern fraud. It does not guess intent. It reads the public trail behind the reputation and explains the context in plain verdicts other agents, wallets, and marketplaces can use.

Headwater is a Monad Metropolis submission.

## Why this matters

ERC-8004 is important because agents need a way to build and show trust across the open internet.

But reputation only helps if people understand where it came from.

A score can look strong because:

- one wallet gave all the ratings
- the owner rated their own agent
- the owner funded the wallets that later rated the agent
- the feedback came from app contracts, not individual users
- one coordinated group touched many agents
- the evidence is simply too thin to trust yet

Those cases do not always mean fraud. Some are normal. Some are apps recording real outcomes. Some are just too weak to rely on.

Headwater turns those patterns into plain context before another agent, wallet, or marketplace trusts the score.

## What Headwater checks

Headwater classifies agents with verdicts like:

| Verdict | Meaning |
|---|---|
| `NO EVIDENCE` | The agent has no rating history yet |
| `THIN` | All ratings came from one address |
| `SELF REVIEWED` | The owner's wallet is also a rater, or the owner sent a rater's review itself |
| `APP GENERATED` | Ratings appear to come from application contracts |
| `OWNER FUNDED` | The owner funded raters directly or through one hop |
| `ROUND TRIP` | Funds moved from owner to rater, then back after rating |
| `RING` | One money source sits behind the raters of several agents |
| `NO LINK FOUND` | No funding link was found in the checked path |

These are evidence labels, not accusations.

For example, a group of agents can look coordinated until the contracts are decoded. Some Monad agents receive positive and negative ratings from game contracts, where the two scores represent a winner and a loser. Headwater labels those as `APP GENERATED` instead of calling them manipulation.

## Live data

Headwater uses a separate Envio indexer:

https://github.com/Sireadell/headwater-indexer

That indexer reads Monad ERC-8004 registry activity and traces native MON funding history with Envio HyperSync.

This matters because the public Monad RPC cannot do the same job. It limits `eth_getLogs` to a 100 block range, and native MON transfers do not emit logs. Without HyperSync, Headwater cannot trace funding history across the chain in a useful way.

Nansen is not currently used in the live verdicts. See `HONESTY.md` for the exact status.

## Use the API

No key. No server setup. The static API is published with the site.

```txt
GET https://sireadell.github.io/headwater/api/index.json
GET https://sireadell.github.io/headwater/api/agents/182.json
```

If an agent has no file, it has no rating history in the published data. That means `NO EVIDENCE`, not a broken request.

## Use the MCP server

Agents can also call Headwater directly through MCP.

```json
{
  "mcpServers": {
    "headwater": {
      "command": "node",
      "args": ["/absolute/path/to/headwater/mcp/server.mjs"]
    }
  }
}
```

Tool:

```txt
check_agent_reputation
```

Input:

```txt
agentId
```

The page, JSON API, and MCP server all use the same verdict rules from `docs/provenance.js`.

## Run locally

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run the demo:

```bash
node scripts/demo.mjs
```

The demo checks real Monad ERC-8004 agents and writes dated claims to:

```txt
data/predictions.json
```

### Alchemy for registry reads

Headwater reads the ERC-8004 registries (agent owners and every reviewer of an agent) with plain `eth_call`. On Monad, Alchemy serves these reliably. With an Alchemy key set, those reads go through Alchemy:

```bash
echo ALCHEMY_API_KEY=your_key > .env
node --env-file=.env scripts/demo.mjs
```

Without a key, Headwater falls back to the public Monad endpoint, which answered the same registry reads with 403 "Restricted JSON RPC method" when tested on 2026-10-08. Alchemy's free tier limits `eth_getLogs` to 10 blocks, so log scans stay on the public endpoints and the Envio index.

## Scoreboard

Headwater keeps a record of the claims it has made.

```bash
node scripts/scoreboard.mjs
```

To rebuild the static scoreboard page:

```bash
node scripts/generateScoreboardPage.mjs
```

Then open:

```txt
docs/scoreboard.html
```

## Honesty notes

Headwater is intentionally narrow.

It does not decide whether an agent is good or bad. It does not claim that funded ratings are always fake. It does not replace human review, app-specific context, or future reputation systems.

It answers one practical question:

```txt
Before I trust this ERC-8004 score, what should I know about where it came from?
```

For exact limits, simplifications, and unfinished work, read `HONESTY.md`.

For where the detection logic came from, read `ORIGIN.md`.
