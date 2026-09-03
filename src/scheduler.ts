import type { DatabaseSync } from 'node:sqlite';
import type { Cadence, GremlinBot } from './bots/contract.js';
import { readLastPostAtMs, writeLastPostAtMs } from './app-db.js';

export interface TickDecision {
  readonly speak: boolean;
  readonly reason: string;
}

/**
 * Whether a bot should speak on this wake-up. Pure, so the cadences can be
 * tested without a clock, a database, or a network.
 */
export function decide(
  cadence: Cadence,
  options: {
    readonly nowMs: number;
    readonly lastPostAtMs: number | null;
    readonly random?: () => number;
    readonly forced?: boolean;
  },
): TickDecision {
  const { nowMs, lastPostAtMs, random = Math.random, forced = false } = options;

  // `--force` is an operator asking for a real post, so it overrides the
  // cadence -- but not a bot that never posts unprompted, which has no
  // scheduled voice to force.
  if (cadence.kind === 'never') return { speak: false, reason: 'never posts unprompted' };
  if (forced) return { speak: true, reason: 'forced' };

  // A bot that has never posted says something on its first wake-up.
  if (lastPostAtMs == null) return { speak: true, reason: 'first post' };

  const elapsed = nowMs - lastPostAtMs;
  if (cadence.kind === 'every') {
    return elapsed >= cadence.intervalMs
      ? { speak: true, reason: 'interval elapsed' }
      : { speak: false, reason: 'too soon' };
  }
  if (elapsed < cadence.minimumGapMs) return { speak: false, reason: 'inside minimum gap' };
  return random() < cadence.probability
    ? { speak: true, reason: 'won the roll' }
    : { speak: false, reason: 'lost the roll' };
}

export interface TickDeps {
  readonly db: DatabaseSync;
  /** Publishes one public post for the bot, and resolves once it is stored. */
  publish(bot: GremlinBot): Promise<void>;
  readonly nowMs?: () => number;
  readonly random?: () => number;
  readonly forced?: boolean;
  readonly log?: (message: string) => void;
}

/**
 * Wakes every bot once. One bot's failure is logged and does not stop the
 * round.
 *
 * The last-post marker is written *after* the publish resolves, so a crash in
 * between costs a duplicate post rather than a silent gap. BotKit owns its own
 * writes, so there is no transaction to enrol them in -- this is the same
 * at-least-once trade its own examples/rss-bot makes.
 */
export async function runTicks(
  bots: readonly GremlinBot[],
  deps: TickDeps,
): Promise<readonly string[]> {
  const { db, publish, nowMs = Date.now, random = Math.random, forced = false, log } = deps;
  const spoke: string[] = [];
  for (const bot of bots) {
    try {
      const now = nowMs();
      const decision = decide(bot.cadence, {
        nowMs: now,
        lastPostAtMs: readLastPostAtMs(db, bot.identifier),
        random,
        forced,
      });
      if (!decision.speak) continue;
      await publish(bot);
      writeLastPostAtMs(db, bot.identifier, now);
      spoke.push(bot.identifier);
      log?.(`${bot.identifier} posted (${decision.reason})`);
    } catch (error) {
      log?.(`${bot.identifier} failed to post: ${String(error)}`);
    }
  }
  return spoke;
}
