// What the server needs from its environment, all of it named in one place.
//
// The same contract `connect.ts` follows for the database settings: read
// everything, report every missing name at once, and never read a secret from
// a file. The database half is delegated to `settingsFromEnv` so there is one
// definition of PGHOST and friends in the repository, not two that drift.

import { settingsFromEnv } from '@transferchecker/db/connect';
import type { Settings as DatabaseSettings } from '@transferchecker/db/connect';

/** The locales the product publishes. A consent has to be readable in one. */
export const LANGUAGES = ['ar', 'en', 'de', 'es', 'fr', 'hi', 'tr', 'zh'] as const;

export interface ServerSettings {
  readonly database: DatabaseSettings;
  readonly port: number;
  /** Where confirmation links point: the public origin of the product. */
  readonly origin: string;
  readonly keyId: string;
  /** Base64 of the Ed25519 private key's PKCS8 DER. From `keygen`. */
  readonly privateKey: string;
  /** kid to base64 SPKI DER of retired verify-only keys. JSON, optional. */
  readonly retiredKeys: Readonly<Record<string, string>>;
  /** The live policy versions, as dates, one per document. */
  readonly policy: { readonly privacy: string; readonly terms: string };
  /** Whether the breach check may reach Have I Been Pwned. */
  readonly hibp: boolean;
}

export type SettingsResult =
  | { readonly ok: true; readonly settings: ServerSettings }
  | { readonly ok: false; readonly missing: readonly string[] };

const REQUIRED = [
  'AUTH_KEY_ID',
  'AUTH_PRIVATE_KEY',
  'PUBLIC_ORIGIN',
  'POLICY_PRIVACY_VERSION',
  'POLICY_TERMS_VERSION',
] as const;

export function serverSettings(env: Record<string, string | undefined>): SettingsResult {
  const database = settingsFromEnv(env);
  const missing = [
    ...(database.ok ? [] : database.missing),
    ...REQUIRED.filter((name) => (env[name] ?? '') === ''),
  ];
  if (!database.ok || missing.length > 0) return { ok: false, missing };

  let retiredKeys: Record<string, string> = {};
  if ((env['AUTH_RETIRED_KEYS'] ?? '') !== '') {
    // A malformed retired-keys value must stop the boot, not shrink the ring:
    // a server that silently forgot a retired key logs every phone out fifteen
    // minutes early on rotation day and nobody knows why.
    retiredKeys = JSON.parse(env['AUTH_RETIRED_KEYS'] ?? '{}') as Record<string, string>;
  }

  return {
    ok: true,
    settings: {
      database: database.settings,
      port: Number(env['PORT'] ?? '8080'),
      origin: env['PUBLIC_ORIGIN'] ?? '',
      keyId: env['AUTH_KEY_ID'] ?? '',
      privateKey: env['AUTH_PRIVATE_KEY'] ?? '',
      retiredKeys,
      policy: {
        privacy: env['POLICY_PRIVACY_VERSION'] ?? '',
        terms: env['POLICY_TERMS_VERSION'] ?? '',
      },
      // Opt OUT, like PGSSL: the check is part of the password rules and
      // turning it off is a decision for an environment that cannot reach out.
      hibp: (env['HIBP'] ?? 'on') !== 'off',
    },
  };
}
