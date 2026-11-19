# Second review (step 5): Sales.vSalesPerson

Reviewer: Steve Harlow · date: 2026-11-18 · result: pass · minutes: 10
Packet reviewed: `npm run review-packet -- --object Sales.vSalesPerson` (conversion corrected on 2026-11-18; the 2026-11-16 review was reset).
The reviewer's notes, as written:

> Only the join changed: true for the view body. The 22 columns and the other 10 joins are identical to the draft and match the T-SQL one for one. The caveat is that the script now also creates a tsql_compat schema and a ci_as_equal collation ahead of the view, so the deployment gains a shared object, not just a changed line.
>
> ASCII-only collation claim: acceptable here. The ICU setting (und-u-ks-level2, nondeterministic) is case-insensitive and accent-sensitive, which is the right shape for CI_AS, and rtrim(..., ' ') matches SQL Server ignoring trailing spaces. CountryRegionCode holds short ISO country codes, so the unclaimed territory (non-ASCII equivalences such as ß = ss) is unlikely to arise on this column. Accent sensitivity has no fixed case, so it rests on the collation definition rather than a test.
>
> The 3 expected rows match their labels. I read expected.json and both test scripts and derived the rows by hand from the case 1 inputs:
> Person 1 has no territory, no email and two phones, so two rows, with a NULL phone type on the second because type 9 is not in the type table.
> Person 2 comes back as one row with 'Ann ' keeping its trailing space.
> Person 3 has no address and is dropped.
> Cases 2 and 3 expect the identical three rows, and their inputs differ from case 1 only in the province's country code ('us' and 'US '), on both engines.
