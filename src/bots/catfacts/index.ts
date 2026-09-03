import { em, text } from '@fedify/botkit';
import { type GremlinBot, MINUTE_MS } from '../contract.js';
import { CAT_FACTS } from './cat-facts.data.js';

export function pick(random: () => number = Math.random): string {
  return CAT_FACTS[Math.floor(random() * CAT_FACTS.length)]!;
}

export const catfacts: GremlinBot = {
  identifier: 'catfacts',
  username: 'catfacts',
  name: 'CatFacts',
  summary: 'Cat facts delivered automatically. Mention me for a random cat fact!',
  hasAvatar: true,
  // The chattiest of the lot: unpredictable, never twice within 45 minutes,
  // averaging roughly one an hour.
  cadence: { kind: 'random', minimumGapMs: 45 * MINUTE_MS, probability: 0.05 },
  speak: () => text`🐱 ${em(pick())}`,
};
