import { serve } from '@hono/node-server';
import { type Bot, createInstance, text } from '@fedify/botkit';
import { SqliteRepository } from '@fedify/botkit-sqlite';
import { MemoryKvStore } from '@fedify/fedify/federation';
import { mkdirSync } from 'node:fs';
import { openAppDb } from './app-db.js';
import { serveAvatar } from './avatars.js';
import { BOTS } from './bots/index.js';
import { botIcon, loadConfig } from './config.js';
import { runTicks } from './scheduler.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });

// Two databases, deliberately. bot.db is BotKit's -- keys, messages,
// followers. app.db is ours -- each bot's cadence state. The split is the one
// BotKit's own examples/rss-bot uses.
const repository = new SqliteRepository({ path: `${config.dataDir}/bot.db` });
const appDb = openAppDb(`${config.dataDir}/app.db`);

const instance = createInstance<void>({
  kv: new MemoryKvStore(),
  repository,
  behindProxy: config.behindProxy,
  software: { name: 'gremlin-hostel', version: '0.1.0' },
});

/** The BotKit handle for each gremlin, kept so the scheduler can publish. */
const handles = new Map<string, Bot<void>>();

for (const gremlin of BOTS) {
  gremlin.warmUp?.();
  const bot = instance.createBot(gremlin.identifier, {
    username: gremlin.username,
    name: gremlin.name,
    summary: text`${gremlin.summary}`,
    icon: botIcon(config, gremlin.identifier, gremlin.hasAvatar),
  });
  // One voice: a mention and a scheduled post use the same generator.
  bot.onMention = async (_session, message) => {
    await message.reply(gremlin.speak());
  };
  handles.set(gremlin.identifier, bot);
}

// ---------------------------------------------------------------- scheduling

let ticking = false;

async function tickOnce(forced = false): Promise<void> {
  // One round at a time, so a slow round cannot overlap the next.
  if (ticking) return;
  ticking = true;
  try {
    await runTicks(BOTS, {
      db: appDb,
      forced,
      log: (message) => console.log(`[tick] ${message}`),
      publish: async (gremlin) => {
        if (config.origin == null) {
          throw new Error('ORIGIN is unset, so a scheduled post would have unreachable IDs');
        }
        const handle = handles.get(gremlin.identifier);
        if (handle == null) throw new Error(`no handle for ${gremlin.identifier}`);
        const session = handle.getSession(config.origin, undefined);
        await session.publish(gremlin.speak(), { visibility: 'public' });
      },
    });
  } finally {
    ticking = false;
  }
}

// ------------------------------------------------------------------- serving

// Reports the origin actually in use, on the first request. BotKit has no
// DOMAIN setting -- it derives the origin per request -- so the usual failure
// is not a missing config but a forgotten `behindProxy`, which federates every
// ID under http://localhost where no peer can reach it.
let originReported = false;
function reportOrigin(request: Request): void {
  if (originReported) return;
  originReported = true;
  const direct = new URL(request.url);
  const headers = request.headers;
  const proto =
    (config.behindProxy ? headers.get('x-forwarded-proto') : null) ??
    direct.protocol.replace(':', '');
  const host =
    (config.behindProxy ? (headers.get('x-forwarded-host') ?? headers.get('host')) : null) ??
    direct.host;
  console.log(`Federating as ${proto}://${host}`);
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    console.warn(
      `  WARNING: no peer can reach that origin.\n` +
        `  Behind a tunnel? Set BEHIND_PROXY=true (currently ${config.behindProxy}).`,
    );
  }
  if (config.origin == null) {
    console.warn(`  NOTE: ORIGIN is unset, so bots have no avatar and cannot post on a timer.`);
  }
}

console.log(
  `Gremlin Hostel: ${BOTS.length} bots on :${config.port} ` +
    `(behindProxy=${config.behindProxy}, tick=${config.tickIntervalMs}ms)`,
);

serve({
  port: config.port,
  fetch: async (request: Request) => {
    reportOrigin(request);
    return (await serveAvatar(new URL(request.url))) ?? (await instance.fetch(request));
  },
});

if (config.origin != null) {
  setInterval(() => void tickOnce(), config.tickIntervalMs);
}

export { instance, tickOnce };
