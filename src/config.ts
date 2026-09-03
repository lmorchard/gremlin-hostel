import { MINUTE_MS } from './bots/contract.js';

export interface Config {
  readonly port: number;
  readonly dataDir: string;
  readonly behindProxy: boolean;
  /**
   * Absolute origin, used *only* to build avatar URLs.
   *
   * BotKit derives everything else from each request, so unlike a DOMAIN
   * setting this is not load-bearing for federation. It is needed here because
   * a bot's `icon` is an absolute URL fixed when the bot is created, before
   * any request has arrived. When it is unset the bots simply have no icon --
   * see `botIcon` for why that is the safe default rather than guessing.
   */
  readonly origin: string | null;
  readonly tickIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawInterval = Number(env.TICK_INTERVAL_MS);
  return {
    port: Number(env.PORT ?? 8080),
    dataDir: env.DATA_DIR ?? '.data',
    behindProxy: env.BEHIND_PROXY === 'true',
    origin: env.ORIGIN?.replace(/\/+$/, '') || null,
    tickIntervalMs: Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : MINUTE_MS,
  };
}

/**
 * A bot's avatar URL, or `undefined` when the origin is unknown.
 *
 * Deliberately omits the icon rather than guessing at an origin: some
 * instances reject a profile whose icon cannot be fetched, so an icon that
 * 404s is worse than no icon at all. That failure is invisible locally and
 * shows up only as a broken avatar on someone else's server.
 */
export function botIcon(config: Config, botId: string, hasAvatar: boolean): URL | undefined {
  if (!hasAvatar || config.origin == null) return undefined;
  return new URL(`/avatars/${botId}.png`, config.origin);
}
