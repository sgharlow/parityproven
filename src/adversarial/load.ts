/** Read and validate attacker (cases.json) and auditor (audit.json) files. Fails early, with the reason, on anything the runner could not use. */
import { readFileSync } from "fs";
import type { ObjectSpec, Row } from "../harness/generic/spec.js";
import { inputCell } from "../agreed/generate.js";
import { TRAP_IDS, type AdversarialCase, type AdversarialFile, type AuditFile, type ModelStamp, type Objection, type ObjectionKind, type TrapId } from "./schema.js";

const OBJECTION_KINDS: ObjectionKind[] = ["not-an-attack", "trap-uncovered", "label-mismatch", "duplicate", "weak", "other"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function fail(where: string, msg: string): never {
  throw new Error(`${where}: ${msg}`);
}

function str(where: string, v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") fail(where, `${name} must be a non-empty string`);
  return v;
}

function stamp(where: string, v: unknown, name: string): ModelStamp {
  if (!isObj(v)) fail(where, `${name} must be an object with model and at`);
  const at = str(where, v.at, `${name}.at`);
  if (Number.isNaN(Date.parse(at))) fail(where, `${name}.at is not a timestamp`);
  return { model: str(where, v.model, `${name}.model`), at };
}

function trapList(where: string, v: unknown, name: string): TrapId[] {
  if (!Array.isArray(v)) fail(where, `${name} must be an array`);
  return v.map((t) => {
    if (!TRAP_IDS.includes(t as TrapId)) fail(where, `${name}: unknown trap ${JSON.stringify(t)} (use ${TRAP_IDS.join(", ")})`);
    return t as TrapId;
  });
}

/** {"$hex":"..."} -> Uint8Array, recursively. */
export function reviveBytes(v: unknown, where = "value"): unknown {
  if (Array.isArray(v)) return v.map((x) => reviveBytes(x, where));
  if (isObj(v)) {
    if (Object.keys(v).length === 1 && "$hex" in v) {
      const hex = v.$hex;
      if (typeof hex !== "string" || !/^([0-9a-fA-F]{2})*$/.test(hex)) fail(where, `bad {"$hex"} value`);
      return new Uint8Array(Buffer.from(hex, "hex"));
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reviveBytes(x, where)]));
  }
  return v;
}

/** Validate a parsed cases file against the object's spec. */
export function parseCases(json: unknown, spec: ObjectSpec, source = "cases.json"): AdversarialFile {
  const qualified = `${spec.schema}.${spec.name}`;
  if (!isObj(json)) fail(source, "must be an object");
  if (json.schemaVersion !== 1) fail(source, "schemaVersion must be 1");
  if (json.object !== qualified) fail(source, `object is ${JSON.stringify(json.object)}, expected ${qualified}`);
  if (json.database !== spec.database) fail(source, `database is ${JSON.stringify(json.database)}, expected ${spec.database}`);
  const attacker = stamp(source, json.attacker, "attacker");

  let notApplicable: AdversarialFile["notApplicable"];
  if (json.notApplicable !== undefined) {
    if (!isObj(json.notApplicable)) fail(source, "notApplicable must be an object");
    notApplicable = {};
    for (const [k, v] of Object.entries(json.notApplicable)) {
      trapList(source, [k], "notApplicable key");
      notApplicable[k as TrapId] = str(source, v, `notApplicable.${k}`);
    }
  }

  if (!Array.isArray(json.cases) || json.cases.length === 0) fail(source, "cases must be a non-empty array");
  const ids = new Set<string>();
  const labels = new Set<string>();
  const cases = json.cases.map((raw, n): AdversarialCase => {
    const w = `${source} case #${n + 1}`;
    if (!isObj(raw)) fail(w, "must be an object");
    const id = str(w, raw.id, "id");
    if (!/^A\d{2,}$/.test(id)) fail(w, `id ${JSON.stringify(id)} must look like A01`);
    if (ids.has(id)) fail(w, `duplicate id ${id}`);
    ids.add(id);
    const label = str(w, raw.label, "label");
    if (labels.has(label)) fail(w, `duplicate label ${JSON.stringify(label)}`);
    labels.add(label);
    const traps = trapList(w, raw.traps, "traps");
    const reasoning = str(w, raw.reasoning, "reasoning");
    if (raw.regression !== undefined && typeof raw.regression !== "boolean") fail(w, "regression must be a boolean");
    if (!isObj(raw.fixedCase)) fail(w, "fixedCase must be an object");
    const fc = raw.fixedCase;
    if (!isObj(fc.tables)) fail(w, "fixedCase.tables must be an object (use {} when the object reads no table)");
    const tables: Record<string, Row[]> = {};
    for (const [key, rows] of Object.entries(fc.tables)) {
      const ts = spec.tables.find((t) => `${t.schema}.${t.name}` === key);
      if (!ts) fail(w, `table ${key} is not in the spec (${spec.tables.map((t) => `${t.schema}.${t.name}`).join(", ") || "none"})`);
      if (!Array.isArray(rows)) fail(w, `table ${key} must be an array of rows`);
      tables[key] = rows.map((row, ri) => {
        if (!isObj(row)) fail(w, `${key} row ${ri + 1} must be an object`);
        const out: Row = {};
        for (const [col, val] of Object.entries(row)) {
          const cs = ts.columns.find((c) => c.name === col);
          if (!cs) fail(w, `${key} row ${ri + 1}: unknown column ${col}`);
          const revived = reviveBytes(val, w);
          try {
            inputCell(revived, cs.type);
          } catch (e) {
            fail(w, `${key} row ${ri + 1}, column ${col}: ${(e as Error).message}`);
          }
          out[col] = revived;
        }
        return out;
      });
    }
    let args: unknown[] | undefined;
    if (fc.args !== undefined) {
      if (!Array.isArray(fc.args)) fail(w, "fixedCase.args must be an array");
      args = fc.args.map((a, i) => {
        const p = spec.params?.[i];
        if (!p) fail(w, `argument ${i + 1} has no parameter in the spec`);
        const revived = reviveBytes(a, w);
        try {
          inputCell(revived, p.type);
        } catch (e) {
          fail(w, `argument ${i + 1}: ${(e as Error).message}`);
        }
        return revived;
      });
    }
    let cutoffs: { last: string; new: string } | undefined;
    if (fc.cutoffs !== undefined) {
      if (!spec.windowParams) fail(w, "this object has no cutoff parameters");
      if (!isObj(fc.cutoffs)) fail(w, "cutoffs must be an object with last and new");
      cutoffs = { last: str(w, fc.cutoffs.last, "cutoffs.last"), new: str(w, fc.cutoffs.new, "cutoffs.new") };
    } else if (spec.windowParams) {
      fail(w, "this object takes cutoffs: add fixedCase.cutoffs");
    }
    return {
      id, label, traps, reasoning,
      ...(raw.regression ? { regression: true } : {}),
      fixedCase: { label, ...(cutoffs ? { cutoffs } : {}), ...(args ? { args } : {}), tables },
    };
  });
  return { schemaVersion: 1, object: qualified, database: spec.database, attacker, ...(notApplicable ? { notApplicable } : {}), cases };
}

