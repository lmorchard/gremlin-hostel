import { em, text } from '@fedify/botkit';
import type { GremlinBot } from '../contract.js';
import { ANSWERS } from './answers.data.js';

export function pick(random: () => number = Math.random): string {
  return ANSWERS[Math.floor(random() * ANSWERS.length)]!;
}

export const magic8ball: GremlinBot = {
  identifier: 'magic8ball',
  username: 'magic8ball',
  name: 'The Magic 8-Ball',
  summary: 'Mention me with a yes or no question, and I will reveal your future.',
  hasAvatar: false,
  // Answers when asked, and otherwise keeps its own counsel.
  cadence: { kind: 'never' },
  speak: () => text`🎱 ${em(pick())}`,
};
