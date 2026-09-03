import type { Text } from '@fedify/botkit';

/**
 * How often a bot speaks without being spoken to.
 *
 * Cadence belongs to the bot, not to the runtime. The scheduler wakes every
 * bot on a short uniform interval; each one decides from its own last post
 * whether this is the moment. Changing the wake rate only bounds how
 * precisely a bot can keep its schedule -- it does not change how often a bot
 * speaks.
 */
export type Cadence =
  | { readonly kind: 'never' }
  /**
   * At most once per `intervalMs`, measured from this bot's own last post
   * rather than from process start, so restarts and quiet ticks do not shift
   * the schedule.
   */
  | { readonly kind: 'every'; readonly intervalMs: number }
  /**
   * Unpredictable, but never twice within `minimumGapMs`. The probability
   * applies per wake-up once that gap has passed, so the expected wait is
   * `minimumGapMs` plus roughly `1 / probability` ticks.
   */
  | {
      readonly kind: 'random';
      readonly minimumGapMs: number;
      readonly probability: number;
    };

export interface GremlinBot {
  /** Stable, and baked into every URI this bot ever publishes. Do not change. */
  readonly identifier: string;
  /** The handle half of `@username@domain`. */
  readonly username: string;
  readonly name: string;
  readonly summary: string;
  /** Whether an `avatar.png` sits beside this bot's module. */
  readonly hasAvatar: boolean;
  readonly cadence: Cadence;
  /**
   * One utterance. The same generator serves both a reply to a mention and a
   * scheduled post, so a bot only ever has one voice.
   */
  speak(): Text<'block', void>;
  /** Optional one-time warm-up, for a bot with a corpus to build. */
  warmUp?(): void;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
