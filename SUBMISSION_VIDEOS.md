# Video scripts

Two scripts for the two submission videos, written to be read aloud. Say
them in your own words. The order of the argument is what matters, not
the exact wording.

## The one thing to get right

Headwater is not a fraud detector and you must not present it as one.

An earlier version of these scripts claimed six agents were caught
manipulating reviews. That claim was checked properly and it was wrong.
The reviewers were game contracts, and the paired scores were match
results, a winner and a loser. If you say fraud, a judge reads the
contract and your submission is finished.

What you have is better and it cannot be argued with, because it is a
census rather than an accusation. Monad tells developers to put agent
reputation on chain. You indexed all of it and measured what is actually
there. The answer is that almost nothing is there, and what exists is
made of things nobody can see from the score.

## Technical demo (max 3 minutes)

Screen-record the live site.

**[0:00-0:25] Home page.**

"This is Headwater. ERC-8004 gives an AI agent a reputation score on
chain, and Monad's own documentation tells agents to check that score
before a high-value transaction."

"So I indexed every agent on Monad to see what those scores are made of.
There are 10,254 of them. Eighty four have received a single review
between them. Everything else has no reputation at all."

**[0:25-1:00] The breakdown table.**

"Of the eighty four that do have reviews, seventy five got every single
review from one address. Nine were reviewed by the wallet that owns
them."

"One agent, number 182, holds 83 percent of all the feedback on the
chain. It has 7,665 reviewers. I traced the funding behind them and
every one was paid for by the same wallet."

"I want to be careful here. That is very likely a legitimate campaign, a
quest where people were paid to try an agent. I am not accusing anyone.
The point is that it renders in a registry as a popular agent, and
nothing tells you it was a campaign."

**[1:00-1:40] Agents 153 to 158, the honest part.**

"These six looked like the most suspicious thing on the chain. Six
agents, six different owners, and one of those owners paid five MON to
each of the other five before any of them registered."

"I thought I had found coordinated reviews. Then I read the contracts
that were posting them. The function names are createGame, games and
getRound. Every transaction carries one positive score and one negative
score. That is a winner and a loser. It is a game reporting its
results."

"So the tool was right that they are connected, and I was wrong about
what it meant. That is exactly why the product says what a score is made
of instead of passing judgement on it."

**[1:40-2:20] Lookup page, run a live check.**

Type an agent number and hit Check.

"For any agent, this traces the funding behind every reviewer wallet
back to its first transaction, checks whether the reviewers are people
or contracts, checks whether the owner is reviewing itself, and checks
whether the reviewers share a payer."

"It returns context, not a verdict. Thin, self-reviewed, campaign
shaped, game generated, or nothing to go on."

**[2:20-2:50] Methodology page.**

"Everything is written down here, including what does not work. The
wallet reputation check is dead, so it reads NOT ACTIVE rather than
showing a clean pass on a check that never ran."

"And one wallet on Monad has funded 7,665 others. If I did not exclude
it, every agent on the chain would look connected, and the tool would
appear to work while telling you nothing."

**[2:50-3:00] Close.**

"A score you cannot trace is just a number. This is the part that traces
it."

## Pitch video (max 2 minutes)

**[0:00-0:20] Who and what.**

"Hi, I'm [name]. I built Headwater."

"ERC-8004 is the standard that gives AI agents a reputation on chain.
Monad is actively telling builders to use it, and its docs say agents
should check reputation before a high-value transaction."

**[0:20-0:50] What I found.**

"So I indexed every ERC-8004 agent on Monad. 10,254 registered. Eighty
four have any review at all. One agent holds 83 percent of all the
feedback on the whole chain, and all 7,665 of its reviewers were funded
by a single wallet."

"Nobody had measured this. The trust layer Monad recommends is, right
now, almost entirely empty, and the parts that are not empty are not
what they look like."

**[0:50-1:20] What the product does.**

"Headwater tells you what a score is made of before you trust it. Is it
broad, or is it one address reviewing over and over. Is the owner
reviewing itself. Were the reviewers all paid by the same wallet. Are
the reviewers even people, or are they contracts."

"It traces funding back to each wallet's first transaction, so it works
on a chain with no labels and no history, which is exactly what Monad is
today."

**[1:20-1:45] Why it matters.**

"Agents are going to start paying each other, and the standard says to
check reputation first. But a score with no context is not a safety
check, it is a number."

"I am not claiming anyone cheated. I checked the one cluster that looked
like cheating and it turned out to be a game. That is the whole argument
for why context has to sit next to the score."

**[1:45-2:00] Close.**

"It is live on Monad mainnet, the code is public, and the methodology
page lists what works and what does not, including the checks that are
switched off. That's Headwater. Thanks for watching."

## Numbers to keep straight

Every figure was measured against the live indexer on 2026-09-22. Do not
round them and do not add any that are not here.

- 10,254 agents registered on Monad mainnet
- 84 of them have any feedback at all
- 9,188 feedback records in total
- Agent 182 has 7,665 distinct reviewers, 83% of all feedback
- All 300 sampled reviewers of agent 182 were funded by one wallet, and
  that wallet funded exactly 7,665 addresses
- 75 of the 84 have exactly one distinct reviewer
- 76 of the 84 have one reviewer supplying 80% or more
- 9 of the 84 were reviewed by their own owner
- Agents 153 to 158: six agents, six owner wallets, 5.000 MON paid to
  each of five of them, all six registered within 119 seconds
- Of 50 reviewers sampled chain wide, 6 were contracts and 44 were
  wallets
- Monad runs about 85 transactions per second, roughly 7.35 million a day

## Do not say

- "Fraud", "scammers", "Sybil", "fake reviews", "we caught" anyone
- "Money can't lie"
- That the 153 to 158 cluster manipulated reviews. It was a game
- The 73 percent figure from the arXiv study. That was measured on
  Ethereum, BSC and Base, not Monad, and our own Monad data does not
  support it
- Any number that is not in the list above
