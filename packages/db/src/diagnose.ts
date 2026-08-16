// Turning a connection failure into a sentence somebody can act on.
//
// The tools in this package are run by whoever is setting the product up, and
// the four ways they fail have four different fixes in four different places.
// A stack trace names none of them. It also buries the one line that matters
// under forty lines of driver internals, which is the opposite of what a person
// staring at a terminal at eleven at night needs.
//
// THE DISTINCTION WORTH KNOWING IS THE FIRST ONE. A timeout and a refusal look
// equally broken and mean opposite things. Refused means the packet arrived and
// something said no: the host is right, the port is wrong or nothing is
// listening. Timed out means the packet was dropped without an answer, which is
// what a firewall does, and on a managed database that firewall is the address
// allowlist. A home connection changes address on its own, so this is the
// failure that comes back on its own too.

export interface Diagnosis {
  readonly summary: string;
  readonly likely: readonly string[];
}

const CODES: Readonly<Record<string, Diagnosis>> = {
  ETIMEDOUT: {
    summary: 'The database never answered. The packets were dropped rather than refused.',
    likely: [
      'The address allowlist does not include this machine. A home connection is given a new address whenever it reconnects, so an allowlist that worked yesterday can be wrong today.',
      'Read the current one and compare it: curl -4 https://api.ipify.org',
      'Or the endpoint is the internal one, which only answers from inside the same private network.',
    ],
  },
  ECONNREFUSED: {
    summary: 'The host answered and refused the connection.',
    likely: [
      'Something is listening at that address but not on this port, or the instance is stopped.',
      'Check PGPORT, and that the instance is running.',
    ],
  },
  ENOTFOUND: {
    summary: 'The hostname does not resolve.',
    likely: ['PGHOST is misspelled, or it names an endpoint that has not been created yet.'],
  },
  EAI_AGAIN: {
    summary: 'The hostname could not be looked up.',
    likely: ['A temporary name resolution failure. Check this machine has a working connection.'],
  },
  '28P01': {
    summary: 'The database rejected the account or the password.',
    likely: [
      'Check PGUSER and PGPASSWORD. The password is the one set when the account was created.',
    ],
  },
  '3D000': {
    summary: 'That database does not exist on this instance.',
    likely: ['Check PGDATABASE. It is the database name, not the instance name.'],
  },
};

/** The error's own code, from wherever the driver chose to put it. */
function codeOf(error: unknown): string {
  for (
    let at: unknown = error, depth = 0;
    at !== null && at !== undefined && depth < 5;
    depth += 1
  ) {
    if (typeof at !== 'object') break;
    if ('code' in at) {
      const code: unknown = at.code;
      if (typeof code === 'string' && code !== '') return code;
    }
    at = 'cause' in at ? at.cause : null;
  }
  return '';
}

/**
 * What went wrong, in words, or null when this is not a connection problem.
 *
 * Null rather than a guess: an error this does not recognise is more useful
 * printed in full than described wrongly, and a tool that explains everything
 * confidently is a tool nobody can trust when it matters.
 */
export function diagnose(error: unknown): Diagnosis | null {
  return CODES[codeOf(error)] ?? null;
}

/** The diagnosis as the lines a command line tool should print. */
export function explain(error: unknown): string {
  const found = diagnose(error);
  if (found === null) return '';
  return [found.summary, ...found.likely.map((line) => `  ${line}`)].join('\n');
}
