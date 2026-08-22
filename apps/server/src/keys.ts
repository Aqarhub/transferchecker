// Signing key material, from one environment variable to two CryptoKeys.
//
// ONE SECRET, EVERYTHING ELSE DERIVED. The environment carries the Ed25519
// private key alone (base64 of its PKCS8 DER) and the public half is computed
// from it here, because two separately configured halves of one key pair is a
// mismatch waiting for a deployment to find. Retired PUBLIC keys are listed
// separately so rotation works: sign with the new key, keep verifying with the
// old one until the last fifteen minute token dies, then drop it.
//
// The `kid` is an opaque label resolved only against the map built here. It
// arrives inside attacker controlled tokens, and `verifyAccessToken` treats it
// as a dictionary lookup and nothing else.

import { createPrivateKey, createPublicKey, webcrypto } from 'node:crypto';
import type { SigningKey } from '@transferchecker/account';

export interface KeyRing {
  /** The kid stamped into every token this process signs. */
  readonly kid: string;
  readonly privateKey: SigningKey;
  /** Everything tokens may verify against: the active key and retired ones. */
  readonly verifyKeys: ReadonlyMap<string, SigningKey>;
}

const importPrivate = (der: Buffer): Promise<webcrypto.CryptoKey> =>
  webcrypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);

const importPublic = (der: Buffer): Promise<webcrypto.CryptoKey> =>
  webcrypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);

/** The public half of a PKCS8 private key, as SPKI DER, via node's KeyObject. */
const publicDerOf = (pkcs8: Buffer): Buffer => {
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
};

/**
 * Builds the ring from configuration values.
 *
 * `retired` maps kid to base64 SPKI DER of keys that no longer sign but whose
 * fifteen minute tokens may still be in flight. The active key's public half
 * is derived and included, so the ring always verifies what it signs.
 */
export async function keyRing(
  kid: string,
  privateKeyBase64: string,
  retired: Readonly<Record<string, string>> = {},
): Promise<KeyRing> {
  const pkcs8 = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = await importPrivate(pkcs8);
  const verifyKeys = new Map<string, SigningKey>([[kid, await importPublic(publicDerOf(pkcs8))]]);
  for (const [retiredKid, spki] of Object.entries(retired)) {
    verifyKeys.set(retiredKid, await importPublic(Buffer.from(spki, 'base64')));
  }
  return { kid, privateKey, verifyKeys };
}
