import pg from "pg";
import type { RowSet, ColumnMeta } from "../types.js";
import type { DatabaseClient } from "./mssql-client.js";

// Re-export the interface so callers can import from one place
export type { DatabaseClient };

// Tell pg to return timestamps and dates as ISO strings, not Date objects.
// This prevents local-TZ conversion (pg interprets timestamp as localtime, mssql returns UTC Date).
// We compare as strings in the comparator.
pg.types.setTypeParser(1114, (val: string) => val);   // timestamp without tz
pg.types.setTypeParser(1082, (val: string) => val);   // date
pg.types.setTypeParser(1184, (val: string) => val);   // timestamptz
// numeric and int8 come back as strings by default; mssql returns JS numbers for decimal/bigint.
// Fixtures stay within 15 significant digits, so Number is exact for the values compared.
pg.types.setTypeParser(1700, (val: string) => Number(val));  // numeric
pg.types.setTypeParser(20, (val: string) => Number(val));    // int8

export class PgClient implements DatabaseClient {
  private client: pg.Client | null = null;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    }
  ) {}

  private async getClient(): Promise<pg.Client> {
    if (!this.client) {
      this.client = new pg.Client({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
      });
      await this.client.connect();
    }
    return this.client;
  }

  async query(sqlText: string, params: unknown[]): Promise<RowSet> {
    const client = await this.getClient();

    // Convert ? placeholders to $1, $2, ...
    let idx = 1;
    const parameterisedSql =
      params.length > 0 ? sqlText.replace(/\?/g, () => `$${idx++}`) : sqlText;

    const result = await client.query({
      text: parameterisedSql,
      values: params as pg.QueryConfigValues<unknown[]>,
      rowMode: "array",
    });

    const columns: ColumnMeta[] = result.fields.map((f) => ({
      name: f.name,
      // pg returns OIDs; map the most common ones to readable type names
      declaredType: pgOidToType(f.dataTypeID),
    }));

    const rows = result.rows as unknown[][];

    return { columns, rows };
  }

  async loadRows(
    table: string,
    rows: Record<string, unknown>[],
    wrap?: Record<string, (placeholder: string) => string>
  ): Promise<void> {
    if (rows.length === 0) return;

    const client = await this.getClient();
    const columns = Object.keys(rows[0]);

    for (const row of rows) {
      const values = columns.map((col) => row[col]);
      const placeholders = columns.map((col, i) => (wrap?.[col] ? wrap[col](`$${i + 1}`) : `$${i + 1}`)).join(", ");
      const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
      const insertSql = `INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})`;
      await client.query(insertSql, values);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}

/** Map the most common PostgreSQL OIDs to readable type names.
 *  Not exhaustive — unknown OIDs fall back to "unknown(<oid>)".
 */
function pgOidToType(oid: number): string {
  const map: Record<number, string> = {
    16: "boolean",
    17: "bytea",
    20: "int8",
    21: "int2",
    23: "int4",
    25: "text",
    700: "float4",
    701: "float8",
    1043: "varchar",
    1082: "date",
    1114: "timestamp",
    1184: "timestamptz",
    1700: "numeric",
    2950: "uuid",
  };
  return map[oid] ?? `unknown(${oid})`;
}
