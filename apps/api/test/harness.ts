// A real server, on a real port, over a real database.
//
// Nothing here is a mock. PGlite boots inside the test process and the actual
// migration files build it, the session becomes the application role that owns
// nothing, and the server is started with `listen(0)` so the operating system
// picks the port. Requests go through `fetch`, which means the routing, the body
// limits, the headers and the status codes are all under test rather than
// asserted around.
//
// The two things that are supplied rather than real are the clock and the mail,
// and both for the same reason: a test has to be able to sit on a boundary and
// to read what would have been sent.

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { drizzle } from 'drizzle-orm/pglite';
import { generateSigningKey, readSigningKey, verifierOf } from '@transferchecker/account';
import type { Delivery, Mail, TokenSetup } from '@transferchecker/account';
import { prepare } from '@transferchecker/db/local';
import type { Database } from '@transferchecker/db';
import { LIVE_POLICY } from '../src/context';
import type { ApiContext } from '../src/context';
import { memoryLimiter } from '../src/limits';
import { createApi } from '../src/server';

const generated = generateSigningKey();
const signing = readSigningKey(generated.privateJwk);
if (!signing.ok) throw new Error('the generated key could not be read back');

export const TOKENS: TokenSetup = {
  keyring: { active: signing.key, verifying: [verifierOf(signing.key)] },
  names: { issuer: 'https://auth.transferchecker.app', audience: 'transferchecker-api' },
};

export const T0 = Date.UTC(2026, 7, 16, 12, 0, 0);

export interface Harness {
  readonly base: string;
  readonly client: PGlite;
  readonly db: Database;
  readonly sent: Mail[];
  readonly lines: string[];
  /** Moves the server's clock. Every route reads it once per request. */
  setNow: (at: number) => void;
  /**
   * Reads the database as its owner, which the application role deliberately
   * is not. A test that wants to check what was written has to step out of the
   * role the server runs as, exactly because that role cannot see most of it.
   */
  inspect: <T>(query: string) => Promise<T[]>;
  close: () => Promise<void>;
}

export interface Options {
  /** Leave the mailer out, which is what the deployment looks like today. */
  readonly withoutMail?: boolean;
}

export async function serve(options: Options = {}): Promise<Harness> {
  const client = await PGlite.create({ extensions: { citext } });
  await prepare(client);

  // The role a server really connects as: owns nothing, holds neither dangerous
  // attribute, and is a member of the two roles a request switches into.
  await client.exec(`
    create role tc_app login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
    grant authenticated to tc_app;
    grant tc_auth to tc_app;
    set role tc_app;
  `);

  const sent: Mail[] = [];
  const lines: string[] = [];
  let now = T0;

  const context: ApiContext = {
    db: drizzle(client),
    tokens: TOKENS,
    limiter: memoryLimiter(),
    now: () => now,
    site: 'https://transferchecker.app',
    languages: ['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh'],
    policy: LIVE_POLICY,
    proxyHops: 0,
    log: (line) => lines.push(line),
    ...(options.withoutMail === true
      ? {}
      : {
          mailer: {
            send: (mail: Mail): Promise<Delivery> => {
              sent.push(mail);
              return Promise.resolve({ ok: true });
            },
          },
        }),
  };

  const server = createApi(context);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    client,
    db: context.db,
    sent,
    lines,
    setNow: (at) => {
      now = at;
    },
    inspect: async <T>(query: string): Promise<T[]> => {
      await client.exec('reset role');
      const found = await client.query<T>(query);
      await client.exec('set role tc_app');
      return found.rows;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
  readonly text: string;
}

/** One JSON request, with the body read whichever way it came back. */
export async function post(base: string, path: string, body: unknown): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response);
}

export async function get(base: string, path: string): Promise<Answer> {
  return read(await fetch(`${base}${path}`));
}

export async function form(base: string, path: string, fields: Record<string, string>) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  return read(response);
}

async function read(response: Response): Promise<Answer> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) body = { ...parsed };
  } catch {
    body = {};
  }
  return { status: response.status, headers: response.headers, body, text };
}

/** The account every test starts from, in the shape the form submits. */
export const SIGNUP = {
  email: 'teacher@example.sa',
  password: 'a very long passphrase indeed',
  country: 'SA',
  language: 'ar',
  policyVersion: LIVE_POLICY.privacy,
};
