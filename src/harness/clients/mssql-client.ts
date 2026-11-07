import sql from "mssql";
import type { RowSet, ColumnMeta } from "../types.js";

export interface DatabaseClient {
  query(sqlText: string, params: unknown[]): Promise<RowSet>;
  loadRows(table: string, rows: Record<string, unknown>[]): Promise<void>;
  close(): Promise<void>;
}

export class MssqlClient implements DatabaseClient {
  private pool: sql.ConnectionPool | null = null;

  constructor(
    private readonly config: {
      server: string;
      port: number;
      user: string;
      password: string;
      database: string;
    }
  ) {}

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      this.pool = await new sql.ConnectionPool({
        server: this.config.server,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        options: {
          trustServerCertificate: true,
          encrypt: false,
        },
        pool: { min: 1, max: 5 },
      }).connect();
    }
    return this.pool;
  }

  async query(sqlText: string, params: unknown[]): Promise<RowSet> {
    const pool = await this.getPool();
    const request = pool.request();

    for (let i = 0; i < params.length; i++) {
      request.input(`p${i}`, params[i]);
    }

    // Replace positional ? placeholders with @p0, @p1, ...
    let parameterisedSql = sqlText;
    let idx = 0;
    parameterisedSql = parameterisedSql.replace(/\?/g, () => `@p${idx++}`);

    const result = await request.query(parameterisedSql);
    const recordset = result.recordset;

    // mssql's recordsets type can be an array or an object; cast to array access
    type RecordSetsArray = sql.IRecordSet<Record<string, unknown>>[];
    const firstRecordset = (result.recordsets as unknown as RecordSetsArray)[0];
    type ColumnsMeta = Record<string, { type: { declaration: string } }>;

    if (!recordset || recordset.length === 0) {
      const columns: ColumnMeta[] = firstRecordset?.columns
        ? Object.entries(firstRecordset.columns as unknown as ColumnsMeta).map(
            ([name, meta]) => ({
              name,
              declaredType: meta?.type?.declaration ?? "unknown",
            })
          )
        : [];
      return { columns, rows: [] };
    }

    const columns: ColumnMeta[] = Object.keys(recordset[0]).map((name) => ({
      name,
      declaredType:
        (firstRecordset?.columns as unknown as ColumnsMeta)?.[name]?.type?.declaration ?? "unknown",
    }));

    const rows = recordset.map((row: Record<string, unknown>) =>
      columns.map((col) => row[col.name])
    );

    return { columns, rows };
  }

  async loadRows(
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<void> {
    if (rows.length === 0) return;

    const pool = await this.getPool();
    const columns = Object.keys(rows[0]);

    for (const row of rows) {
      const request = pool.request();
      const placeholders = columns.map((col, i) => {
        request.input(`p${i}`, row[col]);
        return `@p${i}`;
      });
      const insertSql = `INSERT INTO ${table} (${columns.map((c) => `[${c}]`).join(", ")}) VALUES (${placeholders.join(", ")})`;
      await request.query(insertSql);
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
