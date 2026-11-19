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

**Ruling (project owner, 2026-11-18, F1)**
- **Step 4 factor 2.5x for four AdventureWorks scalar functions** (`dbo.ufnGetProductDealerPrice`, `ufnGetProductListPrice`, `ufnGetProductStandardCost`, `ufnGetStock`). SQL Server 2025 inlines them into the calling query; PostgreSQL cannot inline a function that reads a table, and 20,000 calls that read no row already take 99–116 ms (measured 2026-11-18, which is at or above 1.5x before any lookup). An extra or covering index does not help (measured: 110 -> 101 ms; 144 -> 153 ms). Results are the same; a caller that needs the speed uses a set-based join (7 ms). The factor is recorded on each pair record (`spec.runtimeFactor`) and shown on the receipt. It was agreed after the measurements, and the receipts say so.

**Ruling (project owner, 2026-11-18, J1)**
- **Step 2 for FOR JSON procedures is not tSQLt on SQL Server.** No tSQLt test can observe such a procedure's result (`INSERT ... EXEC` is refused for it, also through `tSQLt.ResultSetFilter`, error 6549). Their SQL Server side loads each fixed case and calls the original procedure through the client, joins the streamed chunks, and compares the document exactly with the committed expected one; PostgreSQL compares it as `jsonb` (step 3 still compares key order). The pair record and receipt say "not tSQLt"; the run is recorded in `tests/<db>/<Object>.sqlserver.sql`.

**Ruling (project owner, 2026-11-18, A1)**
- **An adversarial gate sits between step 4 and step 5, for every object.** Agent-written attack cases (inputs only) run on both engines; expected values come from the original T-SQL, never from an agent. A second agent audits the cases and records objections. The gate result is computed by code (`src/adversarial/gate.ts`) from engine results: zero cases differed, every claimed trap is present in the input, every applicable trap is covered or accepted as not applicable, no open objection, and the planted-defect check on the adversarial cases is not inadequate. No agent output is read as pass or fail, so the pass/fail verdict still contains no language model.
- **Step 5 is the owner's review of the adversarial evidence report** against the step-5 checklist, at least one day after the first pass. Agents and workflow steps never record it. `computeStatus` requires `evidence.adversarial.gate = "pass"` in addition to step 5, so records verified before the gate (reviewed by reading code) are pending until the gate has run and the owner has approved on the report.
- Receipts say "N adversarial cases ran, M differed", and label the cases as agent-written.

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
