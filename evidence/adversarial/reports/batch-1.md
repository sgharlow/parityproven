# Adversarial evidence report: batch 1

Built 2026-11-19 by `npm run adversarial -- report --batch 1` from the evidence JSON and pair records. The cases are agent-written; expected values were captured from the original T-SQL. The gate result below is computed by code from engine results.

| Object | Cases | Gate | Mutant adequacy | Same model |
|---|---|---|---|---|
| AdventureWorks2025 dbo.ufnGetAccountingEndDate | 1 adversarial case ran, 0 differed | FAIL | adequate | no |
| AdventureWorks2025 dbo.ufnGetAccountingStartDate | 1 adversarial case ran, 0 differed | FAIL | adequate | no |
| AdventureWorks2025 dbo.ufnGetContactInformation | 12 adversarial cases ran, 0 differed | FAIL | inadequate | no |
| AdventureWorks2025 dbo.ufnGetDocumentStatusText | 6 adversarial cases ran, 0 differed | FAIL | adequate | no |
| AdventureWorks2025 dbo.ufnGetProductDealerPrice | 19 adversarial cases ran, 6 differed | FAIL | adequate | no |
| AdventureWorks2025 dbo.ufnGetProductListPrice | 19 adversarial cases ran, 0 differed | pass | adequate | no |
| AdventureWorks2025 dbo.ufnGetProductStandardCost | 19 adversarial cases ran, 0 differed | pass | adequate | no |
| AdventureWorks2025 dbo.ufnGetPurchaseOrderStatusText | 6 adversarial cases ran, 0 differed | FAIL | adequate | no |
| AdventureWorks2025 dbo.ufnGetSalesOrderStatusText | 6 adversarial cases ran, 0 differed | FAIL | inadequate | no |
| AdventureWorks2025 dbo.ufnGetStock | 7 adversarial cases ran, 0 differed | FAIL | adequate | no |
| AdventureWorks2025 dbo.ufnLeadingZeros | 8 adversarial cases ran, 0 differed | FAIL | adequate | no |

## AdventureWorks2025 dbo.ufnGetAccountingEndDate

1 adversarial case ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetAccountingEndDate.json`.

- objection O01 is open

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 1 adversarial case ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 200 rows compared, seeds 1059531247. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: DATEADD(millisecond, -2, '20040701') on datetime rounds to .997, not .998: SQL Server datetime has 3.33 ms resolution. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | no mappings recorded |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 1, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetAccountingEndDate.adversarial.expected.json. Cases: A01 midnight minus 2 ms on datetime: the result is the .997 tick, kept at 3 digits (not .998, not rounded to the second) |

Objections:
- O01 (duplicate, open): A01 sends the same complete payload as the sole hand-derived fixed case: no arguments and no tables. Both cases assert the same .997 datetime result and type, so A01 adds no distinct attack input.

Cases:
- A01 midnight minus 2 ms on datetime: the result is the .997 tick, kept at 3 digits (not .998, not rounded to the second): SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetAccountingStartDate

1 adversarial case ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetAccountingStartDate.json`.

- objection O01 is open

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 1 adversarial case ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 200 rows compared, seeds 981850092. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | no mappings recorded |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 1, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetAccountingStartDate.adversarial.expected.json. Cases: A01 the result keeps datetime's 3-digit precision and midnight exactly (no time-zone shift, no date-only value) |

Objections:
- O01 (duplicate, open): A01 sends the same complete payload as the sole hand-derived fixed case: no arguments and no tables. Both cases assert the same midnight timestamp value and type, so A01 adds no distinct attack input.

Cases:
- A01 the result keeps datetime's 3-digit precision and midnight exactly (no time-zone shift, no date-only value): SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetContactInformation

