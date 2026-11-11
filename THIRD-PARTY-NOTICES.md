# Third-party notices

ParityProven is licensed under Apache-2.0 (see `LICENSE`). This repository also contains, or reproduces,
material from the third parties below under their own licences.

## Microsoft SQL Server sample databases (WideWorldImporters, AdventureWorks2025)

The T-SQL source of converted objects is reproduced in `pairs/`, `receipts/` and the `conversions/` comments,
and the column catalogues in `catalog/` are derived from the sample databases' metadata. The PostgreSQL
conversions in `conversions/` are derivative works of that T-SQL.

Source: https://github.com/microsoft/sql-server-samples (release assets `wide-world-importers-v1.0` and
`adventureworks`; exact asset URLs and SHA-256 digests are in `sources/manifest.json`).
The backup files themselves are not in this repository; they are downloaded and checked at run time.

```
Microsoft SQL Server Sample Code

Copyright (c) Microsoft Corporation

All rights reserved.

MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
```

Licence text fetched verbatim from https://github.com/microsoft/sql-server-samples/blob/master/license.txt on 2026-11-09.

## Software used at run time (not redistributed in this repository)

| Component | Licence | Use |
|---|---|---|
| `mcr.microsoft.com/mssql/server:2025-latest` | Microsoft SQL Server licence (Developer edition terms) | source database, pulled at run time |
| `postgis/postgis:18-3.6` (PostgreSQL + PostGIS) | PostgreSQL Licence; PostGIS GPL-2.0-or-later | target database, pulled at run time |
| highlight.js 11.9.0 (CDN) | BSD-3-Clause | SQL highlighting on receipt pages |
| npm dependencies (`mssql`, `pg`, `fast-check`, TypeScript, Vitest) | see each package; listed in `package-lock.json` | build and test |
