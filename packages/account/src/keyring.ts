// The signing key, where it comes from, and how a token names it.
//
// A key lives in the environment as one line of JSON in the standard JWK shape
// (RFC 8037), because a PEM is several lines and an environment variable that
// has to survive a newline is an environment variable somebody eventually gets
// wrong. Nothing here reads a file.
//
// THE KEY ID IS DERIVED, NOT CHOSEN. It is the RFC 7638 thumbprint: a SHA-256
// over the key's own required members in a canonical order. Two consequences,
// and both are the reason. A public key and its private key always produce the
// same id, so a verifier cannot be handed a set of keys whose labels disagree
// with their contents. And rotation needs no bookkeeping: the new key announces
// itself, the old one keeps verifying until the last token it signed has
// expired, and neither has to be named by hand in a configuration file.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { TokenNames } from './token';

export interface SigningKey {
  readonly kid: string;
  readonly privateKey: KeyObject;
}

export interface VerifyingKey {
  readonly kid: string;
  readonly publicKey: KeyObject;
}

export interface Keyring {
  /** The key tokens are signed with. Exactly one, always. */
  readonly active: SigningKey;
  /**
   * Every key a token may still legitimately name.
   *
   * The active one and any retired one whose tokens have not all expired. A key
   * removed from here too early rejects sessions that did nothing wrong; one
   * left here forever is a key that can never really be retired.
   */
  readonly verifying: readonly VerifyingKey[];
}

/**
 * A JWK, with any other member ignored rather than refused.
 *
 * `kid`, `use` and `alg` are common in keys exported by other tools and none of
 * them can be believed here: the id is derived from the key, and the algorithm
 * is fixed by `kty` and `crv`, which are the two members this does pin.
 */
const JwkSchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string().min(1),
  d: z.string().min(1).optional(),
});

/** RFC 7638: SHA-256 of the required members, lexicographic, no whitespace. */
export function thumbprint(x: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x }), 'utf8')
    .digest('base64url');
}

export type KeyProblem =
  | 'not-json'
  | 'not-an-ed25519-key'
  /** A public key where a signing key was required. */
  | 'not-a-private-key'
  /** Well shaped and still refused by the runtime, which usually means bad base64url. */
  | 'rejected';

export type SigningKeyResult =
  | { readonly ok: true; readonly key: SigningKey }
  | { readonly ok: false; readonly why: KeyProblem };

export type VerifyingKeyResult =
  | { readonly ok: true; readonly key: VerifyingKey }
  | { readonly ok: false; readonly why: KeyProblem };

function parseJwk(text: string): z.infer<typeof JwkSchema> | KeyProblem {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return 'not-json';
  }
  const parsed = JwkSchema.safeParse(value);
  return parsed.success ? parsed.data : 'not-an-ed25519-key';
}

/** The private half, for the one process that mints tokens. */
export function readSigningKey(text: string): SigningKeyResult {
  const jwk = parseJwk(text);
  if (typeof jwk === 'string') return { ok: false, why: jwk };
  const d = jwk.d;
  if (d === undefined) return { ok: false, why: 'not-a-private-key' };
  // Rebuilt member by member rather than passed through, because the parsed
  // shape carries `d` as optional and the runtime requires it present.
  const privateJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, d };
  try {
    return {
      ok: true,
      key: {
        kid: thumbprint(jwk.x),
        privateKey: createPrivateKey({ key: privateJwk, format: 'jwk' }),
      },
    };
  } catch {
    return { ok: false, why: 'rejected' };
  }
}

/** The public half, for anything that only has to believe a token. */
export function readVerifyingKey(text: string): VerifyingKeyResult {
  const jwk = parseJwk(text);
  if (typeof jwk === 'string') return { ok: false, why: jwk };
  try {
    // The private member is dropped rather than carried into a verifier that has
    // no use for it, so a public keyring built from a private key by mistake
    // still holds nothing that could sign.
    const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
    return {
      ok: true,
      key: {
        kid: thumbprint(jwk.x),
        publicKey: createPublicKey({ key: publicJwk, format: 'jwk' }),
      },
    };
  } catch {
    return { ok: false, why: 'rejected' };
  }
}

/** The public key of a signing key, so a keyring is never assembled by hand. */
export function verifierOf(key: SigningKey): VerifyingKey {
  return { kid: key.kid, publicKey: createPublicKey(key.privateKey) };
}

export interface GeneratedKey {
  readonly kid: string;
  /** Goes in the environment of the process that signs, and nowhere else, ever. */
  readonly privateJwk: string;
  /** Safe to publish. It can verify a token and cannot make one. */
  readonly publicJwk: string;
}

export function generateSigningKey(): GeneratedKey {
  const pair = generateKeyPairSync('ed25519');
  const jwk = JwkSchema.parse(pair.privateKey.export({ format: 'jwk' }));
  return {
    kid: thumbprint(jwk.x),
    privateJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, d: jwk.d }),
    publicJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x }),
  };
}

export interface TokenSetup {
  readonly keyring: Keyring;
  readonly names: TokenNames;
}

export type SetupResult =
  | { readonly ok: true; readonly setup: TokenSetup }
  | { readonly ok: false; readonly problems: readonly string[] };

const SIGNING = 'TC_TOKEN_SIGNING_KEY';
const RETIRED = 'TC_TOKEN_RETIRED_KEYS';
const ISSUER = 'TC_TOKEN_ISSUER';
const AUDIENCE = 'TC_TOKEN_AUDIENCE';

/**
 * The whole token configuration, or every reason it is not usable.
 *
 * Every problem rather than the first, for the same reason `settingsFromEnv` in
 * `packages/db` lists every missing variable: somebody setting this up should
 * learn what is left in one run rather than one variable per attempt.
 */
export function tokenSetupFromEnv(env: Record<string, string | undefined>): SetupResult {
  const problems: string[] = [];
  const issuer = env[ISSUER] ?? '';
  const audience = env[AUDIENCE] ?? '';
  if (issuer === '') problems.push(`${ISSUER} is not set`);
  if (audience === '') problems.push(`${AUDIENCE} is not set`);

  const signingText = env[SIGNING] ?? '';
  if (signingText === '') problems.push(`${SIGNING} is not set`);

  const retired: VerifyingKey[] = [];
  const retiredText = env[RETIRED] ?? '';
  if (retiredText !== '') {
    let listed: unknown;
    try {
      listed = JSON.parse(retiredText);
    } catch {
      listed = undefined;
    }
    const list = z.array(z.unknown()).safeParse(listed);
    if (!list.success) problems.push(`${RETIRED} is not a JSON array of public keys`);
    else {
      for (const [index, entry] of list.data.entries()) {
        const key = readVerifyingKey(JSON.stringify(entry));
        if (key.ok) retired.push(key.key);
        else problems.push(`${RETIRED}[${String(index)}]: ${key.why}`);
      }
    }
  }

  if (signingText === '') return { ok: false, problems };
  const signing = readSigningKey(signingText);
  if (!signing.ok) {
    return { ok: false, problems: [...problems, `${SIGNING}: ${signing.why}`] };
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    setup: {
      keyring: { active: signing.key, verifying: [verifierOf(signing.key), ...retired] },
      names: { issuer, audience },
    },
  };
}
