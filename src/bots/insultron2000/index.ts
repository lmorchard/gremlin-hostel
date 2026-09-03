import { em, text } from '@fedify/botkit';
import { type GremlinBot, HOUR_MS } from '../contract.js';
import { SHAKESPEARE_COLUMNS } from './shakespeare.data.js';

export function compose(random: () => number = Math.random): string {
  const parts = SHAKESPEARE_COLUMNS.map((column) => column[Math.floor(random() * column.length)]!);
  return `Thou ${parts[0]} ${parts[1]} ${parts[2]}.`;
}

export const insultron2000: GremlinBot = {
  identifier: 'insultron2000',
  username: 'insultron2000',
  name: 'Insultron2000',
  summary: 'I am Insultron2000. Mention me for automatic insult service!',
  hasAvatar: true,
  // Shares Complimentron's rhythm; their own last-post times keep the two
  // from speaking in lockstep.
  cadence: { kind: 'every', intervalMs: 4 * HOUR_MS },
  speak: () => text`🎭 ${em(compose())}`,
};
