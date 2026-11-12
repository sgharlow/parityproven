---
inclusion: always
---

# The verification standard

An object counts as **verified** only when steps 1–4 pass and steps 5–6 are recorded. Each step's status is stored in the pair record and shown on the receipt. Never collapse the steps into a single "pass".

1. **Compiles and deploys.** The converted object is created on PostgreSQL without error.
2. **Agreed tests pass.** The tSQLt tests (source) and the plain-SQL assertion tests (target) listed for the object pass (see the 2026-11-12 rulings below; pgTAP is not used).
3. **Result sets match** on generated data that includes every trap below. Comparison covers row count, column names and types, values, and order wherever the source query guarantees an order. For a **trigger**, the result is the state of every table it writes after the same generated DML runs on both engines, compared the same way.
4. **Runtime within factor.** Target runtime is at most **1.5×** the source on the synthetic volume, unless the object's record states a different agreed factor.
5. **Second review.** A human review against this checklist, at least one day after the first pass. Record the reviewer and date.
6. **Acceptance on real data.** For public sample databases this is **not applicable**, and the receipt says so. For a real engagement, the customer runs the validation scripts on their own data.

**Rulings (project owner, 2026-11-12)**
- **Step 4 for objects that change data is `n/a`.** Each call changes the data it reads, so repeated timed runs on the same data are not the same work. The record says so; every other object still needs step 4 to pass.
- **Step 6 is `n/a` for public sample databases** (as above), recorded on every such pair.
- **Step 2 is tSQLt on SQL Server and plain-SQL assertions on PostgreSQL** (pgTAP is not in the pinned PostgreSQL image). The agreed tests are the object's hand-derived fixed cases, with their expected results committed, so they can be read and reviewed.
- The status rule lives in one place: `src/pairs/status.ts`.

## Traps every generator must cover
- NULL versus empty string (`''`), including concatenation and `ISNULL`/`COALESCE` behaviour
- Collation and case sensitivity in comparisons, `ORDER BY` and `GROUP BY`
- Boundary dates and datetime precision (`datetime` 3.33 ms rounding, `datetime2`, time zones, `1753-01-01`, `9999-12-31`)
- Numeric rounding and scale (`money`, `decimal(p,s)`, integer division, `ROUND`)
- Large row counts (at least one run at the synthetic volume the record states)
- Plus: trailing spaces, `TOP` with and without ties, and identity/sequence gaps

## Property-based testing
- The core property: for any generated input satisfying the object's preconditions, `run(source) ≡ run(target)` under the comparison rules above.
- Use `fast-check` arbitraries built from the object's parameter and table types, biased toward the traps.
- Every run records its seed. When a counterexample appears, shrink it, keep it as a fixed regression case and record it in the pair's evidence.
- Equivalence must never be checked by a symmetric shortcut, such as running the same query through both paths of the same helper. Each side runs on its own engine.

## Before trusting the harness
Plant a known defect (for example, swap `''` for NULL in one conversion) and confirm that the harness reports it as a failure. A harness that has never been seen failing is not evidence.
