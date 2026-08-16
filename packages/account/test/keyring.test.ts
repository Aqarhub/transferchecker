// The key, and the ways a key can be the wrong one without anybody noticing.
//
// The property worth proving here is the one the whole rotation story rests on:
// a key id is derived from the key, so it cannot be attached to the wrong key by
// a typo in a configuration file. Everything else is refusing input that would
// otherwise reach `createPrivateKey` and throw at startup with a message about
// DER encoding that says nothing to whoever is holding the deployment.

import { describe, expect, it } from 'vitest';
import {
  generateSigningKey,
  readSigningKey,
  readVerifyingKey,
  thumbprint,
  tokenSetupFromEnv,
  verifierOf,
} from '../src/keyring';
import { checkAccessToken, mintAccessToken } from '../src/token';

const generated = generateSigningKey();

describe('the key id', () => {
  // RFC 7638. The test vector is our own key rather than the RFC's, because the
  // RFC has no Ed25519 example; what is being pinned is that the two halves of
  // one key agree, which is the property the keyring depends on.
  it('is the same for the private key and its public half', () => {
    const signing = readSigningKey(generated.privateJwk);
    const verifying = readVerifyingKey(generated.publicJwk);
    expect(signing.ok && verifying.ok).toBe(true);
    if (!signing.ok || !verifying.ok) return;
    expect(signing.key.kid).toBe(verifying.key.kid);
    expect(verifierOf(signing.key).kid).toBe(verifying.key.kid);
  });

  it('is a function of the key alone, not of how the JSON was written', () => {
    const reordered = JSON.stringify(JSON.parse(generated.publicJwk));
    const spaced = JSON.stringify(JSON.parse(generated.publicJwk), null, 2);
    const first = readVerifyingKey(reordered);
    const second = readVerifyingKey(spaced);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.key.kid).toBe(second.key.kid);
  });

  it('changes when the key changes', () => {
    expect(generateSigningKey().kid).not.toBe(generated.kid);
  });

  it('is base64url of a SHA-256, which is 43 characters', () => {
    expect(thumbprint('AAAA')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('reading a key', () => {
  it('refuses text that is not JSON', () => {
    expect(readSigningKey('not json at all')).toEqual({ ok: false, why: 'not-json' });
  });

  it('refuses a key on another curve', () => {
    const rsa = JSON.stringify({ kty: 'RSA', n: 'x', e: 'AQAB' });
    expect(readSigningKey(rsa)).toEqual({ ok: false, why: 'not-an-ed25519-key' });
  });

  // The mistake that would otherwise be found at the first sign in rather than
  // at startup: the public half pasted where the signing key belongs.
  it('refuses a public key where a signing key is required', () => {
    expect(readSigningKey(generated.publicJwk)).toEqual({ ok: false, why: 'not-a-private-key' });
  });

  it('refuses key material that is not decodable', () => {
    const broken = JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: '!!!!', d: '!!!!' });
    expect(readSigningKey(broken)).toEqual({ ok: false, why: 'rejected' });
  });

  it('ignores the members other tools add, rather than refusing the key', () => {
    const withExtras = JSON.stringify({
      ...JSON.parse(generated.publicJwk),
      kid: 'a name somebody chose',
      use: 'sig',
      alg: 'EdDSA',
    });
    const read = readVerifyingKey(withExtras);
    expect(read.ok).toBe(true);
    // And the id it was given is not the id it gets. The key decides.
    if (read.ok) expect(read.key.kid).toBe(generated.kid);
  });

  // A verifier assembled from a private key by mistake must still be unable to
  // sign, which is the whole point of having two halves.
  it('drops the private half when reading a verifying key', () => {
    const read = readVerifyingKey(generated.privateJwk);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.key.publicKey.export({ format: 'jwk' })).not.toHaveProperty('d');
  });
});

describe('the environment', () => {
  const NAMES = {
    TC_TOKEN_ISSUER: 'https://auth.transferchecker.app',
    TC_TOKEN_AUDIENCE: 'transferchecker-api',
  };

  it('assembles a keyring that can mint and verify', () => {
    const found = tokenSetupFromEnv({ ...NAMES, TC_TOKEN_SIGNING_KEY: generated.privateJwk });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    const token = mintAccessToken({
      claims: {
        userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        orgId: '11111111-1111-4111-8111-111111111111',
        emailConfirmed: false,
      },
      key: found.setup.keyring.active,
      now: 1_760_000_000_000,
      names: found.setup.names,
    });
    expect(
      checkAccessToken({
        token,
        keys: found.setup.keyring.verifying,
        now: 1_760_000_000_000,
        names: found.setup.names,
      }).ok,
    ).toBe(true);
  });

  // Every missing variable at once, so somebody setting this up learns what is
  // left in one run instead of one variable per attempt.
  it('reports everything that is missing, not the first thing', () => {
    const found = tokenSetupFromEnv({});
    expect(found.ok).toBe(false);
    if (found.ok) return;
    expect(found.problems).toHaveLength(3);
  });

  it('keeps a retired key in the verifying set and out of the signing slot', () => {
    const retired = generateSigningKey();
    const found = tokenSetupFromEnv({
      ...NAMES,
      TC_TOKEN_SIGNING_KEY: generated.privateJwk,
      TC_TOKEN_RETIRED_KEYS: `[${retired.publicJwk}]`,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.setup.keyring.active.kid).toBe(generated.kid);
    expect(found.setup.keyring.verifying.map((key) => key.kid)).toEqual([
      generated.kid,
      retired.kid,
    ]);
  });

  it('refuses a retired list that is not a list', () => {
    const found = tokenSetupFromEnv({
      ...NAMES,
      TC_TOKEN_SIGNING_KEY: generated.privateJwk,
      TC_TOKEN_RETIRED_KEYS: generated.publicJwk,
    });
    expect(found.ok).toBe(false);
  });

  it('says which entry of the retired list is wrong', () => {
    const found = tokenSetupFromEnv({
      ...NAMES,
      TC_TOKEN_SIGNING_KEY: generated.privateJwk,
      TC_TOKEN_RETIRED_KEYS: `[${generated.publicJwk}, {"kty":"RSA"}]`,
    });
    expect(found.ok).toBe(false);
    if (found.ok) return;
    expect(found.problems).toEqual(['TC_TOKEN_RETIRED_KEYS[1]: not-an-ed25519-key']);
  });
});
