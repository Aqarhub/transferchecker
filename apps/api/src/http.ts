// Reading a request and writing an answer, with the two limits that are not
// optional and the headers that are not decoration.
//
// NO FRAMEWORK, AND THAT IS A DECISION RATHER THAN AN OMISSION. This server has
// eight routes and needs a method, a path, a JSON body and a status code.
// Node's own HTTP server provides all four, and a framework would add a
// dependency tree to the one process that holds every password hash in the
// product. The routing that a framework would do is thirty lines below.

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The largest body this server will read, in bytes.
 *
 * NOT A TUNING KNOB. Node hands the body over in chunks and will happily hand
 * over gigabytes, so a server that reads until the stream ends can be stopped by
 * one client with a slow, endless upload. Every request here is a small JSON
 * object; sixteen kilobytes is generous for the largest of them.
 */
export const MAX_BODY_BYTES = 16 * 1024;

export type BodyResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly why: 'too-large' | 'aborted' };

/** The body, or a refusal. Never an unbounded read. */
export async function readBody(request: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += bytes.length;
      if (size > MAX_BODY_BYTES) {
        // PAUSED RATHER THAN DESTROYED, and the difference is the whole answer.
        // Destroying the socket here does refuse the request, and it refuses it
        // by closing the connection before the reply is written, so the client
        // sees a reset rather than a 413 and cannot tell a limit from a crash.
        // [measured] `fetch` reports "other side closed" and no status at all.
        // Reading stops here; the caller writes the refusal and closes after it.
        request.pause();
        return { ok: false, why: 'too-large' };
      }
      chunks.push(bytes);
    }
  } catch {
    return { ok: false, why: 'aborted' };
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

/** JSON, or nothing. A malformed body is a 400 rather than a thrown error. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A form body, for the one page a person submits without JavaScript. */
export function parseForm(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) fields[key] = value;
  return fields;
}

/**
 * The headers every answer carries, and why each one is here.
 *
 * `no-referrer` is the one that matters most on this server: the confirmation
 * page carries a secret in its query string, and without this the browser hands
 * that secret to whatever the page links to or loads.
 *
 * `no-store` because every response here is either a token, an answer about an
 * account, or a page holding a link secret. None of it may sit in a cache, and
 * a shared cache in front of this server would otherwise be free to keep it.
 */
export const SAFE_HEADERS: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  // The page loads nothing at all, so the policy says exactly that. A page that
  // fetches nothing cannot leak a token to anybody through a request.
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
};

/**
 * Answers and then closes, for a request whose body was never fully read.
 *
 * The connection cannot be reused: the rest of the body is still arriving on it
 * and nothing is going to consume it. Saying so in the header is what lets the
 * client read the reply first and treat the close as expected.
 */
export function sendAndClose(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.on('finish', () => {
    request.destroy();
  });
  sendJson(response, status, body, { Connection: 'close' });
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  extra: Readonly<Record<string, string>> = {},
): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    ...SAFE_HEADERS,
    ...extra,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  response.end(text);
}

export function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    ...SAFE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  response.end(html);
}

/**
 * Which address to rate limit, when the server sits behind a load balancer.
 *
 * `X-Forwarded-For` IS ATTACKER CONTROLLED and this is where that is handled.
 * The header is a list that each hop appends to, so the entries a client wrote
 * itself are on the LEFT and the ones our own infrastructure wrote are on the
 * RIGHT. Reading the first entry, which is the obvious thing to do and what most
 * examples show, lets anybody set their own address and step around every limit
 * on this server by changing one header.
 *
 * So the address is counted `hops` from the right, where `hops` is how many
 * proxies of ours the request really passes through. Zero means no proxy is
 * trusted at all and the socket decides, which is the correct default: a server
 * that trusts a header nobody is writing is a server with no rate limit.
 */
export function clientAddress(request: IncomingMessage, hops: number): string {
  const direct = request.socket.remoteAddress ?? 'unknown';
  if (hops <= 0) return direct;

  const header = request.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  // One hop means the last entry, which our own nearest proxy wrote.
  const index = forwarded.length - hops;
  return forwarded[index] ?? direct;
}
