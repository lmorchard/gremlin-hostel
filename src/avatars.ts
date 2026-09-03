import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where each bot's static assets live, resolved from this module rather than
 * counted in `..` hops from a caller.
 *
 * A renderer that walked up from its own directory got this wrong once
 * already: profiles advertised an icon URL that answered 404, which is
 * invisible locally and shows up only as a missing avatar on a peer.
 */
const BOTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'bots');

const AVATAR_PATH = /^\/avatars\/([a-z0-9_-]+)\.png$/;

/**
 * Serves `/avatars/<botId>.png`, or `null` when the path is not an avatar
 * request, so the caller can fall through to BotKit.
 */
export async function serveAvatar(url: URL): Promise<Response | null> {
  const match = AVATAR_PATH.exec(url.pathname);
  if (match == null) return null;
  // The pattern already excludes separators and dots, so the identifier
  // cannot escape BOTS_DIR.
  const file = join(BOTS_DIR, match[1]!, 'avatar.png');
  try {
    const data = await readFile(file);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
