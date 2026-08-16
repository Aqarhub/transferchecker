// The organisation, which is the unit every isolation policy is written around.
//
// PLAN.md section 5 says `orgs(id, owner_id)` and adds "currently one teacher".
// It stays that small on purpose: an org with one member today is the same row
// an institution tier fills with twenty five tomorrow, and nothing above it has
// to change. Building the tier now would be building the wrong twenty five.

import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { isolateBy } from '../policy';

export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey(),

    /**
     * The account that owns this organisation, as an auth user id.
     *
     * NO FOREIGN KEY, and the reason is worth reading. This value is an id in
     * Supabase's own `auth.users`, which is a table in a schema this repository
     * does not own and its migrations must not touch. A key pointing at our
     * `users` table instead would close a cycle, since `users.org_id` points back
     * here, and the two rows are written in one transaction: whichever went first
     * would violate the other.
     */
    ownerId: uuid('owner_id').notNull(),
    // The isolation column here is the primary key itself. An organisation is
    // visible to the people inside it and to nobody else, which is the same rule
    // every other table states as `org_id = current org`.
  },
  () => [isolateBy('orgs', 'id')],
);
