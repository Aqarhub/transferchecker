// The HTTP shell: node:http, a dictionary of routes, and three hard limits.
//
// NO FRAMEWORK, AND THAT IS A DECISION, NOT A GAP. This repository writes its
// own xlsx container to avoid a dependency; an auth server's routing needs are
// a dictionary lookup and a JSON body, and every dependency here would sit on
// the most attacked path in the product. node:http does the actual protocol
// work either way.
//
// The three limits every request meets before any handler runs: the body is
// capped (a JSON parser fed a gigabyte is a denial of service), the body must
// parse as JSON when present, and unknown paths answer 404 with the same shape
// every other error has. Handlers return data; only this file touches sockets.
//
// LOGS CARRY NO PERSON. Method, path, status, milliseconds. Never a body,
// never a header, never a query string: paths here are fixed strings, and the
// one endpoint that ever held a secret in a URL was not built for that reason.

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

// Sized by the sync batch, the largest legitimate request in the product: a
// hundred scans with two strings apiece lands well under this, and everything
// auth-shaped is a hundred times smaller.
export const BODY_LIMIT = 256 * 1024;

export interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface Request {
  readonly body: unknown;
  /** The Authorization header, verbatim, or undefined. The only header read. */
  readonly authorization?: string;
  /** The query string, parsed. Handlers read named values, never the raw URL. */
  readonly query: URLSearchParams;
}

export type Handler = (request: Request) => Promise<Reply>;

export interface AppOptions {
  readonly routes: Readonly<Record<string, Handler>>;
  readonly log: (line: string) => void;
}

class TooLarge extends Error {}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    request.on('data', (part: Buffer) => {
      size += part.length;
      if (size > BODY_LIMIT) {
        // Refused, not severed: destroying the socket here loses the 413 that
        // is already owed, so the rest of the body is drained and ignored and
        // the response goes out on an intact connection.
        parts.length = 0;
        request.removeAllListeners('data');
        request.resume();
        reject(new TooLarge());
        return;
      }
      parts.push(part);
    });
    request.on('end', () => {
      resolve(Buffer.concat(parts));
    });
    request.on('error', reject);
  });
}

/**
 * Builds the server without binding it, so tests listen on port zero and the
 * real boot listens where the environment says.
 */
export function app(options: AppOptions): Server {
  return createServer((incoming: IncomingMessage, outgoing: ServerResponse) => {
    const started = process.hrtime.bigint();
    const [path = '', rawQuery = ''] = (incoming.url ?? '').split('?');
    const route = `${incoming.method ?? ''} ${path}`;

    const reply = (result: Reply): void => {
      const body = JSON.stringify(result.body);
      outgoing.writeHead(result.status, {
        'content-type': 'application/json; charset=utf-8',
        // An auth response is for the caller it answered, nobody in between.
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      outgoing.end(body);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      options.log(`${route} ${String(result.status)} ${ms.toFixed(1)}ms`);
    };

    const handler = options.routes[route];
    if (handler === undefined) {
      reply({ status: 404, body: { error: 'not-found' } });
      return;
    }

    void (async () => {
      let raw: Buffer;
      try {
        raw = await readBody(incoming);
      } catch (error) {
        reply(
          error instanceof TooLarge
            ? { status: 413, body: { error: 'body-too-large' } }
            : { status: 400, body: { error: 'unreadable-body' } },
        );
        return;
      }

      let body: unknown;
      try {
        body = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8'));
      } catch {
        reply({ status: 400, body: { error: 'malformed-json' } });
        return;
      }

      try {
        const header = incoming.headers.authorization;
        reply(
          await handler({
            body,
            query: new URLSearchParams(rawQuery),
            ...(header === undefined ? {} : { authorization: header }),
          }),
        );
      } catch (error) {
        // The one place an exception becomes a response. Nothing about the
        // error reaches the client; the class name reaches the log, which is
        // enough to find it and carries nobody's data.
        options.log(`${route} 500 ${error instanceof Error ? error.constructor.name : 'unknown'}`);
        reply({ status: 500, body: { error: 'internal' } });
      }
    })();
  });
}
