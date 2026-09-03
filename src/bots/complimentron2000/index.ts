import { em, text } from '@fedify/botkit';
import { type GremlinBot, HOUR_MS } from '../contract.js';
import { SHAKESPEARE_COLUMNS } from './shakespeare.data.js';

export function compose(random: () => number = Math.random): string {
  const parts = SHAKESPEARE_COLUMNS.map((column) => column[Math.floor(random() * column.length)]!);
  return `Thou ${parts[0]} ${parts[1]} ${parts[2]}.`;
}

export const complimentron2000: GremlinBot = {
  identifier: 'complimentron2000',
  username: 'complimentron2000',
  name: 'Complimentron2000',
  summary: 'I am Complimentron2000. Mention me for automatic compliment service!',
  hasAvatar: true,
  cadence: { kind: 'every', intervalMs: 4 * HOUR_MS },
  speak: () => text`🌻 ${em(compose())}`,
};
