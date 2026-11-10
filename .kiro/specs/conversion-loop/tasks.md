# conversion-loop tasks

- [x] Generic spec types, DDL generation and type mappings (`harness/generic/spec.ts`)
- [x] Data generation with trap biases and shared key universe (`harness/generic/rows.ts`)
- [x] Comparator with order-key groups and µs timestamps (`harness/generic/compare.ts`)
- [x] Runner: scratch DB, both engines, property, fixed cases, vacuity guard (`harness/generic/run.ts`)
- [x] `convert` CLI: draft check, final, mutants, pair record (`cli/convert.ts`)
- [x] Specs and conversions: GetMovementUpdates (re-verified), GetOrderUpdates, GetPurchaseUpdates, GetSaleUpdates, GetStockHoldingUpdates, GetTransactionUpdates
- [x] Retire the single-object harness (verify/property/defect-check/generators/compare, init-script functions)
- [x] Receipts show first-draft result, coverage, traps, mutants and the datetime finding
- [x] Scalar function Website.CalculateCustomerPrice (PL/pgSQL with variables, aggregates, BETWEEN, NULL handling); harness extended with call arguments and scalar results
- [x] Views Website.Customers and Website.Suppliers: recorded as FAILED, not hidden. Both expose a SQL Server `geography` column with no PostgreSQL equivalent without PostGIS (not in the pinned image). All other columns match on ~96% of generated samples. DECISION NEEDED: add PostGIS to the pinned image, or accept the gap.
- [ ] Application.DetermineCustomerAccess: depends on IS_ROLEMEMBER, ORIGINAL_LOGIN() and SESSION_CONTEXT (database security context, not data). Needs a decision on how roles and session context map to PostgreSQL before it can be converted honestly.
- [ ] Website.Search* procedures (FOR JSON), Website.ActivateWebsiteLogon / ChangePassword
- [ ] State-changing procedures (Application.Configuration_*, DataLoadSimulation.*, Sequences.ReseedAllSequences): need a different check, comparing table state after the same call on both engines
- [ ] Medium procedures (13) and AdventureWorks2025 objects
- [ ] Steps 2, 4, 5 and 6 of the verification standard for any object
