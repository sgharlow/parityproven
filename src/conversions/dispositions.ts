/**
 * Objects that are not converted, and why. Decided by the project owner on 2026-11-11 (conversion-loop tasks, items 1B/2B).
 *
 *  failed   : in scope, not converted. Written as a pair record with status "failed" (npm run dispositions), so it is
 *             counted and shown like any other miss.
 *  excluded : out of scope. Not a pair record; listed on the scorecard with its reason and still counted in the inventory total.
 *  not-attempted : in scope, but no conversion was attempted before work on the database stopped (decision G2, 2026-11-12).
 *             Not a pair record; listed on the scorecard with what it would need (decision M2A), so no inventoried object is missing.
 */

export interface Disposition {
  database: string;
  schema: string;
  name: string;
  kind: "failed" | "excluded" | "not-attempted";
  reason: string;
}

const WWI = "WideWorldImporters";
const AW = "AdventureWorks2025";
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

  // Predicted on 2026-11-08 to fail; recorded as not converted (decision G1a, 2026-11-12). Not attempted, so the
  // prediction is not tested by these records.
  ...([
    ["GetCityUpdates", "Application.Cities", 9],
    ["GetCustomerUpdates", "Sales.Customers", 15],
    ["GetEmployeeUpdates", "Application.People", 1],
    ["GetPaymentMethodUpdates", "Application.PaymentMethods", 1],
    ["GetStockItemUpdates", "Warehouse.StockItems", 4],
    ["GetSupplierUpdates", "Purchasing.Suppliers", 6],
    ["GetTransactionTypeUpdates", "Application.TransactionTypes", 1],
  ] as const).map(([name, table, n]): Disposition => ({
    database: WWI, schema: "Integration", name, kind: "failed",
    reason:
      `Not converted. It walks a cursor over the changes in the cutoff window and reads ${table} FOR SYSTEM_TIME AS OF ` +
      `each change time (${n} such read${n === 1 ? "" : "s"}), collecting rows in a #temp table. PostgreSQL has no system-versioned temporal ` +
      "tables; a faithful conversion needs history tables and an AS OF emulation, which is out of scope for this phase " +
      "(decision 2026-11-12). Predicted on 2026-11-08 to fail; not attempted.",
  })),
  {
    database: WWI, schema: "Website", name: "VehicleTemperatures", kind: "failed",
    reason:
      "Not converted. Rows marked IsCompressed are decoded with DECOMPRESS (GZIP) and cast to nvarchar. PostgreSQL has no " +
      "built-in GZIP decompression; it would need an extension or decoding outside the database (decision 2026-11-12). " +
      "Predicted on 2026-11-08 to fail; not attempted.",
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
  // AdventureWorks2025: in scope, not attempted (work on the database stopped 2026-11-12, decision G2). Triaged 2026-11-12;
  // the features named are those found in each definition.
  ...([
    ["HumanResources", "vJobCandidate"], ["HumanResources", "vJobCandidateEducation"], ["HumanResources", "vJobCandidateEmployment"],
    ["Person", "vAdditionalContactInfo"], ["Production", "vProductModelCatalogDescription"], ["Production", "vProductModelInstructions"],
    ["Sales", "vPersonDemographics"], ["Sales", "vStoreWithDemographics"],
  ] as const).map(([schema, name]): Disposition => ({
    database: AW, schema, name, kind: "not-attempted",
    reason: "Not attempted. Reads xml columns with XQuery methods (.value, .nodes); needs XML document generators in the harness and an XPath/xmltable conversion.",
  })),
  ...([
    ["dbo", "uspGetEmployeeManagers"], ["dbo", "uspGetManagerEmployees"],
  ] as const).map(([schema, name]): Disposition => ({
    database: AW, schema, name, kind: "not-attempted",
    reason: "Not attempted. Walks the hierarchyid OrganizationNode column (GetAncestor, GetLevel); needs a hierarchyid mapping decision (for example ltree or a path string) first.",
  })),
  { database: AW, schema: "HumanResources", name: "uspUpdateEmployeeLogin", kind: "not-attempted", reason: "Not attempted. Updates a hierarchyid column inside TRY/CATCH and calls dbo.uspLogError (not attempted); needs the hierarchyid mapping and the error-handling procedures first." },
  { database: AW, schema: "HumanResources", name: "uspUpdateEmployeeHireInfo", kind: "not-attempted", reason: "Not attempted. Changes data inside TRY/CATCH with an explicit transaction and calls dbo.uspLogError (not attempted)." },
  { database: AW, schema: "HumanResources", name: "uspUpdateEmployeePersonalInfo", kind: "not-attempted", reason: "Not attempted. Changes data inside TRY/CATCH and calls dbo.uspLogError (not attempted)." },
  { database: AW, schema: "dbo", name: "uspLogError", kind: "not-attempted", reason: "Not attempted. Error-handling procedure: reads ERROR_NUMBER(), ERROR_MESSAGE() and related functions inside a CATCH block and writes dbo.ErrorLog; needs a harness mode that raises errors on both engines first." },
  { database: AW, schema: "dbo", name: "uspPrintError", kind: "not-attempted", reason: "Not attempted. Prints ERROR_* function values inside a CATCH block; output is a message, not rows or table state, so the harness has nothing to compare yet." },
  { database: AW, schema: "dbo", name: "uspSearchCandidateResumes", kind: "not-attempted", reason: "Not attempted. Uses full-text search predicates; the scratch database has no full-text index, and PostgreSQL text search ranks differently, so this is a likely recorded failure." },
  ...([
    ["HumanResources", "dEmployee"], ["Person", "iuPerson"], ["Production", "iWorkOrder"], ["Production", "uWorkOrder"],
    ["Purchasing", "dVendor"], ["Purchasing", "iPurchaseOrderDetail"], ["Purchasing", "uPurchaseOrderDetail"],
    ["Purchasing", "uPurchaseOrderHeader"], ["Sales", "iduSalesOrderDetail"], ["Sales", "uSalesOrderHeader"],
  ] as const).map(([schema, name]): Disposition => ({
    database: AW, schema, name, kind: "not-attempted",
    reason: "Not attempted. Trigger (in scope by ruling R11): needs a trigger mode in the harness (the same generated INSERT, UPDATE or DELETE on both engines, then every table it writes compared). Most of these triggers also call dbo.uspLogError, which is not attempted.",
  })),
];