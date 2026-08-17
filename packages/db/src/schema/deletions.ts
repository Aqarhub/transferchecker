// What a deleted row leaves behind, and why anything is left at all.
//
// DELTA SYNC CANNOT SEE A DELETION. A client asks for everything that changed
// since a cursor, and a row that has been removed changes nothing: it is simply
// absent, and absent is exactly what a row the client has never heard of looks
// like. So a teacher who deletes an exam on a phone finds it still on the tablet
// forever, and nothing anywhere reports a fault.
//
// THE OTHER ANSWER WAS A SOFT DELETE, AND IT WAS REFUSED. Marking rows deleted
// rather than removing them means every read in the product has to remember to
// filter, and the one that forgets shows a teacher an exam they deleted. It also
// means nothing is ever actually deleted, which contradicts the promise the
// product makes about holding as little as possible. A row here is four values
// and no content: which organisation, which kind of thing, which id, and when.
//
// AND THE ROW IS WRITTEN BY THE DATABASE, NOT BY THE APPLICATION. A trigger on
// each synced table writes it, so a deletion issued by a screen nobody has built
// yet, or by hand during an incident, still reaches the other device. Application
// code that has to remember is application code that eventually does not.

import { sql } from 'drizzle-orm';
import { index, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';
import { CURRENT_ORG } from '../policy';
import { orgs } from './orgs';

/** The tables a deletion can be recorded for. The trigger writes one of these. */
export const DELETABLE = ['templates', 'exams', 'answer_keys', 'students', 'scans'] as const;

export const deletions = pgTable(
  'deletions',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),

    /** One of DELETABLE. Text rather than an enum, which this codebase bans. */
    entity: text('entity').notNull(),

    /** The id that is gone. Nothing else about the row is kept. */
    rowId: uuid('row_id').notNull(),

    /** The server's clock, on the same axis as every `updated_at`. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The cursor reads this exactly as it reads a table of rows: by organisation,
    // then in the order the server wrote them.
    index('idx_deletions_cursor').on(table.orgId, table.deletedAt, table.rowId),
    // READ ONLY FOR A CLIENT, WHICH IS THE POINT. A device learns what is gone
    // and cannot write a tombstone itself, so nothing can make another device
    // drop a row except an actual deletion the policies already allowed.
    pgPolicy('deletions_isolation', {
      as: 'permissive',
      for: 'select',
      to: authenticatedRole,
      using: sql`${sql.identifier('org_id')} = ${CURRENT_ORG}`,
    }),
  ],
);
