# conversion-loop tasks

- [x] Generic spec types, DDL generation and type mappings (`harness/generic/spec.ts`)
- [x] Data generation with trap biases and shared key universe (`harness/generic/rows.ts`)
- [x] Comparator with order-key groups and µs timestamps (`harness/generic/compare.ts`)
- [x] Runner: scratch DB, both engines, property, fixed cases, vacuity guard (`harness/generic/run.ts`)
- [x] `convert` CLI: draft check, final, mutants, pair record (`cli/convert.ts`)
- [x] Specs and conversions: GetMovementUpdates (re-verified), GetOrderUpdates, GetPurchaseUpdates, GetSaleUpdates, GetStockHoldingUpdates, GetTransactionUpdates
- [x] Retire the single-object harness (verify/property/defect-check/generators/compare, init-script functions)
- [x] Receipts show first-draft result, coverage, traps, mutants and the datetime finding
- [ ] Remaining WWI simple procedures: Application.*, DataLoadSimulation.*, Sequences.ReseedAllSequences, Website.* (configuration and data-load scripts need a different verification approach: they change state rather than return rows)
- [ ] Functions: Website.CalculateCustomerPrice, Application.DetermineCustomerAccess
- [ ] Views: Website.Customers, Website.Suppliers
- [ ] Medium procedures (13) and AdventureWorks2025 objects
- [ ] Steps 2, 4, 5 and 6 of the verification standard for any object