12 adversarial cases ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetContactInformation.json`.

- objection O01 is open
- objection O02 is open
- mutant adequacy is inadequate (unexplained misses: consumer rows include store customers)

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 12 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 417 rows compared, seeds 972221060. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: attacker says not applicable: No text input column can hold NULL: Person.FirstName, Person.LastName, Employee.JobTitle and ContactType.Name are NOT NULL in the spec (as in AdventureWorks), so a NULL text value cannot be loaded. The NULL-versus-'' contrast exists only in the output and is attacked there by A01: the same person gets an Employee row with JobTitle '' and a Consumer row whose JobTitle is the NULL the function writes. (auditor accepted) |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: covered by A03 ("ann" and "ANN" differ only in case) |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: covered by A02 ("Ann " ends in a space)<br>top-ties: not applicable to this object's inputs<br>identity-gaps: covered by A05 (Person.Person.BusinessEntityID jumps from 1 to 500) |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: Multi-statement table-valued function: the table variable it fills becomes RETURN QUERY steps in a PL/pgSQL set-returning function. The rows a person gets (one per role) are compared as a multiset; the source does not define their order. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | int NOT NULL -> integer NOT NULL; nvarchar(50) NOT NULL -> varchar(50) NOT NULL; int NULL -> integer |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: inadequate; caught 2, missed 1 (equivalent recorded: 0), not deployable 0. Missed: consumer rows include store customers. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetContactInformation.adversarial.expected.json. Cases: A01 one person is an employee with JobTitle '' and a consumer (JobTitle NULL): two rows, '' and NULL kept apart; empty LastName kept; A02 trailing spaces in FirstName, JobTitle and the contact type name, and a LastName of one space, are returned as stored; A03 contact types 'Owner' and 'OWNER' for the same vendor contact give two rows that differ only in case; names keep their case; A04 non-ASCII names and job title (Zoë, 李, Ingénieur, Владелец) come back unchanged; A05 person keys with gaps (1, 500, 2147483647): the int-maximum person is a store contact and an employee; A06 an entity that is both a vendor and a store: one contact row gives a Vendor Contact and a Store Contact row; A07 the same vendor-contact row twice (no key on BusinessEntityContact): two identical Vendor Contact rows; A08 PersonID 0 is an ordinary person (a consumer), not 'no person': one Consumer row; A09 a negative PersonID (-1) who is an employee: one Employee row; A10 a customer row with NULL PersonID and NULL StoreID does not make anyone a consumer: no rows for person 1; A11 names and job title at the 50-character limit come back whole; A12 a store contact through two contact types plus a store customer row: two Store Contact rows, no Consumer row |

Objections:
- O01 (duplicate, open): The hand-derived person-1 case already makes the vendor and store predicates true in the same call and requires rows from both independent branches. It already catches the ELSIF or early-return defect named for A06; using one entity in both tables does not create a distinct attack on that mechanism.
- O02 (not-an-attack, open): A07 duplicates the same (BusinessEntityID, PersonID, ContactTypeID) row, but those three columns form the source table's composite primary key. The claim that BusinessEntityContact has no key is false, and this input cannot occur under the source schema preconditions.

Cases:
- A01 one person is an employee with JobTitle '' and a consumer (JobTitle NULL): two rows, '' and NULL kept apart; empty LastName kept: SQL Server pass, PostgreSQL pass; traps none
- A02 trailing spaces in FirstName, JobTitle and the contact type name, and a LastName of one space, are returned as stored: SQL Server pass, PostgreSQL pass; traps trailing-spaces
- A03 contact types 'Owner' and 'OWNER' for the same vendor contact give two rows that differ only in case; names keep their case: SQL Server pass, PostgreSQL pass; traps collation-case
- A04 non-ASCII names and job title (Zoë, 李, Ingénieur, Владелец) come back unchanged: SQL Server pass, PostgreSQL pass; traps none
- A05 person keys with gaps (1, 500, 2147483647): the int-maximum person is a store contact and an employee: SQL Server pass, PostgreSQL pass; traps identity-gaps
- A06 an entity that is both a vendor and a store: one contact row gives a Vendor Contact and a Store Contact row: SQL Server pass, PostgreSQL pass; traps none
- A07 the same vendor-contact row twice (no key on BusinessEntityContact): two identical Vendor Contact rows: SQL Server pass, PostgreSQL pass; traps none
- A08 PersonID 0 is an ordinary person (a consumer), not 'no person': one Consumer row: SQL Server pass, PostgreSQL pass; traps none
- A09 a negative PersonID (-1) who is an employee: one Employee row: SQL Server pass, PostgreSQL pass; traps none
- A10 a customer row with NULL PersonID and NULL StoreID does not make anyone a consumer: no rows for person 1: SQL Server pass, PostgreSQL pass; traps none
- A11 names and job title at the 50-character limit come back whole: SQL Server pass, PostgreSQL pass; traps none
- A12 a store contact through two contact types plus a store customer row: two Store Contact rows, no Consumer row: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetDocumentStatusText

6 adversarial cases ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetDocumentStatusText.json`.

- objection O01 is open

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 6 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 200 rows compared, seeds 75127072. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | no mappings recorded |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 1, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetDocumentStatusText.adversarial.expected.json. Cases: A01 status 5 (second unmapped value above the last WHEN) is the ELSE text; A02 status 127 (signed 1-byte maximum) is the ELSE text; A03 status 128 (one above the signed 1-byte maximum) is the ELSE text, not an error; A04 status 254 (one below the tinyint maximum) is the ELSE text; A05 status 131 (3 + 128, same low bits as a mapped value) is the ELSE text; A06 status 1 gives the 16-character text exactly at the nvarchar(16) limit, untruncated |

Objections:
- O01 (duplicate, open): A06 sends status 1 with no tables, exactly the same payload as the hand-derived fixed case for the Pending approval mapping. That fixed case already checks the full 16-character return value and its declared result type.

Cases:
- A01 status 5 (second unmapped value above the last WHEN) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A02 status 127 (signed 1-byte maximum) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A03 status 128 (one above the signed 1-byte maximum) is the ELSE text, not an error: SQL Server pass, PostgreSQL pass; traps none
- A04 status 254 (one below the tinyint maximum) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A05 status 131 (3 + 128, same low bits as a mapped value) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A06 status 1 gives the 16-character text exactly at the nvarchar(16) limit, untruncated: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetProductDealerPrice

