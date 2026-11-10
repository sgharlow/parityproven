-- PostgreSQL schemas for converted objects.
-- Tables and functions are NOT created here: the harness (npm run convert) creates the tables
-- each object needs from its spec (src/conversions/specs.ts) and deploys the converted function
-- from conversions/<database>/<Schema>.<Object>.sql, so the SQL Server and PostgreSQL sides
-- always come from the same source of truth.

CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS warehouse;