export function loadCases(path: string, spec: ObjectSpec): AdversarialFile {
  return parseCases(JSON.parse(readFileSync(path, "utf-8")) as unknown, spec, path);
}

export function parseAudit(json: unknown, spec: ObjectSpec, source = "audit.json"): AuditFile {
  const qualified = `${spec.schema}.${spec.name}`;
  if (!isObj(json)) fail(source, "must be an object");
  if (json.schemaVersion !== 1) fail(source, "schemaVersion must be 1");
  if (json.object !== qualified) fail(source, `object is ${JSON.stringify(json.object)}, expected ${qualified}`);
  if (json.database !== spec.database) fail(source, `database is ${JSON.stringify(json.database)}, expected ${spec.database}`);
  const auditor = stamp(source, json.auditor, "auditor");
  if (!Array.isArray(json.casesAudited) || json.casesAudited.some((x) => typeof x !== "string")) fail(source, "casesAudited must be an array of case ids");
  const acceptedNotApplicable = trapList(source, json.acceptedNotApplicable, "acceptedNotApplicable");
  if (!Array.isArray(json.equivalentMutants)) fail(source, "equivalentMutants must be an array");
  const equivalentMutants = json.equivalentMutants.map((m, i) => {
    if (!isObj(m)) fail(source, `equivalentMutants[${i}] must be an object`);
    return { name: str(source, m.name, `equivalentMutants[${i}].name`), reason: str(source, m.reason, `equivalentMutants[${i}].reason`) };
  });
  if (!Array.isArray(json.objections)) fail(source, "objections must be an array");
  const seen = new Set<string>();
  const objections = json.objections.map((o, i): Objection => {
    const w = `${source} objection #${i + 1}`;
    if (!isObj(o)) fail(w, "must be an object");
    const id = str(w, o.id, "id");
    if (seen.has(id)) fail(w, `duplicate id ${id}`);
    seen.add(id);
    if (!OBJECTION_KINDS.includes(o.kind as ObjectionKind)) fail(w, `kind must be one of ${OBJECTION_KINDS.join(", ")}`);
    if (o.status !== "open" && o.status !== "resolved") fail(w, 'status must be "open" or "resolved"');
    return {
      id,
      ...(o.caseId !== undefined ? { caseId: str(w, o.caseId, "caseId") } : {}),
      kind: o.kind as ObjectionKind,
      text: str(w, o.text, "text"),
      status: o.status,
      ...(o.resolution !== undefined ? { resolution: str(w, o.resolution, "resolution") } : {}),
      ...(o.confirmedBy !== undefined ? { confirmedBy: stamp(w, o.confirmedBy, "confirmedBy") } : {}),
    };
  });
  return { schemaVersion: 1, object: qualified, database: spec.database, auditor, casesAudited: json.casesAudited as string[], acceptedNotApplicable, equivalentMutants, objections };
}

export function loadAudit(path: string, spec: ObjectSpec): AuditFile {
  return parseAudit(JSON.parse(readFileSync(path, "utf-8")) as unknown, spec, path);
}
