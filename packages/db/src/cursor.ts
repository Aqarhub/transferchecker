// The delta cursor, and the two ways the obvious version loses rows.
//
// PLAN section 6 writes it as `?updatedAfter=cursor`, a timestamp. A bare
// timestamp is wrong twice over and both failures are silent.
//
// FIRST, TIES. Two rows written in the same millisecond, `updated_after > X`
// returns neither on the next call if the cursor stopped between them, or both
// again forever if it stopped on them. A page boundary landing inside a tie is
// not rare on a batch upload of a hundred scans: they all arrive at once.
//
// SECOND, AND WORSE, COMMIT ORDER IS NOT TIMESTAMP ORDER. A transaction that
// stamps a row at 12:00:00 and commits at 12:00:03 becomes visible after a
// reader that already moved its cursor past 12:00:01. That row is then never
// delivered to that client again, by any later call, and nothing reports it.
//
// SO THE CURSOR IS A KEYSET, `(updated_at, id)`, AND IT IS DELIBERATELY
// INCLUSIVE OF A SMALL OVERLAP. The keyset kills the tie: rows are ordered by
// the pair, which is unique, so a page can stop anywhere. The overlap answers
// the commit order problem the only way that does not require reading
// transaction ids: the cursor is rewound by a fixed margin on every read, so a
// row that committed late is picked up on the next pass. Re-delivery is free
// because applying a row is an upsert by primary key, which is the same reason
// a retried upload cannot double anything.

import { z } from 'zod';

/**
 * How far a cursor is rewound before it is used.
 *
 * It has to be longer than the longest gap between a row being stamped and its
 * transaction becoming visible, which is the longest write transaction the
 * server runs. A batch of a hundred rows is one transaction and is measured in
 * milliseconds, so thirty seconds is three orders of magnitude of headroom, and
 * it costs a handful of rows re-sent on each sync.
 */
export const OVERLAP_MS = 30_000;

export interface Cursor {
  /** The server's clock, never a device's. See `syncColumns` for why. */
  readonly at: number;
  /** The tie breaker, so a page may stop between two rows of the same instant. */
  readonly id: string;
}

/**
 * The id that sorts before every real one.
 *
 * The tie breaker is a uuid column, so "start from the beginning" has to be a
 * uuid too. An empty string is the obvious value and PostgreSQL refuses it
 * outright [measured: invalid input syntax for type uuid], which is the better
 * failure of the two available: the nil uuid is a real value that really does
 * sort first, and it is validated like any other.
 */
export const NIL_ID = '00000000-0000-0000-0000-000000000000';

const CursorSchema = z.object({
  at: z.number().int().nonnegative(),
  id: z.uuid(),
});

/**
 * A cursor as one opaque string.
 *
 * OPAQUE ON PURPOSE. A client that can read a cursor is a client that starts
 * constructing them, and then the shape can never change. base64url of the JSON
 * costs nothing and says "this belongs to the server" without pretending to be
 * a secret, which it is not: it names a moment and an id of the caller's own
 * organisation, and the policies decide what it can reach anyway.
 */
export const encodeCursor = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

/** The cursor a client sent, or nothing if it was not one of ours. */
export function decodeCursor(text: string): Cursor | undefined {
  const bytes = Buffer.from(text, 'base64url');
  // The same canonical check the token segments make: exactly one spelling.
  if (bytes.toString('base64url') !== text) return undefined;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(bytes.toString('utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Where a read actually starts: the cursor, rewound. See OVERLAP_MS. */
export const rewind = (cursor: Cursor | undefined): Cursor =>
  cursor === undefined
    ? { at: 0, id: NIL_ID }
    : { at: Math.max(0, cursor.at - OVERLAP_MS), id: NIL_ID };

/**
 * The device's own timestamp, clamped so it cannot claim the future.
 *
 * LAST WRITER WINS IS ONLY AS HONEST AS THE CLOCKS IT COMPARES. A phone whose
 * clock is set to 2099, by accident or on purpose, writes a row that beats every
 * later edit from every other device for the rest of the account's life, and
 * nothing about that looks like a fault from the outside.
 *
 * Clamping to the server's own moment costs nothing in the normal case, where a
 * device is within a second, and turns the pathological case into a device whose
 * edits are merely ordered as if they arrived now.
 */
export const clampClientTime = (clientTs: number, now: number): number => Math.min(clientTs, now);
