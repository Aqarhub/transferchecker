-- What has to exist before any table does.
--
-- `citext` gives `users.email` a case insensitive unique index, which is what
-- stops one mailbox becoming two accounts. It ships with Supabase and with stock
-- PostgreSQL, so this is a one line dependency rather than a build step.

CREATE EXTENSION IF NOT EXISTS citext;
