import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { openAppDb, readLastPostAtMs, writeLastPostAtMs } from './app-db.js';
import { BOTS, HOUR_MS, MINUTE_MS, type GremlinBot } from './bots/index.js';
import { decide, runTicks } from './scheduler.js';

const dbs: ReturnType<typeof openAppDb>[] = [];
after(() => dbs.forEach((db) => db.close()));

function tempDb() {
  const db = openAppDb(join(mkdtempSync(join(tmpdir(), 'gremlin-')), 'app.db'));
  dbs.push(db);
  return db;
}

test('a bot that never posts unprompted stays quiet, even when forced', () => {
  const cadence = { kind: 'never' } as const;
  assert.ok(!decide(cadence, { nowMs: 0, lastPostAtMs: null }).speak);
  assert.ok(!decide(cadence, { nowMs: 0, lastPostAtMs: null, forced: true }).speak);
});

test('a bot that has never posted speaks on its first wake-up', () => {
  for (const cadence of [
    { kind: 'every', intervalMs: 4 * HOUR_MS },
    { kind: 'random', minimumGapMs: 6 * HOUR_MS, probability: 0 },
  ] as const) {
    assert.ok(decide(cadence, { nowMs: 0, lastPostAtMs: null }).speak, cadence.kind);
  }
});

test('a fixed interval is measured from the last post, not from process start', () => {
  const cadence = { kind: 'every', intervalMs: 4 * HOUR_MS } as const;
  const lastPostAtMs = 1_000_000;
  // Restarting does not reset the clock: what matters is the stored marker.
  assert.ok(
    !decide(cadence, { nowMs: lastPostAtMs + 4 * HOUR_MS - 1, lastPostAtMs }).speak,
    'silent one millisecond early',
  );
  assert.ok(
    decide(cadence, { nowMs: lastPostAtMs + 4 * HOUR_MS, lastPostAtMs }).speak,
    'speaks once the interval has elapsed',
  );
});

test('a random cadence honours its minimum gap before rolling at all', () => {
  const cadence = { kind: 'random', minimumGapMs: 45 * MINUTE_MS, probability: 1 } as const;
  const lastPostAtMs = 1_000_000;
  // Probability 1 would always speak, so silence here proves the gap wins.
  assert.ok(
    !decide(cadence, { nowMs: lastPostAtMs + 44 * MINUTE_MS, lastPostAtMs }).speak,
    'inside the gap',
  );
  assert.ok(
    decide(cadence, { nowMs: lastPostAtMs + 45 * MINUTE_MS, lastPostAtMs }).speak,
    'past the gap',
  );
});

test('past the gap, the roll decides', () => {
  const cadence = { kind: 'random', minimumGapMs: 0, probability: 0.05 } as const;
  const args = { nowMs: 2_000_000, lastPostAtMs: 1_000_000 };
  assert.ok(decide(cadence, { ...args, random: () => 0.04 }).speak);
  assert.ok(!decide(cadence, { ...args, random: () => 0.05 }).speak, 'boundary is exclusive');
  assert.ok(!decide(cadence, { ...args, random: () => 0.99 }).speak);
});

test('forcing overrides the cadence but still records the post', async () => {
  const db = tempDb();
  const now = 5_000_000;
  const spoke = await runTicks(BOTS, {
    db,
    forced: true,
    nowMs: () => now,
    publish: async () => {},
  });
  // Every bot with a cadence posts; magic8ball has none to force.
  assert.deepStrictEqual([...spoke].sort(), [
    'catfacts',
    'complimentron2000',
    'insultron2000',
    'shrubot',
  ]);
  assert.equal(readLastPostAtMs(db, 'catfacts'), now);
  assert.equal(readLastPostAtMs(db, 'magic8ball'), null);
});

test('a quiet tick does not push the next post further away', async () => {
  const db = tempDb();
  const lastPostAtMs = 1_000_000;
  writeLastPostAtMs(db, 'insultron2000', lastPostAtMs);
  const only = BOTS.filter((bot) => bot.identifier === 'insultron2000');

  const spoke = await runTicks(only, {
    db,
    nowMs: () => lastPostAtMs + MINUTE_MS,
    publish: async () => {},
  });
  assert.deepStrictEqual(spoke, [], 'too soon to speak');
  assert.equal(readLastPostAtMs(db, 'insultron2000'), lastPostAtMs, 'marker untouched');
});

test('one bot failing does not stop the round', async () => {
  const db = tempDb();
  const messages: string[] = [];
  const bots: GremlinBot[] = BOTS.filter((bot) => bot.cadence.kind !== 'never');
  const spoke = await runTicks(bots, {
    db,
    forced: true,
    nowMs: () => 7_000_000,
    log: (message) => messages.push(message),
    publish: async (bot) => {
      if (bot.identifier === 'catfacts') throw new Error('delivery exploded');
    },
  });
  assert.ok(!spoke.includes('catfacts'), 'the failure is not recorded as a post');
  assert.equal(readLastPostAtMs(db, 'catfacts'), null, 'and leaves no marker to skip on');
  assert.equal(spoke.length, bots.length - 1, 'every other bot still spoke');
  assert.ok(messages.some((m) => m.includes('catfacts failed')));
});
