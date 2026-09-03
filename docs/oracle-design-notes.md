# Oracle design notes

Substrate for designing the Oracle bot: what the mechanic is, and what BotKit
will and will not do for a bot that answers in two phases. Written before the
design, so the design can argue with it.

Nothing here is a decision. The mechanic itself is open.

## The mechanic, as originally intended

Revive the [Usenet Oracle][] on the fediverse. A seeker mentions the Oracle
with a question; the Oracle privately hands them *someone else's* queued
question; when they answer, the Oracle publishes the pair publicly.

[Usenet Oracle]: https://en.wikipedia.org/wiki/Internet_Oracle

That shape is what makes the Oracle different from every other resident of
this hostel. The other five are stateless: mention in, utterance out, nothing
remembered. The Oracle is:

- **stateful** — a queue of unanswered questions, and who holds which
- **two-phase** — the question arrives in one delivery, the answer in another,
  possibly hours later and possibly in a different process
- **a matchmaker** — assignment is a read-modify-write over shared state, and
  two seekers arriving at once must not receive the same question

Everything below is about those three properties.

## What BotKit gives you

Verified against 0.5.3, by a spike that ran against a live GoToSocial instance.

**Direct messages work.** `session.publish(content, { visibility: 'direct' })`
produces a genuine DM — addressed to the recipient, not to the Public
collection — and returns an `AuthorizedMessage` whose `id` you can store.

**Correlating a later delivery works.** An inbound reply carries
`message.replyTarget`, resolved from `replyTargetId`. `bot.onReply` fires only
when the reply target is a local object belonging to *this* bot, so storing the
DM's URI and matching it later is the intended path.

**Application state is yours.** BotKit's `Repository` is closed — keys,
messages, followers, follows, quote authorizations, poll votes, and nothing
generic. There is no per-bot KV. Put Oracle state in `src/app-db.ts` alongside
`bot_state`, which is the split BotKit's own `examples/rss-bot` uses.

## What BotKit will not do

### The threading gap

**A bot cannot publish a reply threaded under a message from an earlier
delivery.** This is the constraint most likely to shape the design.

`message.reply()` is the only way to set `inReplyTo`, and it needs the live
`Message` object from the delivery being handled. For the Oracle, the question
arrived in an *earlier* delivery. Every route back is closed:

- `SessionPublishOptions` has no `inReplyTo`
- `Session` has no `getMessage(uri)`; `getOutbox()` only walks the bot's own posts
- `createMessage()` is internal — not in the npm package's `exports` map

So the public answer cannot appear under the original question. It has to be a
standalone post that mentions the asker. Options, none chosen:

1. **Accept it.** The answer mentions the seeker and quotes the question inline.
   Loses thread context in a client; simplest by far.
2. **Answer while the delivery is live.** Restructure so the public post happens
   during the delivery that carries the answer, threading under the *answer*
   rather than the question. Changes the mechanic, not just the plumbing.
3. **Use a quote instead of a reply.** `publish()` accepts `quoteTarget`, which
   also needs a live `Message` — so this only helps if the target is in hand.