19 adversarial cases ran, 6 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetProductDealerPrice.json`.

- case A01 differed
- case A02 differed
- case A03 differed
- case A04 differed
- case A05 differed
- case A06 differed

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 19 adversarial cases ran, 6 differed (agent-written, run on both engines). Step 3: 200 samples, 208 rows compared, seeds 1296714984. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: covered by A01 (datetime value "2020-12-31T00:00:00.001" is off the .000/.003/.007 grid); A02 (datetime value "2019-12-31T23:59:59.999" is off the .000/.003/.007 grid); A03 (datetime value "2020-01-01T00:00:00.001" is off the .000/.003/.007 grid); A04 (datetime value "2020-12-31T23:59:59.999" is off the .000/.003/.007 grid); A05 (datetime value "2020-12-31T00:00:00.002" is off the .000/.003/.007 grid); A06 (datetime value "2020-01-01T00:00:00.000500" is off the .000/.003/.007 grid); A07 (boundary date "1753-01-01T00:00:00.000" in StartDate); A08 (boundary date "9999-12-31T00:00:00.000" in PricingInstant); A09 (boundary date "9999-12-31T23:59:59.997" in PricingInstant); A10 (boundary date "9999-12-31T23:59:59.997" in EndDate); A16 (datetime value "2020-06-15T12:34:56.789" is off the .000/.003/.007 grid) |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: covered by A07 (0.0005 in ListPrice ends in a 5); A11 (10.00005 in ListPrice ends in a 5); A12 (-0.0005 in ListPrice ends in a 5) |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: covered by A15 (Production.Product.ProductID jumps from 10 to 20) |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: At most one price period per product (precondition): with overlapping periods the T-SQL `SELECT @x = ...` keeps the last row read, which is undefined. / Step 4 finding: SQL Server 2025 inlines this scalar function into the calling query (sys.sql_modules.is_inlineable = 1, Froid). PostgreSQL runs the function once per call, so per-row calls cost about 2x more at 20,000 calls. Equivalence is unaffected; a caller that needs the speed would inline the expression or use a set-based join. A PL/pgSQL version (dbo.ufnGetStock, 2026-11-12) measured slower than the LANGUAGE sql one (160 ms vs 123 ms at 20,000 calls), so the SQL version is kept. / Step 4 factor: 2.5x, not the default 1.5x, agreed by Steve Harlow (project owner, ruling F1) on 2026-11-18 (verification-standard.md, "unless the object's record states a different agreed factor"). Reason: SQL Server 2025 inlines this scalar function into the calling query (Froid); PostgreSQL cannot inline a function that reads a table, and 20,000 calls that read no row at all already take 99-116 ms (measured 2026-11-18), at or above 1.5x before any lookup. An extra or covering index does not help (measured: 110 -> 101 ms, 144 -> 153 ms). Results are the same (step 3); a caller that needs the speed uses a set-based join (7 ms measured). Agreed after the 1.5x measurements, not before. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | int NOT NULL -> integer NOT NULL; datetime NOT NULL -> timestamp(3) NOT NULL (datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.); datetime NULL -> timestamp(3) (datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.); money NOT NULL -> numeric(19,4) NOT NULL (money -> numeric(19,4), not PostgreSQL's locale-dependent money type. Money arithmetic rounds to 4 places on SQL Server.) |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 2, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetProductDealerPrice.adversarial.expected.json. Cases: A01 order instant 1 ms after the end date (.001): SQL Server rounds the datetime argument to .000, inside the period; A02 order instant 1 ms before the start date (.999): SQL Server rounds it up to the start, inside the period; A03 StartDate stored as .001 (datetime keeps .000) and an order instant at .000: inside the period on SQL Server; A04 EndDate stored as 23:59:59.999 (datetime rounds to the next midnight) and an order instant at that midnight; A05 EndDate stored as .002 (datetime keeps .003) and an order instant at .003; A06 StartDate stored as half a millisecond (.0005) and an order instant at .000; A07 a period starting on 1753-01-01 (datetime minimum), order instant at that minimum, value 0.0005: 60% of the list price; A08 open-ended period on 9999-12-31 00:00 exactly (the COALESCE end, inclusive): 60% of the list price; A09 open-ended period on 9999-12-31 23:59:59.997 (after the COALESCE end at midnight): NULL; A10 an explicit EndDate at the datetime maximum (9999-12-31 23:59:59.997), order instant equal to it: 60% of the list price; A11 a value with 5 decimals (10.00005) rounds to money's 4 places on load: 60% of the list price; A12 a negative value at the last place (-0.0005): 60% of the list price; A13 a negative value -1.0001: 60% of the list price (-0.60006 rounds away from zero to -0.6001); A14 a large list price 9999999.9999: 60% is 5999999.99994, rounded to 5999999.9999; A15 product keys with gaps (10, 20, 2147483647): the int-maximum product's dealer price; A16 a one-instant period (StartDate = EndDate = 12:34:56.789) and an order instant equal to it; A17 an inverted period (EndDate before StartDate) and an order instant between them: NULL; A18 a period starting at 08:00 on 2020-01-01 and an order instant at midnight that day: NULL; A19 a product whose only period ended, with the queried instant in a later year and a different product's period covering it: NULL |

Cases:
- A01 order instant 1 ms after the end date (.001): SQL Server rounds the datetime argument to .000, inside the period: SQL Server pass, PostgreSQL FAIL; traps dates-datetime
- A02 order instant 1 ms before the start date (.999): SQL Server rounds it up to the start, inside the period: SQL Server pass, PostgreSQL FAIL; traps dates-datetime
- A03 StartDate stored as .001 (datetime keeps .000) and an order instant at .000: inside the period on SQL Server: SQL Server pass, PostgreSQL FAIL; traps dates-datetime
- A04 EndDate stored as 23:59:59.999 (datetime rounds to the next midnight) and an order instant at that midnight: SQL Server pass, PostgreSQL FAIL; traps dates-datetime
- A05 EndDate stored as .002 (datetime keeps .003) and an order instant at .003: SQL Server pass, PostgreSQL FAIL; traps dates-datetime
- A06 StartDate stored as half a millisecond (.0005) and an order instant at .000: SQL Server pass, PostgreSQL FAIL; traps dates-datetime
- A07 a period starting on 1753-01-01 (datetime minimum), order instant at that minimum, value 0.0005: 60% of the list price: SQL Server pass, PostgreSQL pass; traps dates-datetime, numeric-rounding
- A08 open-ended period on 9999-12-31 00:00 exactly (the COALESCE end, inclusive): 60% of the list price: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A09 open-ended period on 9999-12-31 23:59:59.997 (after the COALESCE end at midnight): NULL: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A10 an explicit EndDate at the datetime maximum (9999-12-31 23:59:59.997), order instant equal to it: 60% of the list price: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A11 a value with 5 decimals (10.00005) rounds to money's 4 places on load: 60% of the list price: SQL Server pass, PostgreSQL pass; traps numeric-rounding
- A12 a negative value at the last place (-0.0005): 60% of the list price: SQL Server pass, PostgreSQL pass; traps numeric-rounding
- A13 a negative value -1.0001: 60% of the list price (-0.60006 rounds away from zero to -0.6001): SQL Server pass, PostgreSQL pass; traps none
- A14 a large list price 9999999.9999: 60% is 5999999.99994, rounded to 5999999.9999: SQL Server pass, PostgreSQL pass; traps none
- A15 product keys with gaps (10, 20, 2147483647): the int-maximum product's dealer price: SQL Server pass, PostgreSQL pass; traps identity-gaps
- A16 a one-instant period (StartDate = EndDate = 12:34:56.789) and an order instant equal to it: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A17 an inverted period (EndDate before StartDate) and an order instant between them: NULL: SQL Server pass, PostgreSQL pass; traps none
- A18 a period starting at 08:00 on 2020-01-01 and an order instant at midnight that day: NULL: SQL Server pass, PostgreSQL pass; traps none
- A19 a product whose only period ended, with the queried instant in a later year and a different product's period covering it: NULL: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetProductListPrice

19 adversarial cases ran, 0 differed. Gate: pass. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetProductListPrice.json`.

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 19 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 208 rows compared, seeds 123175731. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: covered by A01 (datetime value "2020-12-31T00:00:00.001" is off the .000/.003/.007 grid); A02 (datetime value "2019-12-31T23:59:59.999" is off the .000/.003/.007 grid); A03 (datetime value "2020-01-01T00:00:00.001" is off the .000/.003/.007 grid); A04 (datetime value "2020-12-31T23:59:59.999" is off the .000/.003/.007 grid); A05 (datetime value "2020-12-31T00:00:00.002" is off the .000/.003/.007 grid); A06 (datetime value "2020-01-01T00:00:00.000500" is off the .000/.003/.007 grid); A07 (boundary date "1753-01-01T00:00:00.000" in StartDate); A08 (boundary date "9999-12-31T00:00:00.000" in PricingInstant); A09 (boundary date "9999-12-31T23:59:59.997" in PricingInstant); A10 (boundary date "9999-12-31T23:59:59.997" in EndDate); A16 (datetime value "2020-06-15T12:34:56.789" is off the .000/.003/.007 grid) |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: covered by A07 (0.0005 in ListPrice ends in a 5); A11 (10.00005 in ListPrice ends in a 5); A12 (-0.0005 in ListPrice ends in a 5) |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: covered by A15 (Production.Product.ProductID jumps from 10 to 20) |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: At most one price period per product (precondition): with overlapping periods the T-SQL `SELECT @x = ...` keeps the last row read, which is undefined. / Step 4 finding: SQL Server 2025 inlines this scalar function into the calling query (sys.sql_modules.is_inlineable = 1, Froid). PostgreSQL runs the function once per call, so per-row calls cost about 2x more at 20,000 calls. Equivalence is unaffected; a caller that needs the speed would inline the expression or use a set-based join. A PL/pgSQL version (dbo.ufnGetStock, 2026-11-12) measured slower than the LANGUAGE sql one (160 ms vs 123 ms at 20,000 calls), so the SQL version is kept. / Step 4 factor: 2.5x, not the default 1.5x, agreed by Steve Harlow (project owner, ruling F1) on 2026-11-18 (verification-standard.md, "unless the object's record states a different agreed factor"). Reason: SQL Server 2025 inlines this scalar function into the calling query (Froid); PostgreSQL cannot inline a function that reads a table, and 20,000 calls that read no row at all already take 99-116 ms (measured 2026-11-18), at or above 1.5x before any lookup. An extra or covering index does not help (measured: 110 -> 101 ms, 144 -> 153 ms). Results are the same (step 3); a caller that needs the speed uses a set-based join (7 ms measured). Agreed after the 1.5x measurements, not before. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | int NOT NULL -> integer NOT NULL; datetime NOT NULL -> timestamp(3) NOT NULL (datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.); datetime NULL -> timestamp(3) (datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.); money NOT NULL -> numeric(19,4) NOT NULL (money -> numeric(19,4), not PostgreSQL's locale-dependent money type. Money arithmetic rounds to 4 places on SQL Server.) |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 2, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetProductListPrice.adversarial.expected.json. Cases: A01 order instant 1 ms after the end date (.001): SQL Server rounds the datetime argument to .000, inside the period; A02 order instant 1 ms before the start date (.999): SQL Server rounds it up to the start, inside the period; A03 StartDate stored as .001 (datetime keeps .000) and an order instant at .000: inside the period on SQL Server; A04 EndDate stored as 23:59:59.999 (datetime rounds to the next midnight) and an order instant at that midnight; A05 EndDate stored as .002 (datetime keeps .003) and an order instant at .003; A06 StartDate stored as half a millisecond (.0005) and an order instant at .000; A07 a period starting on 1753-01-01 (datetime minimum), order instant at that minimum, value 0.0005: the ListPrice; A08 open-ended period on 9999-12-31 00:00 exactly (the COALESCE end, inclusive): the ListPrice; A09 open-ended period on 9999-12-31 23:59:59.997 (after the COALESCE end at midnight): NULL; A10 an explicit EndDate at the datetime maximum (9999-12-31 23:59:59.997), order instant equal to it: the ListPrice; A11 a value with 5 decimals (10.00005) rounds to money's 4 places on load: the ListPrice; A12 a negative value at the last place (-0.0005): the ListPrice; A13 a negative value -1.0001: the ListPrice; A14 the money maximum 922337203685477.5807 passes through unchanged; A15 product keys with gaps (10, 20, 2147483647): the int-maximum product's ListPrice; A16 a one-instant period (StartDate = EndDate = 12:34:56.789) and an order instant equal to it; A17 an inverted period (EndDate before StartDate) and an order instant between them: NULL; A18 a period starting at 08:00 on 2020-01-01 and an order instant at midnight that day: NULL; A19 a product whose only period ended, with the queried instant in a later year and a different product's period covering it: NULL |

Cases:
- A01 order instant 1 ms after the end date (.001): SQL Server rounds the datetime argument to .000, inside the period: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A02 order instant 1 ms before the start date (.999): SQL Server rounds it up to the start, inside the period: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A03 StartDate stored as .001 (datetime keeps .000) and an order instant at .000: inside the period on SQL Server: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A04 EndDate stored as 23:59:59.999 (datetime rounds to the next midnight) and an order instant at that midnight: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A05 EndDate stored as .002 (datetime keeps .003) and an order instant at .003: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A06 StartDate stored as half a millisecond (.0005) and an order instant at .000: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A07 a period starting on 1753-01-01 (datetime minimum), order instant at that minimum, value 0.0005: the ListPrice: SQL Server pass, PostgreSQL pass; traps dates-datetime, numeric-rounding
- A08 open-ended period on 9999-12-31 00:00 exactly (the COALESCE end, inclusive): the ListPrice: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A09 open-ended period on 9999-12-31 23:59:59.997 (after the COALESCE end at midnight): NULL: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A10 an explicit EndDate at the datetime maximum (9999-12-31 23:59:59.997), order instant equal to it: the ListPrice: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A11 a value with 5 decimals (10.00005) rounds to money's 4 places on load: the ListPrice: SQL Server pass, PostgreSQL pass; traps numeric-rounding
- A12 a negative value at the last place (-0.0005): the ListPrice: SQL Server pass, PostgreSQL pass; traps numeric-rounding
- A13 a negative value -1.0001: the ListPrice: SQL Server pass, PostgreSQL pass; traps none
- A14 the money maximum 922337203685477.5807 passes through unchanged: SQL Server pass, PostgreSQL pass; traps none
- A15 product keys with gaps (10, 20, 2147483647): the int-maximum product's ListPrice: SQL Server pass, PostgreSQL pass; traps identity-gaps
- A16 a one-instant period (StartDate = EndDate = 12:34:56.789) and an order instant equal to it: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A17 an inverted period (EndDate before StartDate) and an order instant between them: NULL: SQL Server pass, PostgreSQL pass; traps none
- A18 a period starting at 08:00 on 2020-01-01 and an order instant at midnight that day: NULL: SQL Server pass, PostgreSQL pass; traps none
- A19 a product whose only period ended, with the queried instant in a later year and a different product's period covering it: NULL: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetProductStandardCost

19 adversarial cases ran, 0 differed. Gate: pass. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetProductStandardCost.json`.

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 19 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 208 rows compared, seeds 1245171876. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: covered by A01 (datetime value "2020-12-31T00:00:00.001" is off the .000/.003/.007 grid); A02 (datetime value "2019-12-31T23:59:59.999" is off the .000/.003/.007 grid); A03 (datetime value "2020-01-01T00:00:00.001" is off the .000/.003/.007 grid); A04 (datetime value "2020-12-31T23:59:59.999" is off the .000/.003/.007 grid); A05 (datetime value "2020-12-31T00:00:00.002" is off the .000/.003/.007 grid); A06 (datetime value "2020-01-01T00:00:00.000500" is off the .000/.003/.007 grid); A07 (boundary date "1753-01-01T00:00:00.000" in StartDate); A08 (boundary date "9999-12-31T00:00:00.000" in PricingInstant); A09 (boundary date "9999-12-31T23:59:59.997" in PricingInstant); A10 (boundary date "9999-12-31T23:59:59.997" in EndDate); A16 (datetime value "2020-06-15T12:34:56.789" is off the .000/.003/.007 grid) |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: covered by A07 (0.0005 in StandardCost ends in a 5); A11 (10.00005 in StandardCost ends in a 5); A12 (-0.0005 in StandardCost ends in a 5) |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: covered by A15 (Production.Product.ProductID jumps from 10 to 20) |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: At most one price period per product (precondition): with overlapping periods the T-SQL `SELECT @x = ...` keeps the last row read, which is undefined. / Step 4 finding: SQL Server 2025 inlines this scalar function into the calling query (sys.sql_modules.is_inlineable = 1, Froid). PostgreSQL runs the function once per call, so per-row calls cost about 2x more at 20,000 calls. Equivalence is unaffected; a caller that needs the speed would inline the expression or use a set-based join. A PL/pgSQL version (dbo.ufnGetStock, 2026-11-12) measured slower than the LANGUAGE sql one (160 ms vs 123 ms at 20,000 calls), so the SQL version is kept. / Step 4 factor: 2.5x, not the default 1.5x, agreed by Steve Harlow (project owner, ruling F1) on 2026-11-18 (verification-standard.md, "unless the object's record states a different agreed factor"). Reason: SQL Server 2025 inlines this scalar function into the calling query (Froid); PostgreSQL cannot inline a function that reads a table, and 20,000 calls that read no row at all already take 99-116 ms (measured 2026-11-18), at or above 1.5x before any lookup. An extra or covering index does not help (measured: 110 -> 101 ms, 144 -> 153 ms). Results are the same (step 3); a caller that needs the speed uses a set-based join (7 ms measured). Agreed after the 1.5x measurements, not before. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | int NOT NULL -> integer NOT NULL; datetime NOT NULL -> timestamp(3) NOT NULL (datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.); datetime NULL -> timestamp(3) (datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.); money NOT NULL -> numeric(19,4) NOT NULL (money -> numeric(19,4), not PostgreSQL's locale-dependent money type. Money arithmetic rounds to 4 places on SQL Server.) |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 2, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetProductStandardCost.adversarial.expected.json. Cases: A01 order instant 1 ms after the end date (.001): SQL Server rounds the datetime argument to .000, inside the period; A02 order instant 1 ms before the start date (.999): SQL Server rounds it up to the start, inside the period; A03 StartDate stored as .001 (datetime keeps .000) and an order instant at .000: inside the period on SQL Server; A04 EndDate stored as 23:59:59.999 (datetime rounds to the next midnight) and an order instant at that midnight; A05 EndDate stored as .002 (datetime keeps .003) and an order instant at .003; A06 StartDate stored as half a millisecond (.0005) and an order instant at .000; A07 a period starting on 1753-01-01 (datetime minimum), order instant at that minimum, value 0.0005: the StandardCost; A08 open-ended period on 9999-12-31 00:00 exactly (the COALESCE end, inclusive): the StandardCost; A09 open-ended period on 9999-12-31 23:59:59.997 (after the COALESCE end at midnight): NULL; A10 an explicit EndDate at the datetime maximum (9999-12-31 23:59:59.997), order instant equal to it: the StandardCost; A11 a value with 5 decimals (10.00005) rounds to money's 4 places on load: the StandardCost; A12 a negative value at the last place (-0.0005): the StandardCost; A13 a negative value -1.0001: the StandardCost; A14 the money maximum 922337203685477.5807 passes through unchanged; A15 product keys with gaps (10, 20, 2147483647): the int-maximum product's StandardCost; A16 a one-instant period (StartDate = EndDate = 12:34:56.789) and an order instant equal to it; A17 an inverted period (EndDate before StartDate) and an order instant between them: NULL; A18 a period starting at 08:00 on 2020-01-01 and an order instant at midnight that day: NULL; A19 a product whose only period ended, with the queried instant in a later year and a different product's period covering it: NULL |

Cases:
- A01 order instant 1 ms after the end date (.001): SQL Server rounds the datetime argument to .000, inside the period: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A02 order instant 1 ms before the start date (.999): SQL Server rounds it up to the start, inside the period: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A03 StartDate stored as .001 (datetime keeps .000) and an order instant at .000: inside the period on SQL Server: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A04 EndDate stored as 23:59:59.999 (datetime rounds to the next midnight) and an order instant at that midnight: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A05 EndDate stored as .002 (datetime keeps .003) and an order instant at .003: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A06 StartDate stored as half a millisecond (.0005) and an order instant at .000: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A07 a period starting on 1753-01-01 (datetime minimum), order instant at that minimum, value 0.0005: the StandardCost: SQL Server pass, PostgreSQL pass; traps dates-datetime, numeric-rounding
- A08 open-ended period on 9999-12-31 00:00 exactly (the COALESCE end, inclusive): the StandardCost: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A09 open-ended period on 9999-12-31 23:59:59.997 (after the COALESCE end at midnight): NULL: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A10 an explicit EndDate at the datetime maximum (9999-12-31 23:59:59.997), order instant equal to it: the StandardCost: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A11 a value with 5 decimals (10.00005) rounds to money's 4 places on load: the StandardCost: SQL Server pass, PostgreSQL pass; traps numeric-rounding
- A12 a negative value at the last place (-0.0005): the StandardCost: SQL Server pass, PostgreSQL pass; traps numeric-rounding
- A13 a negative value -1.0001: the StandardCost: SQL Server pass, PostgreSQL pass; traps none
- A14 the money maximum 922337203685477.5807 passes through unchanged: SQL Server pass, PostgreSQL pass; traps none
- A15 product keys with gaps (10, 20, 2147483647): the int-maximum product's StandardCost: SQL Server pass, PostgreSQL pass; traps identity-gaps
- A16 a one-instant period (StartDate = EndDate = 12:34:56.789) and an order instant equal to it: SQL Server pass, PostgreSQL pass; traps dates-datetime
- A17 an inverted period (EndDate before StartDate) and an order instant between them: NULL: SQL Server pass, PostgreSQL pass; traps none
- A18 a period starting at 08:00 on 2020-01-01 and an order instant at midnight that day: NULL: SQL Server pass, PostgreSQL pass; traps none
- A19 a product whose only period ended, with the queried instant in a later year and a different product's period covering it: NULL: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetPurchaseOrderStatusText

6 adversarial cases ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetPurchaseOrderStatusText.json`.

- objection O01 is open

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 6 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 200 rows compared, seeds 977334639. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | no mappings recorded |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 1, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetPurchaseOrderStatusText.adversarial.expected.json. Cases: A01 status 6 (second unmapped value above the last WHEN) is the ELSE text; A02 status 127 (signed 1-byte maximum) is the ELSE text; A03 status 128 (one above the signed 1-byte maximum) is the ELSE text, not an error; A04 status 254 (one below the tinyint maximum) is the ELSE text; A05 status 132 (4 + 128, same low bits as 'Complete') is the ELSE text; A06 status 1 gives 'Pending' from a varchar literal in an nvarchar(15) result, with no padding |

Objections:
- O01 (duplicate, open): A06 sends status 1 with no tables, exactly the same payload as the hand-derived fixed case for the Pending mapping. That fixed case already checks the unpadded return value and the declared result type.

Cases:
- A01 status 6 (second unmapped value above the last WHEN) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A02 status 127 (signed 1-byte maximum) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A03 status 128 (one above the signed 1-byte maximum) is the ELSE text, not an error: SQL Server pass, PostgreSQL pass; traps none
- A04 status 254 (one below the tinyint maximum) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A05 status 132 (4 + 128, same low bits as 'Complete') is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A06 status 1 gives 'Pending' from a varchar literal in an nvarchar(15) result, with no padding: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetSalesOrderStatusText

6 adversarial cases ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetSalesOrderStatusText.json`.

- objection O01 is open
- mutant adequacy is inadequate (unexplained misses: auto: first CASE result text altered)

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 6 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 200 rows compared, seeds 982752042. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | no mappings recorded |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: inadequate; caught 0, missed 1 (equivalent recorded: 0), not deployable 0. Missed: auto: first CASE result text altered. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetSalesOrderStatusText.adversarial.expected.json. Cases: A01 status 8 (second unmapped value above the last WHEN) is the ELSE text; A02 status 127 (signed 1-byte maximum) is the ELSE text; A03 status 128 (one above the signed 1-byte maximum) is the ELSE text, not an error; A04 status 254 (one below the tinyint maximum) is the ELSE text; A05 status 134 (6 + 128, same low bits as 'Cancelled') is the ELSE text; A06 status 3 gives 'Backordered', the longest mapped text (11 characters), from a varchar literal into nvarchar(15) |

Objections:
- O01 (duplicate, open): A06 sends status 3 with no tables, exactly the same payload as the hand-derived fixed case for the Backordered mapping. That fixed case already checks the longest mapped return text without padding and the declared result type.

Cases:
- A01 status 8 (second unmapped value above the last WHEN) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A02 status 127 (signed 1-byte maximum) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A03 status 128 (one above the signed 1-byte maximum) is the ELSE text, not an error: SQL Server pass, PostgreSQL pass; traps none
- A04 status 254 (one below the tinyint maximum) is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A05 status 134 (6 + 128, same low bits as 'Cancelled') is the ELSE text: SQL Server pass, PostgreSQL pass; traps none
- A06 status 3 gives 'Backordered', the longest mapped text (11 characters), from a varchar literal into nvarchar(15): SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnGetStock

7 adversarial cases ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnGetStock.json`.

- objection O01 is open
- objection O02 is open
- objection O03 is open

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 7 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 206 rows compared, seeds 1244899714. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: Step 4 finding: SQL Server 2025 inlines this scalar function into the calling query (sys.sql_modules.is_inlineable = 1, Froid). PostgreSQL runs the function once per call, so per-row calls cost about 2x more at 20,000 calls. Equivalence is unaffected; a caller that needs the speed would inline the expression or use a set-based join. A PL/pgSQL version (dbo.ufnGetStock, 2026-11-12) measured slower than the LANGUAGE sql one (160 ms vs 123 ms at 20,000 calls), so the SQL version is kept. / Step 4 factor: 2.5x, not the default 1.5x, agreed by Steve Harlow (project owner, ruling F1) on 2026-11-18 (verification-standard.md, "unless the object's record states a different agreed factor"). Reason: SQL Server 2025 inlines this scalar function into the calling query (Froid); PostgreSQL cannot inline a function that reads a table, and 20,000 calls that read no row at all already take 99-116 ms (measured 2026-11-18), at or above 1.5x before any lookup. An extra or covering index does not help (measured: 110 -> 101 ms, 144 -> 153 ms). Results are the same (step 3); a caller that needs the speed uses a set-based join (7 ms measured). Agreed after the 1.5x measurements, not before. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | int NOT NULL -> integer NOT NULL; smallint NOT NULL -> smallint NOT NULL |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 1, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnGetStock.adversarial.expected.json. Cases: A01 two rows of 32767 at location 6 sum to 65534, beyond smallint: int result, no overflow; A02 two rows of -32768 at location 6 sum to -65536: a negative int result; A03 +7 and -7 at location 6 sum to 0 (a real zero sum, not the NULL replacement); A04 locations -6, 0, 16, 60 and 32767 are not location 6: only the 4 at location 6 counts; A05 int maximum ProductID 2147483647 with stock at location 6: 9 (other products' rows ignored); A06 ProductID 0 is a real product, not 'no product': its stock 50 is returned; A07 an empty inventory table: 0 |

Objections:
- O01 (not-an-attack, open): A01 inserts two ProductInventory rows with the same (ProductID, LocationID) pair (1, 6), but that pair is the source table's composite primary key. The overflow input cannot occur under the source schema preconditions.
- O02 (not-an-attack, open): A02 inserts two ProductInventory rows with the same (ProductID, LocationID) pair (2, 6), but that pair is the source table's composite primary key. The negative overflow input cannot occur under the source schema preconditions.
- O03 (not-an-attack, open): A03 inserts two ProductInventory rows with the same (ProductID, LocationID) pair (3, 6), but that pair is the source table's composite primary key. The cancelling-sum input cannot occur under the source schema preconditions.

Cases:
- A01 two rows of 32767 at location 6 sum to 65534, beyond smallint: int result, no overflow: SQL Server pass, PostgreSQL pass; traps none
- A02 two rows of -32768 at location 6 sum to -65536: a negative int result: SQL Server pass, PostgreSQL pass; traps none
- A03 +7 and -7 at location 6 sum to 0 (a real zero sum, not the NULL replacement): SQL Server pass, PostgreSQL pass; traps none
- A04 locations -6, 0, 16, 60 and 32767 are not location 6: only the 4 at location 6 counts: SQL Server pass, PostgreSQL pass; traps none
- A05 int maximum ProductID 2147483647 with stock at location 6: 9 (other products' rows ignored): SQL Server pass, PostgreSQL pass; traps none
- A06 ProductID 0 is a real product, not 'no product': its stock 50 is returned: SQL Server pass, PostgreSQL pass; traps none
- A07 an empty inventory table: 0: SQL Server pass, PostgreSQL pass; traps none

## AdventureWorks2025 dbo.ufnLeadingZeros

8 adversarial cases ran, 0 differed. Gate: FAIL. Attacker claude (Kiro subagent; exact model version not exposed to the agent), auditor gpt-5.6-sol. Evidence: `evidence/adversarial/AdventureWorks2025/dbo.ufnLeadingZeros.json`.

- objection O01 is open
- objection O02 is open
- objection O03 is open
- objection O04 is open
- objection O05 is open
- objection O06 is open

| Step-5 checklist item | Evidence |
|---|---|
| The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones. | 8 adversarial cases ran, 0 differed (agent-written, run on both engines). Step 3: 200 samples, 200 rows compared, seeds 126286285. owner judgment: whether the inputs cover what the object accepts. |
| NULL versus empty string, including concatenation and ISNULL/COALESCE. | null-vs-empty: not applicable to this object's inputs |
| Collation and case sensitivity in comparisons, ORDER BY and GROUP BY. | collation-case: not applicable to this object's inputs |
| Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates). | dates-datetime: not applicable to this object's inputs |
| Numeric rounding and scale (money, decimal(p,s), integer division, ROUND). | numeric-rounding: not applicable to this object's inputs |
| Trailing spaces; TOP with and without ties; identity and sequence gaps. | trailing-spaces: not applicable to this object's inputs<br>top-ties: not applicable to this object's inputs<br>identity-gaps: not applicable to this object's inputs |
| Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed. | owner judgment. Notes: CONVERT(varchar(8), int) yields '*' when the number needs more than 8 characters; DATALENGTH counts bytes. / Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step). |
| The column-type mappings are right for this object. | no mappings recorded |
| The generated data and fixed cases would catch the mistakes a converter is most likely to make here. | Planted defects on the adversarial cases: adequate; caught 1, missed 0 (equivalent recorded: 0), not deployable 0. |
| Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine). | owner judgment. Expected results are in tests/AdventureWorks2025/dbo.ufnLeadingZeros.adversarial.expected.json. Cases: A01 -1 keeps its sign inside the padding: '000000-1'; A02 -1000000 (exactly 8 characters with the sign) is unchanged; A03 -99999999 (9 characters with the sign) does not fit varchar(8): '0000000*'; A04 10000000 (8 digits, smallest 8-digit value) is unchanged; A05 9999999 (7 digits) gets one leading zero: '09999999'; A06 -10 keeps its sign inside the padding: '00000-10'; A07 2147483646 (one below int maximum) gives '0000000*'; A08 -2147483647 (one above int minimum) gives '0000000*' |

