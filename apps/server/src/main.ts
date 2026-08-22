// Boot: settings, connection, the refusal, then listen.
//
// THE ORDER IS THE SAFETY PROPERTY. `assertUnprivileged` runs before the first
// socket opens, so a process configured with the migration account's
// credentials never serves one request: the failure the guard exists for is
// silent everywhere else (every policy stops applying while every screen keeps
// working), so the only acceptable moment to catch it is before work begins.
//
// Usage:  PGHOST=... AUTH_KEY_ID=... AUTH_PRIVATE_KEY=... PUBLIC_ORIGIN=...
//         POLICY_PRIVACY_VERSION=... POLICY_TERMS_VERSION=... pnpm serve

import process from 'node:process';
import { assertUnprivileged, connect } from '@transferchecker/db/connect';
import { explain } from '@transferchecker/db';
import { app } from './http';
import { hibpCheck, noBreachCheck } from './hibp';
import { keyRing } from './keys';
import { nullMailer } from './mailer';
import { routes } from './routes';
import { LANGUAGES, serverSettings } from './settings';

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<void> {
  const found = serverSettings(process.env);
  if (!found.ok) {
    process.stderr.write(`Set these first: ${found.missing.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }
  const settings = found.settings;

  const connection = connect(settings.database);
  await assertUnprivileged(connection);

  const server = app({
    log,
    routes: routes({
      db: connection.db,
      keys: await keyRing(settings.keyId, settings.privateKey, settings.retiredKeys),
      clock: () => Date.now(),
      // The provider is the owner's pending business decision; until it lands
      // the null mailer says plainly that nothing is being sent. What it would
      // send is already composed in `message.ts`, so the decision costs one
      // adapter file and no copy.
      mailer: nullMailer(log),
      log,
      breached: settings.hibp ? hibpCheck() : noBreachCheck(),
      policy: settings.policy,
      languages: LANGUAGES,
      origin: settings.origin,
    }),
  });

  server.listen(settings.port, () => {
    log(`listening on :${String(settings.port)}`);
  });
}

main().catch((error: unknown) => {
  const reason = explain(error);
  if (reason !== '') process.stderr.write(`\n${reason}\n\n`);
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