4. **Contribute `inReplyTo` upstream.** An `inReplyTo` option on `publish()`
   would resolve it. BotKit took a fix from this project before
   ([#46](https://github.com/fedify-dev/botkit/pull/46)), so this is a real
   option, not a fantasy.

`src/interop.test.ts` in the `botkit-spike` branch of `fediverse-oracle`
asserts this limitation, so it will fail loudly if a future BotKit fixes it.

### No transaction spanning BotKit's writes

BotKit calls its repository around your handler, so its writes cannot join a
transaction of yours. Whatever the Oracle stores, the ordering is at-least-once:
do the side effect, then mark it done.

Concretely, from the spike's probe: a DM's URI does not exist until BotKit mints
it, so the correlation key is a second write *after* `publish()` returns. Crash
in between and you have a sent DM whose reply can never be matched. The spike
left a `findOrphans()` for exactly that and never reconciled it.

`examples/rss-bot` accepts the same trade — it marks an item posted after
publishing it.

> **Superseded note.** An earlier design memo weighed a two-phase commit
> against an async SQLite driver, to let `@fedify/vocab` own outbound
> serialization inside a synchronous authority transaction. That premise is
> gone: there is no authority transaction any more, because BotKit owns
> outbound serialization and delivery. What survives is the narrower problem
> below.

### Assignment needs atomicity, but only in our own store

Handing one queued question to exactly one seeker is a read-modify-write. Two
seekers arriving concurrently must not get the same question.

This is *easier* than it was under the old stack, not harder. The contested
state lives entirely in our SQLite, `node:sqlite` is synchronous, and a
`BEGIN IMMEDIATE` around select-then-claim is sufficient. No distributed
protocol, no compare-and-swap over BotKit's storage — because BotKit's storage
is not involved in the decision.

The one thing to keep out of that transaction is network I/O. If choosing an
assignee ever needs to resolve a remote actor, resolve it *before* opening the
transaction.

### `onReply` and `onMention` both fire

BotKit runs `onReply` and then falls through to mention handling in the same
pass (`bot-impl.ts` `#onCreatedOrUpdated`). A reply that mentions the bot hits
both handlers.

The obvious guard is wrong in a way that only shows under ordering: a lookup
scoped to `status = 'awaiting'` fails open on the second handler, because
`onReply` has already advanced the row. The spike's guard had this bug and a
test caught it. Make the guard status-agnostic.

## The prior exploration, and where it collides

Les worked the mechanic through with an LLM before this repo existed. It is kept
verbatim as [*oracle-exploration.md*](oracle-exploration.md) — read it, it is
the fullest statement of what the Oracle is *for*.

**It is musing out loud, not a spec.** It calls itself "FOP-01" and uses
RFC-style MUST / MUST NOT, which reads far more settled than it is; that is the
model's register, not a decision. Everything in it is open to change on
feasibility grounds, the mechanic included. This section records what happens
when its proposals meet the framework — not a verdict on any of them.

**What it proposes.** The reciprocal gate as the heart of the thing: delivery of
your answer is *conditioned* on you answering a stranger's question. Around
that, a pile of ideas that would each otherwise have to be invented — seeding a
cold start with synthetic questions, one active ticket per actor, a TTL on
assignments with silent reassignment, mention stripping, structural anonymity
(the public answer does not credit its author), and an invocation grammar as a
noise filter. All plausible, none costed.

**What collides.** §4.2 specifies the public answer as `inReplyTo` the original
question's post ID, and §Phase 4 calls in-thread context a core UX benefit:
"anyone following the original thread sees the answer appear naturally." That
question post arrived in an *earlier* delivery, from a different actor, so it is
exactly the case BotKit cannot serve. The exploration cannot help decide this,
because it did not know the constraint existed. See the threading gap above.

The two constraints do partly cancel: since the answer must not credit its
author anyway, a standalone post that quotes the question and mentions only the
original asker loses less than it first appears.

**What it corrects in this document.** An earlier draft of these notes said two
seekers arriving at once "must not receive the same question." The exploration
argues the opposite, and is probably right: *pool-based over-dispatch* hands the
same question to several seekers, first answer wins, the rest are stored as
alternates or dropped. That deliberately relaxes exactly-once, which makes the
assignment transaction easier rather than harder — it still needs to claim
atomically, but the claim is per-assignment, not exclusive over the question.

**What is obsolete in it.** It proposes "Mastodon Streaming API or raw
ActivityPub Inbox monitoring" for ingestion, a relational schema with UUID keys,
and generally assumes you own the federation edge. BotKit owns all of that now.
Its `questions` / `assignments` tables are still a reasonable starting shape for
`app.db`, but they are ours to keep, not a port.

**One nice detail that does work.** Phase 1 suggests favouriting the invoking
post to acknowledge receipt on the seeker's timeline. BotKit supports this —
`message.like()` — and it happens during the live delivery, so there is no
threading problem.

## Open questions

The exploration settles more than it leaves open. What is genuinely undecided:

- **Does the answer have to thread under the question?** The one decision
  nothing else can proceed without, and the only one the exploration assumes
  rather than argues. Everything above is context for it.
- **Is the invocation grammar in?** It is a good filter, and the friction is
  arguably the feature — but it means most mentions get no reply at all, which
  reads as a broken bot to a first-time user. The exploration offers a themed
  private rejection as the middle path.
- **Does the synthetic fallback exist?** If no human answers within a couple of
  hours, the exploration falls back to canned or LLM-generated wisdom. That
  keeps the loop alive at the cost of the whole premise being human-to-human.
- **Is over-dispatch worth it at this scale?** It solves starvation for a busy
  Oracle. With five followers it is machinery for a problem you do not have.
- **Is the Oracle a resident of this hostel, or its own instance?** It is the
  only bot here with real state, and the only one that needs an admin surface
  if answers are ever moderated before publishing.
- **Karma, proof-of-work, multilingual matching** — all proposed, all deferrable.
  Named here so they are decisions rather than omissions.

## Where the evidence lives

The spike that established all of the above is on branch `botkit-spike` of
`~/devel/fediverse-oracle`, under `spike/botkit/`. `src/bots/oracle-probe.ts`
is a deliberately minimal three-seam probe — DM, correlate, publish — and its
test file records what is real versus faked. It is not a design; it is proof
the seams exist.
