/**
 * Validates a pair record JSON file against the PairRecord schema.
 * Called by the Kiro hook validate-pair-record on PostFileSave.
 *
 * Usage: node dist/cli/validate-pair.js <path-to-pair.json>
 * Exit 0 = valid, Exit 1 = validation errors
 */

import { readFileSync, existsSync } from "fs";
import type { PairRecord, StepStatus } from "../pairs/schema.js";

const VALID_STEP_STATUSES: StepStatus[] = ["pass", "fail", "not-run", "n/a"];
const VALID_STATUSES = ["pending", "failed", "verified"] as const;
const VALID_CLASSES = ["procedure", "function", "view", "trigger"] as const;
const VALID_TIERS = ["simple", "medium", "complex"] as const;
const VALID_CONV_TYPES = ["tsql-to-plpgsql"] as const;

function validatePairRecord(record: unknown): string[] {
  const errors: string[] = [];

  if (!record || typeof record !== "object") {
    return ["File does not contain a JSON object"];
  }

  const r = record as Record<string, unknown>;

  // Required top-level fields
  if (!r["conversionType"] || !VALID_CONV_TYPES.includes(r["conversionType"] as typeof VALID_CONV_TYPES[number])) {
    errors.push(`conversionType must be one of: ${VALID_CONV_TYPES.join(", ")}`);
  }
  if (!r["objectClass"] || !VALID_CLASSES.includes(r["objectClass"] as typeof VALID_CLASSES[number])) {
    errors.push(`objectClass must be one of: ${VALID_CLASSES.join(", ")}`);
  }
  if (!r["tier"] || !VALID_TIERS.includes(r["tier"] as typeof VALID_TIERS[number])) {
    errors.push(`tier must be one of: ${VALID_TIERS.join(", ")}`);
  }
  if (!r["status"] || !VALID_STATUSES.includes(r["status"] as typeof VALID_STATUSES[number])) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  // origin
  if (!r["origin"]) {
    errors.push("origin is required");
  } else if (r["origin"] !== "synthetic") {
    const o = r["origin"] as Record<string, unknown>;
    for (const field of ["repo", "release", "license", "assetUrl", "sha256"]) {
      if (!o[field]) errors.push(`origin.${field} is required`);
    }
  }

  // code
  if (!r["code"] || typeof r["code"] !== "object") {
    errors.push("code is required");
  } else {
    const c = r["code"] as Record<string, unknown>;
    for (const field of ["source", "engineOutput", "final", "diff", "engine"]) {
      if (c[field] === undefined || c[field] === null) {
        errors.push(`code.${field} is required`);
      }
    }
  }

  // evidence
  if (!r["evidence"] || typeof r["evidence"] !== "object") {
    errors.push("evidence is required");
  } else {
    const e = r["evidence"] as Record<string, unknown>;
    for (const step of ["step1", "step2", "step3", "step4", "step5", "step6"]) {
      if (!VALID_STEP_STATUSES.includes(e[step] as StepStatus)) {
        errors.push(`evidence.${step} must be one of: ${VALID_STEP_STATUSES.join(", ")} (got: ${e[step]})`);
      }
    }
    if (!e["harnessVersion"]) {
      errors.push("evidence.harnessVersion is required");
    }
    // Consistency: status=verified requires all steps 1-4 = pass
    if (r["status"] === "verified") {
      for (const step of ["step1", "step2", "step3", "step4"]) {
        if (e[step] !== "pass") {
          errors.push(`status is "verified" but evidence.${step} is "${e[step]}" — all steps 1-4 must be "pass" for verified status`);
        }
      }
    }
  }

  // effort
  if (!r["effort"] || typeof r["effort"] !== "object") {
    errors.push("effort is required");
  } else {
    const ef = r["effort"] as Record<string, unknown>;
    if (typeof ef["humanMinutes"] !== "number") errors.push("effort.humanMinutes must be a number");
    if (!ef["engineName"]) errors.push("effort.engineName is required");
    if (!ef["engineVersion"]) errors.push("effort.engineVersion is required");
  }

  return errors;
}

function main(): void {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Usage: validate-pair <path-to-pair.json>");
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let record: unknown;
  try {
    record = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error(`Invalid JSON in ${filePath}: ${e}`);
    process.exit(1);
  }

  const errors = validatePairRecord(record);

  if (errors.length === 0) {
    console.log(`✓ ${filePath} — pair record valid`);
    process.exit(0);
  } else {
    console.error(`✗ ${filePath} — ${errors.length} validation error(s):`);
    for (const err of errors) {
      console.error(`  · ${err}`);
    }
    process.exit(1);
  }
}

main();
