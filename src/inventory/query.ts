/**
 * Inventory query: retrieves all non-system programmable objects from a SQL Server database.
 * Read-only — makes no schema changes.
 */

import type { MssqlClient } from "../harness/clients/mssql-client.js";
import type { InventoryItem } from "./types.js";
import type { ObjectClass } from "../pairs/schema.js";
import { classifyTier } from "./tier.js";

const INVENTORY_SQL = `
SELECT
  SCHEMA_NAME(o.schema_id)  AS schema_name,
  o.name                    AS object_name,
  o.type                    AS type_code,
  m.definition              AS definition
FROM sys.objects o
JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.is_ms_shipped = 0
  AND o.type IN ('P ', 'FN', 'IF', 'TF', 'V ', 'TR')
ORDER BY o.type, SCHEMA_NAME(o.schema_id), o.name;
`.trim();

/** Map SQL Server object type codes to ObjectClass vocabulary. */
function typeCodeToObjectClass(typeCode: string): ObjectClass {
  const t = typeCode.trim().toUpperCase();
  if (t === "P")  return "procedure";
  if (t === "FN" || t === "IF" || t === "TF") return "function";
  if (t === "V")  return "view";
  if (t === "TR") return "trigger";
  throw new Error(`Unknown object type code: '${typeCode}'`);
}

export async function runInventoryQuery(
  client: MssqlClient,
  _database: string           // database is already set on the client's connection
): Promise<InventoryItem[]> {
  const rowSet = await client.query(INVENTORY_SQL, []);

  return rowSet.rows.map((row) => {
    const schemaName  = String(row[0] ?? "");
    const objectName  = String(row[1] ?? "");
    const typeCode    = String(row[2] ?? "");
    const definition  = String(row[3] ?? "");

    const objectClass = typeCodeToObjectClass(typeCode);
    const tier        = classifyTier(definition);

    return { schemaName, objectName, objectClass, tier, definition };
  });
}
