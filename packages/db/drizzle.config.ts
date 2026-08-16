import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema and are the only thing that ever
// touches a database. There is no `push` here on purpose: pushing diffs a live
// database and leaves no file behind, which means the policies protecting one
// organisation from another would exist only in whichever database somebody last
// pushed to.
//
// `dbCredentials` is absent because nothing in this repository connects to a
// server. `drizzle-kit generate` reads the schema and writes SQL, and the tests
// apply that SQL to a PostgreSQL running inside the test process.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  // Supabase creates `anon`, `authenticated` and `service_role` itself, so the
  // migrations must reference them without trying to create or alter them.
  entities: { roles: { provider: 'supabase' } },
});
