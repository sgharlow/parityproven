/**
 * Where the two databases listen. Defaults match docker/compose.yml; override with MSSQL_HOST / MSSQL_PORT /
 * PG_HOST / PG_PORT (in .env or the environment), e.g. to run a second stack beside an existing one.
 * Read at call time, after the CLI has loaded .env.
 */

const port = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a TCP port, got "${raw}"`);
  return n;
};

export const mssqlEndpoint = (): { server: string; port: number } => ({
  server: process.env["MSSQL_HOST"] || "localhost",
  port: port("MSSQL_PORT", 1433),
});

export const pgEndpoint = (): { host: string; port: number } => ({
  host: process.env["PG_HOST"] || "localhost",
  port: port("PG_PORT", 5432),
});
