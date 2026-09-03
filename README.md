# Gremlin Hostel

A small hostel for fediverse gremlins: five ActivityPub bots sharing one
origin, built on [BotKit].

```bash
npm install
npm run check      # typecheck, lint, tests
npm start          # serves on :8080
```

[BotKit]: https://botkit.fedify.dev/

## The residents

| Handle | Speaks when mentioned | Speaks unprompted |
| --- | --- | --- |
| `@magic8ball` | a classic 8-ball answer | never |
| `@catfacts` | a random cat fact | randomly, never twice in 45 min |
| `@insultron2000` | a three-column Shakespearean insult | every 4 hours |
| `@complimentron2000` | a three-column Shakespearean compliment | every 4 hours |
| `@shrubot` | Markov-chained Canadian rock lyrics | randomly, never twice in 6 hours |

Each bot has exactly one voice: the same generator answers a mention and
writes a scheduled post. A bot is a small object — identity, cadence, and a
`speak()` — declared in *src/bots/&lt;id&gt;/index.ts* and listed in
*src/bots/index.ts*.

## Configuration

Everything is optional, but two settings matter.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | |
| `DATA_DIR` | `.data` | holds both SQLite files |
| `BEHIND_PROXY` | `false` | **set this behind a tunnel or reverse proxy** |
| `ORIGIN` | unset | required for avatars and scheduled posts |
| `TICK_INTERVAL_MS` | `60000` | how often bots are *offered* a turn |

**`BEHIND_PROXY` is the one that bites.** BotKit has no domain setting — it
derives the origin from each request — so a forgotten `behindProxy` federates
every published ID under `http://localhost`, where no peer can reach it, and
activity IDs are permanent once published. The first log line states the
origin actually in use, and warns if it is a loopback address. Check it before
letting the bots post:

```
Federating as https://gremlins.sish.decafbad.com
```

**`ORIGIN` is only needed for the two things that cannot be derived per
request:** a bot's `icon`, which is fixed when the bot is created, and a
scheduled post, which has no incoming request to derive an origin from. With
it unset, bots serve fine and answer mentions, but have no avatar and the
timer does not run.

`TICK_INTERVAL_MS` is a wake-up rate, not a posting rate. Cadence belongs to
the bot: each one decides from its own last post whether this is the moment,
so changing this only bounds how precisely a bot can keep its schedule.

## Testing against a real instance

```bash
npm run tunnel                                    # terminal 1
BEHIND_PROXY=true ORIGIN=https://<subdomain>.sish.decafbad.com \
  npm start                                       # terminal 2
```

`tunnel` expands to `ssh -R gremlins:80:localhost:8080 -p 2222
sish.decafbad.com`; override with `SISH_SUBDOMAIN` and `PORT`.

Then follow and mention a bot from a real instance. Delivery failures show up
in the *peer's* log, not this one.

## Storage

Two SQLite files under `DATA_DIR`, with a firm line between them:

- **`bot.db`** is BotKit's, via `@fedify/botkit-sqlite`: signing keys,
  messages, followers. Its schema is its business.
- **`app.db`** is ours: a generic `bot_state` key/value table, currently
  holding only each bot's last scheduled post.

**Signing keys are the only state that cannot be reconstructed.** They are a
bot's identity, and peers cache the public half, so a bot that loses its key
becomes a new account to the rest of the network. Back up `bot.db`.

`bot_state` is generic on purpose. One bot's schema leaking into every other
bot's storage is a mistake worth not repeating.

## Corpora

Each bot's word lists are committed as generated `*.data.ts` beside a source
`*.txt` or `*.json` and a `gen-data.ts` that produces one from the other:

```bash
npm run gen-data
```

The generated files are `.prettierignore`d and eslint-ignored — they are
build output, not source. *magic8ball/answers.data.ts* is the exception: the
twenty canonical answers are hand-maintained, with no generator.

## What is not here yet

The Oracle. This repo is the roster extracted from an earlier hand-rolled
Fedify stack; the Oracle bot that project was named for is being redesigned
rather than ported.

One BotKit constraint shapes that design: **a bot cannot publish a reply
threaded under a message from an earlier delivery.** `message.reply()` is the
only way to set `inReplyTo` and it needs the live `Message` from the delivery
in hand. For a two-phase bot — question now, public answer later — the answer
has to be a standalone post that mentions the asker, unless BotKit gains an
`inReplyTo` option on `publish()`.
