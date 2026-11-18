# step2-coverage tasks
Requirements: `requirements.md`. Design: `design.md`. Dates (owner, T1): A by 2026-11-22, B by 2026-11-25, C only if A and B are done by 2026-11-26.

## Tooling
- [x] `agreed-tests --negative-control`: corrupted copy of case 1 in memory, must fail on both engines, other cases pass; output in `evidence/agreed-controls/<db>/<Object>.txt`; writes nothing else (`src/agreed/controls.ts`, unit tests in `controls.test.ts`)
- [x] Control checked on two pilot objects first: `Sales.vSalesPerson` (value) and `Website.ChangePassword` (outcome) seen failing on both engines; no pair record changed

## Tranche A — fixed cases, no generator change (20 pending objects)
- [x] Batch 1, scalar functions without tables: `dbo.ufnGetAccountingStartDate`, `dbo.ufnGetAccountingEndDate`, `dbo.ufnGetDocumentStatusText`, `dbo.ufnGetPurchaseOrderStatusText`, `dbo.ufnGetSalesOrderStatusText`, `dbo.ufnLeadingZeros` — step 2 pass on both engines, labels checked against the captured values, negative controls seen failing, review packets
- [x] Batch 2: `dbo.ufnGetContactInformation` and AdventureWorks views (`HumanResources.vEmployeeDepartment`, `vEmployeeDepartmentHistory`, `Person.vStateProvinceCountryRegion`, `Production.vProductAndDescription`) — step 2 pass on both engines, labels and row counts checked against the captured values, negative controls seen failing, review packets
  - [x] Generator: schema-bound objects empty their tables with DELETE instead of tSQLt.FakeTable (`tsqltScript` option `schemaBound`, unit tests in `generate.test.ts`)
  - [x] Finding: `Person.vStateProvinceCountryRegion` joined case-sensitively and counted trailing spaces; conversion fixed (draft kept), regression cases kept, step 3 re-run (three targeted planted defects caught), see design.md
  - [x] `ufnGetContactInformation`: a person who is also a store's customer added, so the agreed tests catch the planted defect "consumer rows include store customers" (3 of 3)
- [ ] Follow-up (not in this tranche): step 3 generator producing text keys that differ only in case or trailing spaces, so CI-collation joins are tested on random data too
- [x] Batch 3: AdventureWorks views (`Purchasing.vVendorWithAddresses`, `vVendorWithContacts`, `Sales.vSalesPersonSalesByFiscalYears`, `vStoreWithAddresses`, `vStoreWithContacts`) — step 2 pass on both engines, labels and row counts checked against the captured values, negative controls seen failing, review packets
  - [x] Finding (same as batch 2): `Purchasing.vVendorWithAddresses` and `Sales.vStoreWithAddresses` joined CountryRegionCode case-sensitively and counted trailing spaces; both conversions corrected the same way (drafts kept), regression cases kept, step 3 re-run (three targeted planted defects caught each)
- [x] Batch 4: WideWorldImporters `Integration.GetPurchaseUpdates`, `GetSaleUpdates`, `GetStockHoldingUpdates`, `GetTransactionUpdates` — step 2 pass on both engines (window edges to the microsecond), labels and row counts checked against the captured values, negative controls seen failing, review packets. `GetStockHoldingUpdates`' planted defect "descending order" is not caught by the agreed tests by design (they compare multisets; order is step 3's, which catches it)
- [ ] Optional (fail step 4 whatever step 2 says): `dbo.ufnGetProductDealerPrice`, `ufnGetProductListPrice`, `ufnGetProductStandardCost`, `ufnGetStock`

## Tranche B — generator support (9 pending objects)
- [ ] JSON results: `Website.SearchForPeople`, `SearchForStockItems`, `SearchForStockItemsByTags` (and, failing step 4, `SearchForCustomers`, `SearchForSuppliers`)
- [x] Declared result errors: `dbo.uspGetBillOfMaterials`, `dbo.uspGetWhereUsedProductID` — generator support (`ExpectedCase.raised`, outcome assertion on both engines, unit tests in `generate.test.ts`); step 2 pass on both engines (cases 1 and 3 raise MAXRECURSION, 2/4/5 complete), 4 of 4 planted defects caught by the agreed tests, negative controls (raised -> completed) seen failing, review packets
- [x] Geography / xml columns: `Sales.vIndividualCustomer`, `HumanResources.vEmployee`, `Website.Customers`, `Website.Suppliers` — generator support (WKT per engine; xml as text, explicit CONVERT on SQL Server; unit tests), fixed cases written for the three that had none, step 2 pass on both engines, negative controls seen failing, review packets
  - [x] Finding (CI_AS CountryRegionCode join) in `HumanResources.vEmployee`, `Sales.vIndividualCustomer` and the verified `Sales.vSalesPerson`: regression cases (`countryCodeVariants()`), conversions corrected (drafts kept), step 3 re-run; `Sales.vSalesPerson` step 5 reset (its review covered the previous code)
- [ ] A negative control seen failing for each new feature before a pass is trusted

## Tranche C — data-changing procedures (only if A and B are done by 2026-11-26)
- [ ] `Sequences.ReseedSequenceBeyondTableValues`, `Website.InsertCustomerOrders`, `Website.InvoiceCustomerOrders`, `Website.RecordColdRoomTemperatures`
