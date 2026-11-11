import sql from "mssql";
import type { RowSet, ColumnMeta } from "../types.js";

export interface DatabaseClient {
  query(sqlText: string, params: unknown[]): Promise<RowSet>;
  /** wrap: per-column SQL expression around the parameter placeholder, e.g. to build a spatial value from WKT. */
  loadRows(table: string, rows: Record<string, unknown>[], wrap?: Record<string, (placeholder: string) => string>): Promise<void>;
  /** Batched multi-row insert for synthetic volume. */
  loadRowsBulk(table: string, rows: Record<string, unknown>[], wrap?: Record<string, (placeholder: string) => string>): Promise<void>;
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
        requestTimeout: 60000,   // fail fast rather than leave a runaway query on the container
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
    // Only rewrite placeholders when parameters were supplied (DDL / procedure bodies may contain '?').
    let parameterisedSql = sqlText;
    if (params.length > 0) {
      let idx = 0;
      parameterisedSql = parameterisedSql.replace(/\?/g, () => `@p${idx++}`);
    }

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
    rows: Record<string, unknown>[],
    wrap?: Record<string, (placeholder: string) => string>
  ): Promise<void> {
    if (rows.length === 0) return;

    const pool = await this.getPool();
    const columns = Object.keys(rows[0]);

    for (const row of rows) {
      const request = pool.request();
      const placeholders = columns.map((col, i) => {
        request.input(`p${i}`, row[col]);
        return wrap?.[col] ? wrap[col](`@p${i}`) : `@p${i}`;
      });
      const insertSql = `INSERT INTO ${table} (${columns.map((c) => `[${c}]`).join(", ")}) VALUES (${placeholders.join(", ")})`;
      await request.query(insertSql);
    }
  }

  /**
   * Server-side elapsed time (ms) for a statement, from SET STATISTICS TIME. The largest
   * "SQL Server Execution Times" entry is the outer statement, which includes any inner ones.
   * Resolution is 1 ms, so callers should repeat and aggregate.
   */
  async serverElapsedMs(sqlText: string, params: unknown[]): Promise<number> {
    const pool = await this.getPool();
    const request = pool.request();
    const times: number[] = [];
    request.on("info", (info: { message?: string }) => {
      const m = /Execution Times[\s\S]*?elapsed time = (\d+) ms/.exec(info.message ?? "");
      if (m) times.push(Number(m[1]));
    });
    params.forEach((v, i) => request.input(`p${i}`, v));
    let idx = 0;
    const text = params.length > 0 ? sqlText.replace(/\?/g, () => `@p${idx++}`) : sqlText;
    await request.query(`SET STATISTICS TIME ON; ${text}`);
    await pool.request().query("SET STATISTICS TIME OFF");
    return times.length ? Math.max(...times) : NaN;
  }

  async loadRowsBulk(
    table: string,
    rows: Record<string, unknown>[],
    wrap?: Record<string, (placeholder: string) => string>
  ): Promise<void> {
    if (rows.length === 0) return;
    const pool = await this.getPool();
    const columns = Object.keys(rows[0]);
    const perStatement = Math.min(1000, Math.max(1, Math.floor(2000 / columns.length)));   // SQL Server: 2100 parameters, 1000 row values
    for (let i = 0; i < rows.length; i += perStatement) {
      const request = pool.request();
      let p = 0;
      const tuples = rows.slice(i, i + perStatement).map(
        (row) =>
          "(" +
          columns
            .map((col) => {
              const ph = `@p${p}`;
              request.input(`p${p}`, row[col]);
              p++;
              return wrap?.[col] ? wrap[col](ph) : ph;
            })
            .join(", ") +
          ")"
      );
      await request.query(`INSERT INTO ${table} (${columns.map((c) => `[${c}]`).join(", ")}) VALUES ${tuples.join(", ")}`);
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
