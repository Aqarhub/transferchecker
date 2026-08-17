// Uploading a batch and downloading what changed.
//
// Both routes are thin on purpose. Every property the plan asks for is kept by
// `packages/db`, inside one transaction and under the isolation policy, because
// a property this file kept would be a property the next endpoint forgets.
//
// WHAT THIS FILE DOES OWN is the one thing the database cannot: the batch is run
// inside the session of the token that arrived, and the organisation is taken
// from that token and never from the request body.

import {
  BatchSchema,
  MAX_BATCH,
  asTenant,
  changesSince,
  countSince,
  decodeCursor,
  pushBatch,
} from '@transferchecker/db';
import { RULES } from '../limits';
import { caller } from '../bearer';
import { refuse, throttled } from '../context';
import type { ApiContext, Reply, RouteInput } from '../context';

export const push = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const who = caller(context, input, true);
  if (!who.ok) return who.reply;

  const limited = throttled(context, RULES.sync, `sync:${who.claims.orgId}`, input);
  if (limited !== undefined) return limited;

  const batch = BatchSchema.safeParse(input.body);
  if (!batch.success) {
    // The size limit is named in the answer because a client that split its
    // queue wrongly needs to know which way to split it.
    return refuse(400, 'invalid-batch', { maxRowsPerKind: MAX_BATCH });
  }

  const applied = await asTenant(context.db, who.claims, (tx) =>
    pushBatch(tx, batch.data, who.claims.orgId, input.now),
  );

  context.log(
    `sync push: ${String(applied.written)} written, ${String(applied.stale.length)} stale`,
  );
  return { status: 200, body: applied };
};

export const changes = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const who = caller(context, input, true);
  if (!who.ok) return who.reply;

  const limited = throttled(context, RULES.sync, `sync:${who.claims.orgId}`, input);
  if (limited !== undefined) return limited;

  const sent = input.query?.get('cursor') ?? '';
  const cursor = sent === '' ? undefined : decodeCursor(sent);
  // A cursor we did not write is refused rather than treated as the beginning.
  // Silently starting over would hand a client its entire history and look like
  // a slow sync rather than like a bug.
  if (sent !== '' && cursor === undefined) return refuse(400, 'invalid-cursor');

  const answer = await asTenant(context.db, who.claims, (tx) => changesSince(tx, cursor));
  return { status: 200, body: answer };
};

/** How many rows are waiting, for the indicator the plan asks the client to show. */
export const pending = async (context: ApiContext, input: RouteInput): Promise<Reply> => {
  const who = caller(context, input, true);
  if (!who.ok) return who.reply;

  const sent = input.query?.get('cursor') ?? '';
  const cursor = sent === '' ? undefined : decodeCursor(sent);
  if (sent !== '' && cursor === undefined) return refuse(400, 'invalid-cursor');

  const waiting = await asTenant(context.db, who.claims, (tx) => countSince(tx, cursor));
  return { status: 200, body: { waiting } };
};
