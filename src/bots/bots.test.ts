import { createInstance } from '@fedify/botkit';
import { MemoryKvStore } from '@fedify/fedify/federation';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOTS } from './index.js';

/** Renders a bot's utterance to HTML, the way BotKit will when publishing. */
async function render(html: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of html) out += chunk;
  return out;
}

test('the roster is internally consistent', () => {
  const identifiers = new Set<string>();
  const usernames = new Set<string>();
  for (const bot of BOTS) {
    assert.ok(!identifiers.has(bot.identifier), `duplicate identifier ${bot.identifier}`);
    assert.ok(!usernames.has(bot.username.toLowerCase()), `duplicate username ${bot.username}`);
    identifiers.add(bot.identifier);
    usernames.add(bot.username.toLowerCase());
    assert.match(bot.identifier, /^[a-z0-9_-]+$/, `${bot.identifier} is URL-safe`);
    assert.ok(bot.name.length > 0 && bot.summary.length > 0, `${bot.identifier} is described`);
  }
});

test('every bot has something to say, and it survives rendering', async () => {
  for (const bot of BOTS) {
    bot.warmUp?.();
    const html = await render(bot.speak().getHtml({} as never));
    assert.ok(html.startsWith('<p>') && html.endsWith('</p>'), `${bot.identifier}: ${html}`);
    // Strip the markup and the leading emoji; there must be real text left.
    const words = html.replace(/<[^>]+>/g, '').trim();
    assert.ok(words.length > 3, `${bot.identifier} said nothing much: ${html}`);
  }
});

test('shrubot writes several lines in one stanza', async () => {
  const bot = BOTS.find((b) => b.identifier === 'shrubot')!;
  bot.warmUp?.();
  const html = await render(bot.speak().getHtml({} as never));
  // A single newline renders as <br>, so the stanza stays one paragraph.
  assert.ok(html.includes('<br>'), `expected line breaks: ${html}`);
  assert.equal(html.match(/<p>/g)?.length, 1, 'one paragraph, not one per line');
});

test('the roster registers on an instance without collisions', () => {
  const instance = createInstance<void>({ kv: new MemoryKvStore() });
  for (const bot of BOTS) {
    instance.createBot(bot.identifier, { username: bot.username, name: bot.name });
  }
  // BotKit reserves the instance actor's name; a roster that collided with it
  // would throw here rather than at first federation.
  assert.equal(BOTS.length, 5);
});