Objections:
- O01 (duplicate, open): The hand-derived -5 case already supplies a two-character negative integer and requires the sign after six padding zeros. A01 changes only the digit from 5 to 1 and attacks the same input class and mechanism.
- O02 (duplicate, open): The hand-derived -9999999 case already supplies an eight-character negative integer, including the sign, and requires it unchanged. A02 is the same length class and attacks the same boundary behavior.
- O03 (duplicate, open): The hand-derived -10000000 case already supplies a nine-character negative integer and requires CONVERT(varchar(8), int) to produce '*' before padding. A03 attacks the same length and conversion path.
- O04 (duplicate, open): The hand-derived 12345678 and 99999999 cases already supply eight-character positive integers and require them unchanged. A04 is the same length boundary and does not add a distinct attack mechanism.
- O05 (duplicate, open): The hand-derived int-maximum case already exercises a positive value above eight characters and requires '0000000*'. Moving one below the maximum uses the same conversion and padding path.
- O06 (duplicate, open): The hand-derived int-minimum case already exercises a negative value above eight characters and requires '0000000*'. Moving one above the minimum uses the same conversion and padding path.

Cases:
- A01 -1 keeps its sign inside the padding: '000000-1': SQL Server pass, PostgreSQL pass; traps none
- A02 -1000000 (exactly 8 characters with the sign) is unchanged: SQL Server pass, PostgreSQL pass; traps none
- A03 -99999999 (9 characters with the sign) does not fit varchar(8): '0000000*': SQL Server pass, PostgreSQL pass; traps none
- A04 10000000 (8 digits, smallest 8-digit value) is unchanged: SQL Server pass, PostgreSQL pass; traps none
- A05 9999999 (7 digits) gets one leading zero: '09999999': SQL Server pass, PostgreSQL pass; traps none
- A06 -10 keeps its sign inside the padding: '00000-10': SQL Server pass, PostgreSQL pass; traps none
- A07 2147483646 (one below int maximum) gives '0000000*': SQL Server pass, PostgreSQL pass; traps none
- A08 -2147483647 (one above int minimum) gives '0000000*': SQL Server pass, PostgreSQL pass; traps none

## Approval

The owner approves at a terminal, not an agent:

```
npm run approve -- --report evidence/adversarial/reports/batch-1.md --reviewer "<name>" --date <yyyy-mm-dd>
```
