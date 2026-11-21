# Convergence review: adversarial gate (base 9719595...HEAD)

The change adds a code-computed adversarial gate (`src/adversarial/gate.ts`), a runner and CLI for it, an `approve` command that is the only writer of the gate-based step 5, receipts and UI sections for it, and conversion fixes the attack cases found. I read the recorded results in FEAT-001 to FEAT-007 and `evidence/adversarial/`. I did not re-run the suites.

**Verdict**: APPROVED

Watch for: the gate's unblocking fields are agent-written (non-blocking, see Issues). No object is verified now; 0 verified is the honest state until the owner approves.

## High-level view

The gate reads only engine results, trap checks computed from the input, recorded objections, a mutant-adequacy list and a conversion hash. Whether a case differed is set by the harness comparing the two engines. No agent output is read as pass or fail.

Step 5 is written by `approve` (TTY only) and by `log-effort --review` (TTY only, and refuses a pass unless the gate is pass). Neither is callable by an agent. In the pair diff against base, step5 changed only on Sales.vSalesPerson and Website.ActivateWebsiteLogon, from pass to not-run with the reviewer removed. Both resets follow conversion fixes the attack cases found (FEAT-005 and FEAT-006 record this). No pair gained a step 5 pass or a reviewer. Seven formerly verified records became pending because `status.ts` now requires the gate and `step5Method`. Their steps and reviewers are untouched.

The status rule is in `src/pairs/status.ts`. `validate-pair`, `review-packet` and `log-effort` call it. The other `status ===` matches only count or filter. The check in `src/cli/adversarial.ts` is an eligibility precondition for running the gate, not a second status rule.

Wording follows the steering file. The spec and receipts use "N adversarial cases ran, M differed" and label the cases agent-written. The added text has no "agent approved", "100%", "guaranteed" or "behaves the same". The `product.md` claim still holds, because the code decides pass/fail and the owner confirms the agent-written unblocking entries at approval.

<details>
<summary>Issues (3)</summary>

1. **Agent-writable `confirmedBy` (likely)**: gate.ts line 50 only tests that `confirmedBy` is present, and load.ts accepts it from the audit file. An agent can therefore unblock an objection before the owner sees it. `approve` lists these items (ownerConfirmItems) and re-runs `gateResult`, so the final verdict is not affected. Consider making approve reject confirmedBy it did not stamp.
2. **Case file flagged during a run (confirmed)**: `regression:true` was added to 27 case ids in batch 2, which overrode the instruction not to edit cases. It is a flag only, and FEAT-005 flagged it for the owner.
3. **Open results (confirmed)**: ufnGetProductDealerPrice fails step 4 at 2.73x against the agreed 2.5x, and its adversarial evidence predates the fix. Open auditor objections and inadequate mutant adequacy remain on many objects. These are findings for remediation, not defects in the gate.

</details>
