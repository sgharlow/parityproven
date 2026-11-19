/** What a harness re-run (convert) keeps from the previous pair record's adversarial gate and step-5 approval. Pure. */
import { createHash } from "crypto";
import type { PairRecord } from "./schema.js";

type Evidence = PairRecord["evidence"];
export type GateFields = Pick<Evidence, "adversarial" | "step5Method" | "step5Report" | "step5EvidenceSha256" | "step5Confirmed">;

/**
 * Kept only while the final conversion is the one the gate ran on (same sha256). A changed conversion drops them, so it
 * needs a new gate run and a new approval; it is never left looking approved.
 */
export function carriedGateFields(previous: PairRecord | null, finalSql: string): Partial<GateFields> {
  const e = previous?.evidence;
  if (!e?.adversarial) return {};
  const sha = createHash("sha256").update(finalSql).digest("hex");
  if (e.adversarial.conversionSha256 !== sha) return {};
  const out: Partial<GateFields> = { adversarial: e.adversarial };
  if (e.step5Method) out.step5Method = e.step5Method;
  if (e.step5Report) out.step5Report = e.step5Report;
  if (e.step5EvidenceSha256) out.step5EvidenceSha256 = e.step5EvidenceSha256;
  if (e.step5Confirmed) out.step5Confirmed = e.step5Confirmed;
  return out;
}
