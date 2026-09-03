# Gremlin Hostel development guide

## Commands

- **Install:** `npm install`
- **Check all:** `npm run check` (typecheck, lint, tests)
- **Tests:** `npm test` (native `node:test`)
- **Run:** `npm start` — see *README.md* for the environment that matters
- **Regenerate corpora:** `npm run gen-data`

*Rule: run `npm run check` before committing.*
*Rule: when fixing a bug, write a failing test that reproduces it before the fix.*
*Rule: tests must never write into `.data/`. Use `os.tmpdir()`.*
*Rule: never delete `.data/private` or `bot.db` — signing keys are a bot's identity and cannot be reconstructed.*

## Architecture

BotKit owns the ActivityPub edge; this repo owns the bots and their cadence.

- **`src/bots/contract.ts`** — what a bot is: identity, `Cadence`, `speak()`.
  Imports nothing local.
- **`src/bots/index.ts`** — the roster. Kept separate from the contract
  because a bot module importing the list that imports it back leaves the
  cadence constants uninitialized at module-evaluation time. That fails at
  import, not at a call site, so it is easy to misread.
- **`src/scheduler.ts`** — `decide()` is pure, so cadences are tested without
  a clock, a database, or a network. `runTicks()` wakes every bot once.
- **`src/app-db.ts`** — our SQLite, separate from BotKit's. Generic
  `bot_state` key/value; one bot's schema must not leak into another's.
- **`src/instance.ts`** — composes everything and serves. Avatars are
  intercepted before delegating to `instance.fetch()`.

## What BotKit gives us, and what it does not

Don't reimplement these — the previous incarnation of this project did, at
roughly twenty times the code:

- **Gives us:** actor documents, WebFinger, NodeInfo, outbox and follower
  collections, HTTP Signatures, inbound routing to the right bot, delivery
  and retries, web pages for profiles and posts, feeds, polls, quotes,
  reactions, custom emoji.
- **Does not give us:** a scheduler, or any store for application state.
  Both are ours, which is the pattern BotKit's own `examples/rss-bot` uses.

**Require `@fedify/botkit` ^0.5.3.** Earlier versions cannot federate with
GoToSocial in multi-bot mode: the instance actor had no WebFinger record, so
GTS rejected every request it signed. Fixed upstream in 0.5.3.

## Lessons carried over

These were each learned by watching a real instance refuse something.

- **Omit `icon` rather than advertise a broken one.** Some instances reject a
  profile whose icon cannot be fetched, so a 404ing icon is worse than none.
  `botIcon()` returns `undefined` when the origin is unknown; `magic8ball` has
  no avatar and correctly ships no icon.
- **GoToSocial runs in secure mode.** All outbound fetches must be signed, and
  a WebFinger endpoint must answer exactly `application/jrd+json`. BotKit
  handles both; the point is not to route around it.
- **Never answer a malformed activity with a 500.** It tells the sender to
  retry something that can never succeed. BotKit owns this now, but the
  instinct still applies to anything we add.
- **Delivery failures appear in the peer's log, not ours.** Local tests only
  prove the branch agrees with itself. Before believing a federation change
  works, exercise it against a real instance over a tunnel.
- **A bot cannot thread a reply under a message from an earlier delivery.**
  `message.reply()` needs the live `Message`; `publish()` has no `inReplyTo`
  and `Session` has no way to rehydrate one from a URI. This is the open
  constraint on the Oracle design.

## TypeScript

- No `as any` or `as unknown as X` to force types into line. Use type guards
  or proper interfaces. `@typescript-eslint/no-explicit-any` is an error.
- `noUncheckedIndexedAccess` is on, so indexing an array yields `T | undefined`.
  Prefer a `!` with an obvious in-bounds argument over widening the type.
- If bridging a rigid library type genuinely needs a cast, comment why it is safe.
