# step2-coverage tasks
Requirements: `requirements.md`. Design: `design.md`. Dates (owner, T1): A by 2026-11-22, B by 2026-11-25, C only if A and B are done by 2026-11-26.

## Tooling
- [x] `agreed-tests --negative-control`: corrupted copy of case 1 in memory, must fail on both engines, other cases pass; output in `evidence/agreed-controls/<db>/<Object>.txt`; writes nothing else (`src/agreed/controls.ts`, unit tests in `controls.test.ts`)
- [x] Control checked on two pilot objects first: `Sales.vSalesPerson` (value) and `Website.ChangePassword` (outcome) seen failing on both engines; no pair record changed

## Tranche A — fixed cases, no generator change (20 pending objects)
- [x] Batch 1, scalar functions without tables: `dbo.ufnGetAccountingStartDate`, `dbo.ufnGetAccountingEndDate`, `dbo.ufnGetDocumentStatusText`, `dbo.ufnGetPurchaseOrderStatusText`, `dbo.ufnGetSalesOrderStatusText`, `dbo.ufnLeadingZeros` — step 2 pass on both engines, labels checked against the captured values, negative controls seen failing, review packets
- [ ] Batch 2: `dbo.ufnGetContactInformation` and AdventureWorks views (`HumanResources.vEmployeeDepartment`, `vEmployeeDepartmentHistory`, `Person.vStateProvinceCountryRegion`, `Production.vProductAndDescription`)
- [ ] Batch 3: AdventureWorks views (`Purchasing.vVendorWithAddresses`, `vVendorWithContacts`, `Sales.vSalesPersonSalesByFiscalYears`, `vStoreWithAddresses`, `vStoreWithContacts`)
- [ ] Batch 4: WideWorldImporters `Integration.GetPurchaseUpdates`, `GetSaleUpdates`, `GetStockHoldingUpdates`, `GetTransactionUpdates`
- [ ] Optional (fail step 4 whatever step 2 says): `dbo.ufnGetProductDealerPrice`, `ufnGetProductListPrice`, `ufnGetProductStandardCost`, `ufnGetStock`

## Tranche B — generator support (9 pending objects)
- [ ] JSON results: `Website.SearchForPeople`, `SearchForStockItems`, `SearchForStockItemsByTags` (and, failing step 4, `SearchForCustomers`, `SearchForSuppliers`)
- [ ] Declared result errors: `dbo.uspGetBillOfMaterials`, `dbo.uspGetWhereUsedProductID`
- [ ] Geography / xml columns: `Sales.vIndividualCustomer`, `HumanResources.vEmployee`, `Website.Customers`, `Website.Suppliers`
- [ ] A negative control seen failing for each new feature before a pass is trusted

## Tranche C — data-changing procedures (only if A and B are done by 2026-11-26)
- [ ] `Sequences.ReseedSequenceBeyondTableValues`, `Website.InsertCustomerOrders`, `Website.InvoiceCustomerOrders`, `Website.RecordColdRoomTemperatures`
