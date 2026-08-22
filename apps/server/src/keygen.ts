// Mints one Ed25519 key pair and prints what the environment needs.
//
// Run on a trusted machine, paste the two lines into the secret manager, and
// never write the private line anywhere else. The public SPKI is printed too
// because rotation needs it later: when this key retires it moves, public half
// only, into AUTH_RETIRED_KEYS while its successor signs.
//
// Usage:  pnpm --filter @transferchecker/server keygen

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import process from 'node:process';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const kid = `k${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;

process.stdout.write(
  [
    `AUTH_KEY_ID=${kid}`,
    `AUTH_PRIVATE_KEY=${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`,
    '',
    '# Public half, only needed later, for AUTH_RETIRED_KEYS when this key rotates out:',
    `# ${kid}=${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}`,
    '',
  ].join('\n'),
);
