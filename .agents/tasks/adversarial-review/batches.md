# Adversarial review: the 44 objects in 4 batches

Selected from `pairs/<db>/*.json` at base commit 9719595: status `pending` or `verified`, steps 1-3 `pass`, step 4 `pass` or `n/a`. That is 44 objects: 37 pending and 7 verified. Order: database, then qualified object name (case-insensitive). Excluded: the 8 objects at status `failed` (`Website.SearchForCustomers` and `Website.SearchForSuppliers` fail step 4; the other six are not converted).

The `batch-<n>` argument of the new CLI reads this file. The CLI also refuses an object whose pair record no longer matches the "Status at base" column's selection rule (not pending or verified, or a step 1-4 not pass/n-a).

## Batch 1

| # | Database | Object | Class | Status at base |
|---|---|---|---|---|
| 1 | AdventureWorks2025 | dbo.ufnGetAccountingEndDate | function | pending |
| 2 | AdventureWorks2025 | dbo.ufnGetAccountingStartDate | function | pending |
| 3 | AdventureWorks2025 | dbo.ufnGetContactInformation | function | pending |
| 4 | AdventureWorks2025 | dbo.ufnGetDocumentStatusText | function | pending |
| 5 | AdventureWorks2025 | dbo.ufnGetProductDealerPrice | function | pending |
| 6 | AdventureWorks2025 | dbo.ufnGetProductListPrice | function | pending |
| 7 | AdventureWorks2025 | dbo.ufnGetProductStandardCost | function | pending |
| 8 | AdventureWorks2025 | dbo.ufnGetPurchaseOrderStatusText | function | pending |
| 9 | AdventureWorks2025 | dbo.ufnGetSalesOrderStatusText | function | pending |
| 10 | AdventureWorks2025 | dbo.ufnGetStock | function | pending |
| 11 | AdventureWorks2025 | dbo.ufnLeadingZeros | function | pending |

## Batch 2

| # | Database | Object | Class | Status at base |
|---|---|---|---|---|
| 12 | AdventureWorks2025 | dbo.uspGetBillOfMaterials | procedure | pending |
| 13 | AdventureWorks2025 | dbo.uspGetWhereUsedProductID | procedure | pending |
| 14 | AdventureWorks2025 | HumanResources.vEmployee | view | pending |
| 15 | AdventureWorks2025 | HumanResources.vEmployeeDepartment | view | pending |
| 16 | AdventureWorks2025 | HumanResources.vEmployeeDepartmentHistory | view | pending |
| 17 | AdventureWorks2025 | Person.vStateProvinceCountryRegion | view | pending |
| 18 | AdventureWorks2025 | Production.vProductAndDescription | view | pending |
| 19 | AdventureWorks2025 | Purchasing.vVendorWithAddresses | view | pending |
| 20 | AdventureWorks2025 | Purchasing.vVendorWithContacts | view | pending |
| 21 | AdventureWorks2025 | Sales.vIndividualCustomer | view | pending |
| 22 | AdventureWorks2025 | Sales.vSalesPerson | view | verified |

## Batch 3

| # | Database | Object | Class | Status at base |
|---|---|---|---|---|
| 23 | AdventureWorks2025 | Sales.vSalesPersonSalesByFiscalYears | view | pending |
| 24 | AdventureWorks2025 | Sales.vStoreWithAddresses | view | pending |
| 25 | AdventureWorks2025 | Sales.vStoreWithContacts | view | pending |
| 26 | WideWorldImporters | Integration.GetMovementUpdates | procedure | verified |
| 27 | WideWorldImporters | Integration.GetOrderUpdates | procedure | verified |
| 28 | WideWorldImporters | Integration.GetPurchaseUpdates | procedure | pending |
| 29 | WideWorldImporters | Integration.GetSaleUpdates | procedure | pending |
| 30 | WideWorldImporters | Integration.GetStockHoldingUpdates | procedure | pending |
| 31 | WideWorldImporters | Integration.GetTransactionUpdates | procedure | pending |
| 32 | WideWorldImporters | Sequences.ReseedSequenceBeyondTableValues | procedure | pending |
| 33 | WideWorldImporters | Website.ActivateWebsiteLogon | procedure | verified |

## Batch 4

| # | Database | Object | Class | Status at base |
|---|---|---|---|---|
| 34 | WideWorldImporters | Website.CalculateCustomerPrice | function | verified |
| 35 | WideWorldImporters | Website.ChangePassword | procedure | verified |
| 36 | WideWorldImporters | Website.Customers | view | pending |
| 37 | WideWorldImporters | Website.InsertCustomerOrders | procedure | pending |
| 38 | WideWorldImporters | Website.InvoiceCustomerOrders | procedure | pending |
| 39 | WideWorldImporters | Website.RecordColdRoomTemperatures | procedure | pending |
| 40 | WideWorldImporters | Website.RecordVehicleTemperature | procedure | verified |
| 41 | WideWorldImporters | Website.SearchForPeople | procedure | pending |
| 42 | WideWorldImporters | Website.SearchForStockItems | procedure | pending |
| 43 | WideWorldImporters | Website.SearchForStockItemsByTags | procedure | pending |
| 44 | WideWorldImporters | Website.Suppliers | view | pending |
