// The roster. Kept apart from the contract in *contract.ts* so a bot module
// can import `GremlinBot` and the cadence constants without importing the list
// that imports it back -- that cycle leaves the constants uninitialized at
// module-evaluation time, which fails at import rather than at a call site.

import { catfacts } from './catfacts/index.js';
import { complimentron2000 } from './complimentron2000/index.js';
import { insultron2000 } from './insultron2000/index.js';
import { magic8ball } from './magic8ball/index.js';
import { shrubot } from './shrubot/index.js';
import type { GremlinBot } from './contract.js';

export * from './contract.js';

export const BOTS: readonly GremlinBot[] = Object.freeze([
  magic8ball,
  catfacts,
  insultron2000,
  complimentron2000,
  shrubot,
]);
