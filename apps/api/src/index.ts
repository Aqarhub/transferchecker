// Starting the server, and the four things it refuses to start without.
//
// Every one of them is a misconfiguration that would otherwise be found by a
// teacher rather than by a deployment. A connection that can skip every policy,
// a connection that can reach nothing at all, a signing key that is not there,
// and a signing key that is the public half. The first two are the pair in
// `packages/db`, and they fail in opposite directions.
//
// Usage:
//   PGHOST=... PGDATABASE=... PGUSER=tc_app PGPASSWORD=...
//   TC_TOKEN_SIGNING_KEY=... TC_TOKEN_ISSUER=... TC_TOKEN_AUDIENCE=...
//   pnpm --filter @transferchecker/api start

import process from 'node:process';
import { tokenSetupFromEnv } from '@transferchecker/account';
import { assertRoles, assertUnprivileged, explain } from '@transferchecker/db';
// Kept out of the package's main entry on purpose: only this file knows which
// driver is in use, and importing it is a decision rather than something that
// arrives with the schema.
import { connect, settingsFromEnv } from '@transferchecker/db/connect';
import { LIVE_POLICY } from './context';
import type { ApiContext } from './context';
import { memoryLimiter } from './limits';
import { createApi } from './server';

const PORT = Number(process.env['PORT'] ?? '8080');
const SITE = process.env['TC_SITE'] ?? 'https://transferchecker.app';
const HOPS = Number(process.env['TC_PROXY_HOPS'] ?? '0');

/** The languages a policy can be read in, which is what consent requires. */
const LANGUAGES = ['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh'];

function fail(lines: readonly string[]): never {
  for (const line of lines) process.stderr.write(`${line}\n`);
  process.exit(1);
}

const settings = settingsFromEnv(process.env);
if (!settings.ok) fail([`Set these first: ${settings.missing.join(', ')}`]);

const tokens = tokenSetupFromEnv(process.env);
if (!tokens.ok) fail(['The token configuration is not usable:', ...tokens.problems]);

const connection = connect(settings.settings);

try {
  await assertUnprivileged(connection);
  await assertRoles(connection);
} catch (error) {
  const reason = explain(error);
  await connection.close();
  fail([reason === '' ? '' : `\n${reason}\n`, error instanceof Error ? error.message : 'failed']);
}

const context: ApiContext = {
  db: connection.db,
  tokens: tokens.setup,
  limiter: memoryLimiter(),
  now: () => Date.now(),
  site: SITE,
  languages: LANGUAGES,
  policy: LIVE_POLICY,
  proxyHops: HOPS,
  // One line per request outcome, with no address and no token in it.
  log: (line) => process.stdout.write(`${line}\n`),
};

// Said once, loudly, because a server that silently sends no mail looks to a
// teacher exactly like a server whose mail is slow.
if (context.mailer === undefined) {
  process.stdout.write('mail: no sending service is configured. Confirmations will not be sent.\n');
}

createApi(context).listen(PORT, () => {
  process.stdout.write(`listening on ${String(PORT)}, ${settings.settings.host}\n`);
});
