---
inclusion: fileMatch
fileMatchPattern: ["pairs/**", "src/pairs/**"]
---

# Translation-pair records

A pair is a **verified record**, not a snippet. A record that has not passed the verification standard keeps `status: "failed"` or `status: "pending"` and never appears as verified.

## Fields (defined once in `src/pairs/schema.ts`)
| Field | Contents |
|---|---|
| `origin` | Source repo, commit and license from `sources/manifest.json`, or `synthetic` |
| `conversionType` | For example `tsql-to-plpgsql` |
| `objectClass` | `procedure` · `function` · `view` · `trigger` |
| `tier` | `simple` · `medium` · `complex` |
| `code` | `source`, `engineOutput`, `final`, plus the diff from `engineOutput` to `final` |
| `evidence` | Per-step status for steps 1–6, tests run, rows compared, traps covered, runtime ratio, PBT seed(s), harness version, reviewer and date |
| `effort` | Human minutes; engine name and version |
| `status` | `pending` · `failed` · `verified` |

## Complexity tier rules
- **complex** if the object uses any of: dynamic SQL (`EXEC(@sql)`, `sp_executesql`), cursors, CLR, cross-database references, linked servers, `OPENQUERY`/`OPENROWSET`, `xp_` procedures.
- **medium** if it uses any of: temp tables or table variables, `MERGE`, `TRY/CATCH` with transactions, window functions, `OUTPUT` clauses, multiple result sets.
- **simple** otherwise.
- The same rules drive the inventory scorer and the predictions, so they must be implemented once and imported.
