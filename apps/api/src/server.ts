// The router, and everything that happens to every request.
//
// Eight routes, matched by method and path with no pattern language, because a
// pattern language is where a route accidentally matches something it should
// not. The one route with a variable in it is the confirmation page, and its
// variable is a language code checked against a list.

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  clientAddress,
  parseForm,
  parseJson,
  readBody,
  sendAndClose,
  sendHtml,
  sendJson,
} from './http';
import { RULES } from './limits';
import { throttled } from './context';
import type { ApiContext, Reply, Route, RouteInput } from './context';
import { signup } from './routes/signup';
import { refresh, signin, signout } from './routes/session';
import { confirm, resend } from './routes/mailbox';
import { askPage, resultPage } from './routes/page';

const ROUTES: Readonly<Record<string, Route>> = {
  'POST /v1/auth/signup': async (context, input) => {
    const limited = throttled(context, RULES.signup, `signup:${input.address}`, input);
    return limited ?? (await signup(context, input));
  },
  'POST /v1/auth/signin': signin,
  'POST /v1/auth/refresh': refresh,
  'POST /v1/auth/signout': signout,
  'POST /v1/auth/confirm': confirm,
  'POST /v1/auth/confirm/resend': resend,
};

/**
 * The languages the confirmation page is served in.
 *
 * Anything else is served the English words under its own language tag, which
 * is the same fallback the mail makes and for the same reason.
 */
const PAGE_LOCALES = new Set(['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh']);

/** `/ar/confirm` and nothing else shaped like it. */
function confirmPageLocale(path: string): string | undefined {
  const parts = path.split('/');
  const [empty, locale, tail] = parts;
  if (parts.length !== 3 || empty !== '' || locale === undefined || tail !== 'confirm') {
    return undefined;
  }
  return PAGE_LOCALES.has(locale) ? locale : undefined;
}

async function answer(context: ApiContext, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://placeholder');
  const method = request.method ?? 'GET';
  const address = clientAddress(request, context.proxyHops);
  const now = context.now();

  // Liveness only, and it touches nothing. A health check that queries the
  // database turns one slow query into an instance being taken out of service.
  if (method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true, mail: context.mailer === undefined ? 'none' : 'ready' });
    return;
  }

  const locale = confirmPageLocale(url.pathname);

  if (method === 'GET' && locale !== undefined) {
    // The link lands here and nothing is spent. See routes/page.ts.
    sendHtml(response, 200, askPage(locale, url.searchParams.get('token') ?? ''));
    return;
  }

  if (method === 'POST' && locale !== undefined) {
    const read = await readBody(request);
    if (!read.ok) {
      if (read.why === 'too-large') sendAndClose(request, response, 413, { error: 'too-large' });
      else sendHtml(response, 400, resultPage(locale, false));
      return;
    }
    const token = parseForm(read.text)['token'] ?? '';
    const reply = await confirm(context, { body: { token }, address, now });
    sendHtml(response, reply.status === 200 ? 200 : 400, resultPage(locale, reply.status === 200));
    return;
  }

  const route = ROUTES[`${method} ${url.pathname}`];
  if (route === undefined) {
    sendJson(response, 404, { error: 'no-such-route' });
    return;
  }

  const read = await readBody(request);
  if (!read.ok) {
    if (read.why === 'too-large') sendAndClose(request, response, 413, { error: 'too-large' });
    else sendJson(response, 400, { error: 'aborted' });
    return;
  }

  const input: RouteInput = { body: parseJson(read.text), address, now };
  const reply = await route(context, input);
  send(response, reply);
}

function send(response: ServerResponse, reply: Reply): void {
  if (reply.status === 204) {
    response.writeHead(204, reply.headers ?? {});
    response.end();
    return;
  }
  sendJson(response, reply.status, reply.body, reply.headers ?? {});
}

/**
 * The server, with the one thing a handler must never do handled once.
 *
 * An unexpected throw becomes a 500 with no detail in it. A stack trace in a
 * response body is a map of the server, and the message of a database error in
 * particular can carry the value that failed a constraint, which here would be
 * somebody's address.
 */
export function createApi(context: ApiContext): Server {
  return createServer((request, response) => {
    void answer(context, request, response).catch((error: unknown) => {
      context.log(`unhandled: ${error instanceof Error ? error.name : 'unknown'}`);
      if (!response.headersSent) sendJson(response, 500, { error: 'internal' });
      else response.end();
    });
  });
}
