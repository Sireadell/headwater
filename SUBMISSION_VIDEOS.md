# Video scripts

Two scripts for the two required submission videos, written to be read
aloud. Say them in your own words rather than reciting them. The order of
the argument is what matters, not the exact wording.

Do not film until the live site is confirmed showing the owner-funding
signal. The whole demo rests on it.

## The one thing to get right

Do not say the word fraud, and do not call these people scammers.

Everything in these scripts is true and checkable. Intent is not. The
same on-chain pattern would be produced by one developer testing their
own agents, and a judge who knows this space will think exactly that. If
you claim fraud you invite an argument you cannot win, because you cannot
prove what was in someone's head.

Claim provenance instead. "These six agents are not independent, and here
is the transaction that proves it" is unarguable. It is also the more
interesting claim, because it means the registry's reputation score
cannot be taken at face value regardless of anyone's motives.

---

## Technical demo (max 3 minutes)

Must show the live working product. Screen-record the real site.

**[0:00-0:20] Home page.**

"This is Headwater. ERC-8004 lets an AI agent carry a reputation on
chain, so you can check its reviews before trusting it. The problem is
that anyone can make a wallet and write a review. So I wanted to know
whether the reviews on Monad are actually coming from independent people."

"It reads live from Monad mainnet. Seven thousand six hundred and ninety
wallets have reviewed an agent, and it checks every one of them."

**[0:20-0:50] Agent Lookup, type 153, hit Check.**

"Here's a real one. Agent 153. It has reviews. It looks fine."

Point at the first signal, Owner funded other agents.

"This is what the tool found. The wallet that owns this agent paid for
the wallets that own agents 154, 155, 156, 157 and 158. Five other
agents, five different owner addresses, which is exactly what makes them
look independent when you scroll a registry."

"That isn't guessed from behaviour. It's a transaction. Five MON to each
one, all inside about a minute."

**[0:50-1:40] Walk down the other signals.**

"Once you know that, everything else lines up."

Wallets created together: "The reviewer wallets were all created inside a
48 minute window. One posted its first review 57 seconds after it existed
on chain at all."

Automated review timing: "And they post on a clock. Roughly 50 to 80
seconds apart, over and over. People don't review like that. Scripts do."

Cross-agent overlap: "This is the signal most tools would lead with, and
I want to be honest about it. Out of 7,690 reviewers, only 13 ever
reviewed more than one agent. On its own it catches almost nothing, and
anyone hiding would just use each wallet once. That's why the funding
trail matters more."

**[1:40-2:20] Methodology page.**

"Everything is written down here, including what doesn't work."

"The wallet reputation check is dead, so it says NOT ACTIVE instead of
showing a clean pass on a check that never ran."

"And there's a wallet on Monad that has funded 7,665 other wallets. It's
a faucet. If I didn't exclude it, every agent on the chain would look
suspicious, and the tool would seem to be working while telling you
nothing. So it's excluded, and that's written down too."

**[2:20-2:50] Close.**

"I'm deliberately not calling this fraud. I can't see intent, and this
could be one developer testing their own agents. What I can show is that
six agents presenting as independent were paid for by one wallet."

"That's the point. A reputation score you can't trace is just a number.
Headwater is the part that traces it."

---

## Pitch video (max 2 minutes)

Talking head is fine. Slides optional.

**[0:00-0:20] Who and what.**

"Hi, I'm [name]. I built Headwater."

"ERC-8004 is the standard that gives AI agents a reputation on chain, so
agents and people can work out who to trust. Monad has more real activity
on it than any other chain I checked."

**[0:20-0:50] The problem, with the number that makes it real.**

"Reputation is only as good as the reviewers. A study of ERC-8004 across
Ethereum, BSC and Base found up to 73 percent of reviewers showed
coordinated Sybil behaviour. Most reviews weren't independent people."

"So a registry can tell you an agent has good reviews. It can't tell you
whether those reviews mean anything."

**[0:50-1:20] What I built, and what it found.**

"Headwater traces where reviewer and owner wallets got their money, back
to each wallet's first transaction."

"On Monad it found six agents that look independent, six different owner
wallets. One of those wallets paid for the other five to exist. Five MON
each, inside a minute, before any of the agents were registered. The
reviewers were created the same day and posted on a timer."

**[1:20-1:45] Why it matters beyond this one case.**

"I'm not claiming those six are scammers. I can't prove intent and I
don't try to. What I can prove is that they're not independent."

"That's the gap. Registries show you a score. Nobody shows you where it
came from. If agents are going to start paying each other, somebody has
to answer that."

**[1:45-2:00] Close.**

"It's live on Monad mainnet, the code is public, and the methodology page
lists what works and what doesn't, including the checks that are switched
off."

"That's Headwater. Thanks for watching."

---

## Numbers to keep straight

Every figure here was measured, not estimated. Don't round them up.

- 7,690 wallets have reviewed an agent
- 9,188 feedback records
- Only 13 reviewers ever reviewed more than one agent
- Agents 153 to 158: six agents, six owner wallets
- 5.000 MON to each of five owner wallets
- Those owner wallets created inside 63 seconds
- All six agents registered inside 119 seconds
- Reviewer wallets created inside a 48 minute window
- First review 57 seconds after that wallet's first transaction
- Review gaps of 48 to 82 seconds
- The faucet has funded 7,665 wallets
- The 73 percent figure is arXiv 2606.26028, checked against the paper's
  own abstract

## Do not say

- "We caught fraudsters", or anything about scams
- "Proves the reviews are fake". It proves common funding, which is not
  the same thing and is stronger because it is provable
- Any number that isn't in the list above
