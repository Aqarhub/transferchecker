// A signing key pair, printed as the line that goes into an environment.
//
// Run it once per environment:  pnpm --filter @transferchecker/account keygen
//
// It prints to standard output and writes nothing to disk, so the private key
// exists only where whoever ran it puts it. There is no way to recover it later
// and that is correct: a key that can be fetched again is a key that can be
// fetched by somebody else.

import process from 'node:process';
import { generateSigningKey } from './keyring';

const key = generateSigningKey();

process.stdout.write(`# Key id ${key.kid}\n`);
process.stdout.write(
  '# The signing key. Set it on the server that mints tokens, and nowhere else.\n',
);
process.stdout.write(`TC_TOKEN_SIGNING_KEY='${key.privateJwk}'\n`);
process.stdout.write('\n');
process.stdout.write('# The public half, for reference. It does NOT need to be set: the server\n');
process.stdout.write('# derives it from the signing key. Hand it out only if some other service\n');
process.stdout.write('# has to verify a token without being able to mint one.\n');
process.stdout.write(`# ${key.publicJwk}\n`);
process.stdout.write('\n');
process.stdout.write('# To rotate: generate a new key, set it as the signing key, and put the\n');
process.stdout.write('# PREVIOUS public key in TC_TOKEN_RETIRED_KEYS as a JSON array. Keep it\n');
process.stdout.write(
  '# there until every token it signed has expired, which is fifteen minutes.\n',
);
