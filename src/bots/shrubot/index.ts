import { em, text } from '@fedify/botkit';
import { type GremlinBot, HOUR_MS } from '../contract.js';
import { MARKOV_DATA } from './markov.data.js';
import { MarkovGeneratorWord } from './markovword.js';

let generator: MarkovGeneratorWord | null = null;

/**
 * Builds the chain once and keeps it. It is a few thousand lines of corpus, so
 * the cost is worth paying at startup rather than on the first mention -- see
 * `warmUp` below.
 */
function chain(): MarkovGeneratorWord {
  if (generator == null) {
    const built = new MarkovGeneratorWord(1, 9);
    built.fromData(MARKOV_DATA);
    generator = built;
  }
  return generator;
}

export function compose(random: () => number = Math.random): string {
  const built = chain();
  const lineCount = 3 + Math.floor(random() * 5);
  const lines: string[] = [];
  for (let line = 0; line < lineCount; line += 1) lines.push(built.generate());
  // A single newline renders as <br>, which keeps a stanza in one paragraph.
  return lines.join('\n');
}

export const shrubot: GremlinBot = {
  identifier: 'shrubot',
  username: 'shrubot',
  name: 'ShruBot',
  summary: 'I fell into a vat of Canadian rock lyrics and have been inspired to write!',
  hasAvatar: true,
  // Lyrics land rarely and without warning: at most once every six hours,
  // and usually a good deal less often.
  cadence: { kind: 'random', minimumGapMs: 6 * HOUR_MS, probability: 0.02 },
  speak: () => text`🎸 ${em(compose())}`,
  warmUp: () => void chain(),
};
