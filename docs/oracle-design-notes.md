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

## A prior exploration, and where it collides

Les worked the mechanic through with an LLM before this repo existed. The
transcript is a PDF in his Downloads (`fediverse-oracle-2.pdf`, 7pp) — not
committed here, because it embeds a private conversation URL, and because the
substance is below. Treat it as exploration, not specification: it was written
without knowing BotKit's constraints.

It proposes four phases:

1. **Invocation** — a public mention that matches an *invocation grammar*.
2. **Assignment** — the Oracle DMs the seeker someone else's queued question.
3. **Answer** — the seeker replies within the DM thread.
4. **Epiphany** — the Oracle publishes that answer as a **public reply
   attached to the original asker's post**.

Ideas in it worth keeping regardless of what the mechanic becomes:

- **Ceremony as a filter.** An invocation must match roughly
  `^(?:oh\s+)?(?:great|mighty|wise|omniscient|all-knowing|venerable)?\s*oracle\b[,:\-\s]+(?<query>.+)`.
  A mention that fails it MUST NOT enqueue a question and MUST NOT get a
  public reply; it may be dropped silently, or answered with a themed private
  rejection ("The Oracularity remains silent…"). This is a nice spam gate and
  it makes the bot feel like a rite rather than an API.
- **Anonymity is structural, not incidental.** The public answer MUST NOT tag,
  credit, or link the actor who wrote it. The answer is the Oracle's voice.
- **Strip mentions from both stored strings.** Otherwise re-posting a question
  or answer becomes a notification-amplification vector.
- **Context isolation.** A DM reply must never inherit the public post's
  `inReplyTo`, or a private answer can leak into a public thread graph.
- **A TTL on assignments**, so a question handed out and abandoned comes back.
- Optional extras: an admin approval step before publishing, and an instance
  blocklist.

**Phase 4 is exactly the case BotKit cannot do.** The public answer is meant to
thread under a question post that arrived in an *earlier* delivery — from a
different seeker, possibly hours ago. That is the threading gap above, and the
exploration leans on it hard: it calls in-thread context a core UX benefit,
"anyone following the original thread sees the answer appear naturally."

So the first design decision is unavoidable and the exploration cannot help
with it. Either the epiphany stops being a threaded reply, or `publish()` needs
an `inReplyTo` upstream. Worth noting the two constraints partly cancel: since
the answer must not credit its author anyway, a standalone post that quotes the
question and mentions only the original asker loses less than it first appears.

## Open questions

- Does the answer have to thread under the question? That single choice decides
  between the four options above, and the prior exploration assumes yes.
- Is the invocation grammar in or out? It is a good filter, but it also means
  most mentions get no reply, which reads as a broken bot to a first-time user.
- Does a question nobody answers time out, requeue, or hold forever? The
  exploration says TTL; nothing here implements one yet.
- One question per seeker at a time, or many?
- Does a seeker have to answer before asking again? The original Oracle traded
  an answer for a question, which is a nice forcing function and also a way to
  deadlock an empty queue.
- What seeds an empty queue? The first seeker has nobody else's question to
  receive.
- Is the Oracle a resident of this hostel, or its own instance? It is the only
  bot here with real state; keeping it beside five stateless ones is convenient
  but not obviously right.

## Where the evidence lives

The spike that established all of the above is on branch `botkit-spike` of
`~/devel/fediverse-oracle`, under `spike/botkit/`. `src/bots/oracle-probe.ts`
is a deliberately minimal three-seam probe — DM, correlate, publish — and its
test file records what is real versus faked. It is not a design; it is proof
the seams exist.
