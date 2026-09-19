# Video scripts

Two scripts for the two required submission videos. Both assume the
judge-facing web page and live indexer are working by filming time — do
not record the technical demo until that's confirmed, since it needs the
real product on screen, not slides.

## Technical demo video (max 3 minutes)

Rule from the submission requirements: must show the live working
product, not slides or a code walkthrough. Screen-record the actual site.

**[0:00–0:15] Open on the Home page.**
"This is Headwater. It checks whether an AI agent's reviews on Monad are
real, or whether they're coming from one person pretending to be many
reviewers."

Point at the stat row. "It's reading live from Monad mainnet right now —
250-plus registered agents, three fraud-detection signals running
continuously."

**[0:15–0:45] Scroll to the live finding on the Home page.**
"Here's something it actually found, not a staged example. Five different
reviewer wallets all reviewing the exact same six agents. On its own,
that's not proof of anything — a real person can review several products.
But it's the exact pattern the tool is built to catch."

Click "Inspect this cluster."

**[0:45–2:00] On the Agent Lookup page.**
"This is the core of the product. Type in any agent ID, and it pulls the
real signal breakdown."

Type "153," click Check.

"Cross-agent overlap: triggered, five reviewer wallets, full detail.
Circular funding: clear, meaning none of these wallets have paid each
other back in a loop. Funder fan-out: circumstantial, meaning one wallet
here behaves like an exchange, paying out to a lot of people, which is
normal and never counted as proof by itself. And a Nansen wallet-reputation
check on top of all of it."

"None of this is invented. It's reading Monad's real registries plus a
full-history funding index built on Envio, cross-checked against Nansen's
wallet-reputation data."

**[2:00–2:30] Scoreboard page.**
"Every claim this tool makes gets logged here, dated, and marked honestly.
Right now this finding is UNVALIDATED — meaning nothing outside the tool
has confirmed it yet. That's not a weaker way of saying true. It means
exactly what it says, and it only changes once something real checks it."

**[2:30–2:55] Methodology page.**
"And here's what's real, what's simplified, and what isn't built yet, all
in one place, because judges shouldn't have to dig for that."

**[2:55–3:00] Close.**
"Headwater. Real registries, real funding history, real honesty about
what it can and can't prove yet."

---

## Pitch video (max 2 minutes)

Rule: introduce the team, the problem, and why you're building it.

**[0:00–0:20] Who you are.**
"Hi, I'm [name]. I've spent [however long] building fraud-detection tools
for on-chain systems, and Headwater is the latest one, built for Monad."

**[0:20–0:55] The problem, stated plainly.**
"AI agents are starting to review each other on-chain now, under a
standard called ERC-8004. A real study looked at this across Ethereum,
BSC, and Base, and found that most of that review activity wasn't real
people. It was one person or one group pretending to be many independent
reviewers to fake an agent's reputation.

The one tool that already tries to catch this just checks how old a
reviewer's wallet is. That's easy to fake. It misses the actual pattern:
the same wallet reviewing agents it has no reason to know, or one wallet
quietly funding a bunch of 'independent' reviewers."

**[0:55–1:30] What Headwater does differently.**
"Headwater traces the money instead of trusting the review. It reads
Monad's real agent registry, builds a full funding history using Envio,
and checks every suspicious pattern against Nansen's wallet-reputation
data before it calls anything risky. And every claim it makes gets logged
publicly, honestly, whether it's confirmed or not."

**[1:30–1:50] Why this, why now.**
"If AI agents are going to pay each other and hire each other, the trust
signal between them needs to be real, not fakeable. That's not a feature
for one app. That's infrastructure the whole ecosystem needs underneath
it."

**[1:50–2:00] Close.**
"This is Headwater. Thanks for watching."
