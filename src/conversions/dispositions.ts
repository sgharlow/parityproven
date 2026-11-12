/**
 * Objects that are not converted, and why. Decided by the project owner on 2026-11-11 (conversion-loop tasks, items 1B/2B).
 *
 *  failed   : in scope, not converted. Written as a pair record with status "failed" (npm run dispositions), so it is
 *             counted and shown like any other miss.
 *  excluded : out of scope. Not a pair record; listed on the scorecard with its reason and still counted in the inventory total.
 */

export interface Disposition {
  database: string;
  schema: string;
  name: string;
  kind: "failed" | "excluded";
  reason: string;
}

const WWI = "WideWorldImporters";
const ADMIN = "Database-administration script, not application logic:";
const SIM = "Part of the WideWorldImporters data-load simulation (tooling that generates the sample's history), not application logic:";

export const DISPOSITIONS: Disposition[] = [
  {
    database: WWI, schema: "Application", name: "DetermineCustomerAccess", kind: "failed",
    reason:
      "Not converted. The result depends on the caller's security context, not on table data: IS_ROLEMEMBER(N'db_owner'), " +
      "IS_ROLEMEMBER(<SalesTerritory> + N' Sales'), ORIGINAL_LOGIN() = N'Website' and SESSION_CONTEXT(N'SalesTerritory'). " +
      "PostgreSQL has counterparts (pg_has_role, session_user, current_setting), but proving equivalence needs the harness to run " +
      "each sample under real logins and roles on both engines, which it does not do. Recorded as a failure, not hidden (decision 2026-11-11).",
  },

  // Application: database administration
  { database: WWI, schema: "Application", name: "AddRoleMemberIfNonexistent", kind: "excluded", reason: `${ADMIN} adds a database user to a role with dynamic SQL.` },
  { database: WWI, schema: "Application", name: "CreateRoleIfNonexistent", kind: "excluded", reason: `${ADMIN} creates a database role with dynamic SQL.` },
  { database: WWI, schema: "Application", name: "Configuration_ApplyAuditing", kind: "excluded", reason: `${ADMIN} creates SQL Server Audit objects. PostgreSQL core has no built-in audit equivalent.` },
  { database: WWI, schema: "Application", name: "Configuration_RemoveAuditing", kind: "excluded", reason: `${ADMIN} removes the SQL Server Audit objects created by Configuration_ApplyAuditing.` },
  { database: WWI, schema: "Application", name: "Configuration_ApplyColumnstoreIndexing", kind: "excluded", reason: `${ADMIN} creates columnstore indexes. PostgreSQL core has no columnstore index.` },
  { database: WWI, schema: "Application", name: "Configuration_ApplyFullTextIndexing", kind: "excluded", reason: `${ADMIN} creates full-text catalogs and indexes. PostgreSQL full-text search (tsvector) is a different design, not a translation of this script.` },
  { database: WWI, schema: "Application", name: "Configuration_ApplyPartitioning", kind: "excluded", reason: `${ADMIN} creates partition functions and schemes and rebuilds tables on them. PostgreSQL declarative partitioning is a different DDL model.` },
  { database: WWI, schema: "Application", name: "Configuration_ApplyRowLevelSecurity", kind: "excluded", reason: `${ADMIN} creates security policies over Application.DetermineCustomerAccess (recorded as failed).` },
  { database: WWI, schema: "Application", name: "Configuration_RemoveRowLevelSecurity", kind: "excluded", reason: `${ADMIN} drops the security policies created by Configuration_ApplyRowLevelSecurity.` },
  { database: WWI, schema: "Application", name: "Configuration_EnableInMemory", kind: "excluded", reason: `${ADMIN} adds a memory-optimized filegroup and recreates tables and table types as memory-optimized. PostgreSQL has no equivalent.` },
  { database: WWI, schema: "Application", name: "Configuration_ConfigureForEnterpriseEdition", kind: "excluded", reason: `${ADMIN} runs Configuration_ApplyColumnstoreIndexing, _ApplyFullTextIndexing, _EnableInMemory and _ApplyPartitioning (all excluded).` },

  // DataLoadSimulation: sample-data tooling
  { database: WWI, schema: "DataLoadSimulation", name: "Configuration_ApplyDataLoadSimulationProcedures", kind: "excluded", reason: `${SIM} creates the simulation procedures.` },
  { database: WWI, schema: "DataLoadSimulation", name: "Configuration_RemoveDataLoadSimulationProcedures", kind: "excluded", reason: `${SIM} drops the simulation procedures.` },
  { database: WWI, schema: "DataLoadSimulation", name: "PopulateDataToCurrentDate", kind: "excluded", reason: `${SIM} installs the simulation, runs it up to yesterday and removes it again.` },
  { database: WWI, schema: "DataLoadSimulation", name: "DeactivateTemporalTablesBeforeDataLoad", kind: "excluded", reason: `${SIM} turns system versioning off before a load.` },
  { database: WWI, schema: "DataLoadSimulation", name: "ReactivateTemporalTablesAfterDataLoad", kind: "excluded", reason: `${SIM} turns system versioning back on after a load.` },

  // Sequences
  {
    database: WWI, schema: "Sequences", name: "ReseedAllSequences", kind: "excluded",
    reason: "A fixed list of calls to Sequences.ReseedSequenceBeyondTableValues, one per sequence in the sample schema. The logic is in that procedure, which is converted and verified separately.",
  },
];
